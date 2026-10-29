# Разбор: Tool loop

Строим агентный цикл (agent loop): функцию `runAgent`, которая гоняет диалог между моделью и твоими функциями-инструментами (tools). Модель сама ничего не исполняет. Она возвращает блок `tool_use` (просьба вызвать инструмент с такими-то аргументами), ты вызываешь функцию у себя и отправляешь ответ блоком `tool_result` (результат вызова). Так устроен любой агент поддержки, который смотрит заказы в базе, и любой coding-агент.

Ментальная модель: это `while (true)` вокруг `client.messages.create`. На каждом круге смотришь на `stop_reason` (почему модель остановилась): `end_turn` значит ответ закончен, `tool_use` значит модель ждёт результатов инструментов, `max_tokens` значит ответ обрезан по лимиту токенов. Вся память агента это массив `messages`: история пересылается целиком каждый ход, поэтому input (входные токены) растёт с каждым кругом.

Один круг в истории выглядит так: вопрос пользователя, ответ ассистента с текстом и `tool_use`, затем твоё user-сообщение с `tool_result`, у которого `tool_use_id` совпадает с `id` вызова.

```ts
const round: Anthropic.MessageParam[] = [
  { role: 'user', content: 'where is #W1?' },
  {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Let me check.' },
      { type: 'tool_use', id: 'toolu_A', name: 'get_order', input: { order_id: '#W1' } },
    ],
  },
  {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'toolu_A', content: '{"order_id":"#W1","status":"delivered"}' }],
  },
]
```

На входе `RunOptions`: клиент, модель, инструменты как объект `имя → { description, input (zod-схема), run }`, стартовая история и лимиты. На выходе `RunResult`: почему остановились (`reason`), текст последнего ответа, вся история, число ходов и сумма usage (расход токенов) по всем ходам.

## Шаг 1. Описываем инструменты для API

Модель узнаёт об инструментах из поля `tools` запроса: имя, описание и `input_schema` в формате JSON Schema (стандартное описание формы JSON). У нас схема уже есть в zod, поэтому конвертируем её через `z.toJSONSchema`, а не пишем вторую руками. Одна схема на всё: та же zod-схема на шаге 4 будет проверять аргументы. Делаем это один раз до цикла, а не на каждом ходу.

```ts
const toolDefs: Anthropic.Tool[] = Object.entries(tools).map(([name, t]) => ({
  name,
  description: t.description,
  input_schema: z.toJSONSchema(t.input) as Anthropic.Tool.InputSchema,
}))
```

**Зеленеют тесты:** пока ни одного, модель ещё не вызывается; «отправляет tools с JSON Schema из zod» загорится на следующем шаге.

**Ловушка:** JSON Schema руками рядом с zod. Через месяц кто-то поменяет одну из двух, и модель будет слать аргументы, которые твоя валидация отвергает.

## Шаг 2. Состояние и один ход модели

Заводим состояние цикла: копию истории (чужой массив не мутируем, вызывающий код может его переиспользовать), счётчики usage и ходов, текст последнего ответа. Функция `done` собирает результат из текущего состояния, чтобы каждый выход из цикла был одной строкой. Ответ ассистента кладём в историю ровно как пришёл: `res.content` целиком, с текстом и `tool_use` в исходном порядке. `max_tokens` в запросе ставим всегда, с дефолтом 1024. Пустой массив `tools` не шлём.

```ts
const messages = [...o.messages]
const usage = { input: 0, output: 0 }
let turns = 0
let lastText = ''
const done = (reason: StopReason): RunResult => ({ reason, text: lastText, messages, turns, usage })

while (true) {
  const res = await client.messages.create({
    model: o.model,
    max_tokens: o.maxTokens ?? 1024,
    ...(o.system ? { system: o.system } : {}),
    ...(toolDefs.length ? { tools: toolDefs } : {}),
    messages,
  })
  turns++
  usage.input += res.usage.input_tokens
  usage.output += res.usage.output_tokens
  messages.push({ role: 'assistant', content: res.content })
  lastText = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  if (res.stop_reason !== 'tool_use') return done('end_turn') // временно, на шаге 5 станет switch
}
```

**Зеленеют тесты:** «отправляет tools с JSON Schema из zod».

**Ловушка:** положить в историю только текст (`content: lastText`). Модель теряет собственные рассуждения, а без `tool_use` в истории API вернёт 400 на следующий `tool_result`.

## Шаг 3. Исполняем инструменты: все результаты в одно user-сообщение

Если `stop_reason` равен `tool_use`, достаём из ответа все блоки `tool_use`. Их может быть несколько: модель умеет просить два инструмента в одном ответе. Запускаем их параллельно через `Promise.all`: он возвращает результаты в порядке входного массива, даже если второй инструмент закончил раньше первого. Все `tool_result` уходят одним user-сообщением. `execute` пока простой: найти инструмент, вызвать, не-строковый результат сериализовать в JSON.

```ts
// в цикле, после проверки stop_reason
const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
const results = await Promise.all(calls.map((c) => execute(c, tools)))
messages.push({ role: 'user', content: results })

// отдельная функция; на шаге 4 обрастёт обработкой ошибок
async function execute(call: Anthropic.ToolUseBlock, tools: Record<string, Tool<any>>): Promise<Anthropic.ToolResultBlockParam> {
  const out = await tools[call.name]!.run(call.input, {})
  return { type: 'tool_result', tool_use_id: call.id, content: typeof out === 'string' ? out : JSON.stringify(out) }
}
```

**Зеленеют тесты:** «happy path», «историю не мутирует», «суммирует usage по всем ходам», «два tool_use в одном ответе».

**Ловушка:** каждый `tool_result` отдельным user-сообщением или в порядке завершения. Разложишь по разным сообщениям, получишь 400.

## Шаг 4. Ошибка инструмента это данные, а не исключение

Всё, что может пойти не так с вызовом, превращаем в `tool_result` с `is_error: true` и понятным текстом: неизвестное имя (перечисляем доступные, чтобы модель выбрала правильно), аргументы не прошли zod (пишем, какое поле и что не так), инструмент бросил исключение (отдаём его message). Модель прочитает это и исправится, например переспросит номер заказа. Схема в запросе только подсказка модели, а не гарантия, поэтому `safeParse` обязателен, и в `run` уходит уже проверенный `parsed.data`.

```ts
const err = (content: string): Anthropic.ToolResultBlockParam => ({ type: 'tool_result', tool_use_id: call.id, is_error: true, content })
const tool = tools[call.name]
if (!tool) return err(`Unknown tool "${call.name}". Available: ${Object.keys(tools).join(', ') || 'none'}`)

const parsed = tool.input.safeParse(call.input)
if (!parsed.success) {
  const issues = parsed.error.issues.map((i: { path: PropertyKey[]; message: string }) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
  return err(`Invalid input: ${issues}`)
}
try {
  const out = await tool.run(parsed.data, {}) // signal добавим на шаге 7
  return { type: 'tool_result', tool_use_id: call.id, content: typeof out === 'string' ? out : JSON.stringify(out) }
} catch (e) {
  return err(`Error: ${(e as Error).message}`)
}
```

**Зеленеют тесты:** «неизвестный инструмент», «аргументы не прошли схему», «инструмент бросил исключение», «один из параллельных упал».

**Ловушка:** дать исключению вылететь из `execute`. Тогда `Promise.all` отклоняется целиком, теряются и соседние результаты, и весь цикл. Упавший цикл ничего не исправит.

## Шаг 5. Решаем по stop_reason, а не по содержимому

Временную строчку из шага 2 заменяем на `switch`. `max_tokens` и `model_context_window_exceeded` означают обрезку: JSON аргументов в последнем `tool_use` мог оборваться, исполнять такой вызов нельзя (в лучшем случае упадёт парсинг, в худшем отменишь не тот заказ). Наружу оба отдаём как `max_tokens`. `refusal` это отказ модели, тоже стоп. Только `tool_use` ведёт к исполнению инструментов, всё остальное считаем нормальным концом.

```ts
switch (res.stop_reason) {
  case 'max_tokens':
  case 'model_context_window_exceeded':
    return done('max_tokens')
  case 'refusal':
    return done('refusal')
  case 'tool_use':
    break
  default:
    return done('end_turn')
}
```

**Зеленеют тесты:** «max_tokens при недописанном tool_use», «model_context_window_exceeded», «refusal».

**Ловушка:** решать по `content.some((b) => b.type === 'tool_use')`. В обрезанном ответе блок `tool_use` есть, но он недописан.

## Шаг 6. Потолок ходов и детект повтора

Зациклившийся агент жжёт деньги молча. Потолок ходов проверяем в начале круга, до вызова модели: так `maxTurns: 3` даёт ровно три запроса. Детект повтора ловит тупую петлю: тот же инструмент с теми же аргументами. Ключ это имя плюс `JSON.stringify(input)`, считаем в `Map`. Проверка стоит до исполнения, поэтому третий одинаковый вызов (при `maxRepeats = 2`) уже не исполняется.

```ts
const maxTurns = o.maxTurns ?? 10
const maxRepeats = o.maxRepeats ?? 2
const callCounts = new Map<string, number>()

// в начале каждого круга
if (turns >= maxTurns) return done('max_turns')

// после switch, перед Promise.all
for (const c of calls) {
  const key = `${c.name}:${JSON.stringify(c.input)}`
  const n = (callCounts.get(key) ?? 0) + 1
  callCounts.set(key, n)
  if (n > maxRepeats) return done('loop_detected')
}
```

**Зеленеют тесты:** «потолок ходов», «зацикливание».

**Ловушка:** проверять `turns > maxTurns` после вызова модели. Получишь лишний платный запрос сверх лимита.

## Шаг 7. Отмена

Пользователь нажал Stop. Нужно три вещи. В начале круга проверяем `signal.aborted` и выходим с `aborted`, не вызывая модель. Тот же `signal` передаём вторым аргументом в `messages.create`, чтобы оборвать уже идущий запрос; если он оборвался, ловим ошибку и тоже возвращаем `aborted`, а любую другую ошибку пробрасываем дальше. И передаём `signal` в `run` инструмента, чтобы он остановил свои запросы: у `execute` появляется третий параметр `signal?: AbortSignal`, вызов становится `execute(c, tools, signal)`, а внутри `tool.run(parsed.data, { signal })`.

```ts
while (true) {
  if (signal?.aborted) return done('aborted')
  if (turns >= maxTurns) return done('max_turns')

  let res: Anthropic.Message
  try {
    res = await client.messages.create({ model: o.model, max_tokens: o.maxTokens ?? 1024, messages }, { signal })
  } catch (e) {
    if (signal?.aborted || (e as Error).name === 'AbortError') return done('aborted')
    throw e
  }
  // дальше как раньше: usage, история, switch, инструменты
}
```

В сниппете параметры запроса сокращены для читаемости; полный вариант ниже.

**Зеленеют тесты:** «пользователь нажал Stop во время инструмента», «signal передаётся и в модель, и в инструмент».

**Ловушка:** в `catch` возвращать `aborted` на любую ошибку. Тогда настоящий сбой API выглядит как «пользователь сам нажал Stop», и ты его никогда не увидишь в мониторинге. Отменой считаем только `signal.aborted` или `AbortError`, остальное пробрасываем.

## Собираем целиком

Это эталон из `solutions/tool-loop.ts` с комментариями, поведение то же.

```ts
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { LLM } from '../shared/fake-client'

export type Tool<S extends z.ZodType> = {
  description: string
  input: S
  run: (input: z.infer<S>, ctx: { signal?: AbortSignal }) => Promise<unknown>
}

export type StopReason = 'end_turn' | 'max_turns' | 'max_tokens' | 'refusal' | 'aborted' | 'loop_detected'

export type RunResult = {
  reason: StopReason
  text: string
  messages: Anthropic.MessageParam[]
  turns: number
  usage: { input: number; output: number }
}

export type RunOptions = {
  client: LLM
  model: string
  system?: string
  tools: Record<string, Tool<any>>
  messages: Anthropic.MessageParam[]
  maxTurns?: number
  maxTokens?: number
  maxRepeats?: number
  signal?: AbortSignal
}

export async function runAgent(o: RunOptions): Promise<RunResult> {
  const { client, tools, signal } = o
  const maxTurns = o.maxTurns ?? 10
  const maxRepeats = o.maxRepeats ?? 2
  const messages = [...o.messages] // копия: историю вызывающего не мутируем
  const usage = { input: 0, output: 0 }
  const callCounts = new Map<string, number>() // "имя:аргументы" → сколько раз исполняли
  let turns = 0
  let lastText = ''

  // zod → JSON Schema один раз; та же zod-схема потом валидирует аргументы
  const toolDefs: Anthropic.Tool[] = Object.entries(tools).map(([name, t]) => ({
    name,
    description: t.description,
    input_schema: z.toJSONSchema(t.input) as Anthropic.Tool.InputSchema,
  }))

  const done = (reason: StopReason): RunResult => ({ reason, text: lastText, messages, turns, usage })

  while (true) {
    // стоп-проверки ДО платного вызова
    if (signal?.aborted) return done('aborted')
    if (turns >= maxTurns) return done('max_turns')

    let res: Anthropic.Message
    try {
      res = await client.messages.create(
        {
          model: o.model,
          max_tokens: o.maxTokens ?? 1024,
          ...(o.system ? { system: o.system } : {}),
          ...(toolDefs.length ? { tools: toolDefs } : {}),
          messages,
        },
        { signal },
      )
    } catch (e) {
      if (signal?.aborted || (e as Error).name === 'AbortError') return done('aborted')
      throw e
    }
    turns++
    usage.input += res.usage.input_tokens
    usage.output += res.usage.output_tokens
    messages.push({ role: 'assistant', content: res.content }) // целиком, как пришло
    lastText = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')

    switch (res.stop_reason) {
      case 'max_tokens':
      case 'model_context_window_exceeded':
        // tool_use мог оборваться на середине JSON: исполнять нельзя
        return done('max_tokens')
      case 'refusal':
        return done('refusal')
      case 'tool_use':
        break
      default:
        return done('end_turn')
    }

    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

    // детект повтора: проверяем до исполнения, чтобы лишний вызов не случился
    for (const c of calls) {
      const key = `${c.name}:${JSON.stringify(c.input)}`
      const n = (callCounts.get(key) ?? 0) + 1
      callCounts.set(key, n)
      if (n > maxRepeats) return done('loop_detected')
    }

    // параллельно, но Promise.all сохраняет порядок вызовов; все результаты одним user-сообщением
    const results = await Promise.all(calls.map((c) => execute(c, tools, signal)))
    messages.push({ role: 'user', content: results })
  }
}

// Никогда не бросает: любая проблема становится tool_result с is_error
async function execute(
  call: Anthropic.ToolUseBlock,
  tools: Record<string, Tool<any>>,
  signal?: AbortSignal,
): Promise<Anthropic.ToolResultBlockParam> {
  const err = (content: string): Anthropic.ToolResultBlockParam => ({
    type: 'tool_result',
    tool_use_id: call.id,
    is_error: true,
    content,
  })
  const tool = tools[call.name]
  if (!tool) return err(`Unknown tool "${call.name}". Available: ${Object.keys(tools).join(', ') || 'none'}`)

  // схема в запросе только подсказка модели, проверяем сами
  const parsed = tool.input.safeParse(call.input)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i: { path: PropertyKey[]; message: string }) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    return err(`Invalid input: ${issues}`)
  }
  try {
    const out = await tool.run(parsed.data, { signal })
    return { type: 'tool_result', tool_use_id: call.id, content: typeof out === 'string' ? out : JSON.stringify(out) }
  } catch (e) {
    return err(`Error: ${(e as Error).message}`)
  }
}
```

## Как рассказать на интервью

Вопрос: агент сказал клиенту «заказ отменён», а в базе он не отменён. Где ищешь и в каком порядке.

- Первым делом открываю историю этого диалога, то есть `messages`, которые вернул цикл. Ищу, был ли вообще `tool_use` с `cancel_order`. Если его нет, модель просто сказала текстом то, чего не делала, и это вопрос промпта и проверки: о действиях агент говорит только после `tool_result`.
- Если вызов был, смотрю его `tool_result`. Если там `is_error: true` (например, `order_id` без решётки не прошёл zod или база ответила таймаутом), а модель всё равно написала «отменён», значит она проигнорировала ошибку; текст ошибки должен быть однозначным, и это кейс для eval.
- Если `tool_result` успешный, проблема в инструменте: `run` вернул «ok», не проверив, что запись реально прошла, или проглотил исключение внутри. В моём цикле исключение превращается в `is_error`, но только если инструмент его не поймал сам. Лечится тем, что инструмент возвращает реальное состояние заказа после записи.
- Проверяю аргументы в `tool_use`: тот ли это заказ, о котором просил клиент. Валидация формы через zod не спасает от правильного по форме, но чужого номера.
- Смотрю `stop_reason` и причину остановки цикла: при `max_tokens` недописанный вызов не исполняется, а текст перед ним («отменяю заказ») уже мог уйти клиенту. То же при `aborted`: пользователь нажал Stop, `signal` оборвал запрос инструмента.
- В конце закрепляю регрессию тестом на фейковом клиенте: скриптую этот диалог и проверяю, что агент не говорит «отменён» без успешного `tool_result`.
