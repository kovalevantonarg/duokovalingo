# Разбор: Structured output

Что строим: функцию, которая из свободного текста (письмо клиента про возврат) достаёт объект строго заданной формы, например `{ order_id, amount, reason, purchased_at }`, чтобы дальше его взял обычный код: создал возврат в базе, отправил в CRM. Модель пишет текст, а коду нужен объект, которому можно доверять. Structured output (структурированный вывод) это как раз приёмы, которые превращают «модель что-то ответила» в «у меня типизированный объект или понятная ошибка».

Ментальная модель. Мы объявляем модели один tool (инструмент) со схемой аргументов и через `tool_choice` (какой инструмент модель обязана выбрать) запрещаем ей отвечать чем-то, кроме вызова этого инструмента. Исполнять инструмент мы не будем: аргументы вызова и есть нужный JSON. Модели на слово мы не верим и прогоняем аргументы через zod. Не прошло: возвращаем модели ошибку с именем поля и даём ещё попытку, но не больше `maxAttempts`.

Если ты делал формы на React, это знакомо: схема как у формы, `safeParse` как валидация на сабмите, а сообщение `purchased_at: purchase date cannot be in the future` это текст ошибки под полем. Только «пользователь», который исправляет форму, здесь модель.

Одна попытка выглядит так:

```ts
const request = {
  tools: [{ name: 'record_refund', description: 'Record a refund request', input_schema: { type: 'object' } }],
  tool_choice: { type: 'tool', name: 'record_refund' },
  messages: [{ role: 'user', content: 'email text…' }],
}
const response = {
  stop_reason: 'tool_use',
  content: [
    { type: 'tool_use', id: 'toolu_X', name: 'record_refund', input: { order_id: '#W7', amount: 49.9, reason: 'damaged', purchased_at: '2026-10-01' } },
  ],
}
```

## Шаг 1. Инструмент из zod-схемы и принудительный вызов

Схема у нас одна, zod-объект `o.schema`. Из него же делаем JSON Schema (стандартный формат описания структуры JSON, его ждёт поле `input_schema`) через `z.toJSONSchema`. Так тип в TypeScript и схема, которую видит модель, не могут разъехаться: поменял поле в zod, поменялось везде. `tool_choice: { type: 'tool', name }` заставляет модель ответить вызовом именно этого инструмента. Без него модель вправе ответить текстом вроде «Конечно, вот JSON», и парсить такое регуляркой в проде никто не хочет.

```ts
const tool: Anthropic.Tool = {
  name: o.name,
  description: o.description,
  input_schema: z.toJSONSchema(o.schema) as Anthropic.Tool.InputSchema,
}
const messages: Anthropic.MessageParam[] = [{ role: 'user', content: o.input }]

const res = await o.client.messages.create({
  model: o.model,
  max_tokens: o.maxTokens ?? 1024,
  tools: [tool],
  tool_choice: { type: 'tool', name: o.name },
  messages,
})
```

**Зеленеют тесты:** «запрос: один инструмент со схемой и tool_choice».

**Ловушка:** считать, что схема в запросе что-то проверяет. Это подсказка модели, а не валидация: модель всё ещё может прислать отрицательную сумму или дату из будущего.

## Шаг 2. Цикл попыток и счастливый путь

Заворачиваем вызов в цикл `for` по попыткам: попытка это один запрос к модели. Ответ модели сразу кладём в историю `messages`, на шаге 3 станет ясно зачем. В `res.content` ищем блок `tool_use` с нашим именем: type guard (функция-предикат, которая сужает тип) `b is Anthropic.ToolUseBlock` даёт нормальный тип без `as`. Аргументы `call.input` прогоняем через `o.schema.safeParse`: он не бросает, а возвращает `{ success, data }` или `{ success, error }`. Успех: отдаём данные и номер попытки.

```ts
const maxAttempts = o.maxAttempts ?? 3

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const res = await o.client.messages.create({
    model: o.model,
    max_tokens: o.maxTokens ?? 1024,
    tools: [tool],
    tool_choice: { type: 'tool', name: o.name },
    messages,
  })
  messages.push({ role: 'assistant', content: res.content })
  const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === o.name)
  if (!call) continue // шаг 5

  const parsed = o.schema.safeParse(call.input)
  if (parsed.success) return { data: parsed.data, attempts: attempt }
}
```

**Зеленеют тесты:** «валидно с первого раза → данные типизированы, attempts = 1».

**Ловушка:** написать `call.input as Refund`. Каст это обещание компилятору, а не проверка: в рантайме туда приедет что угодно, и упадёт уже код, который создаёт возврат.

## Шаг 3. Ошибка валидации уходит обратно модели

Главная идея лабы: валидный JSON ещё не значит правильные данные. В тестовой схеме `purchased_at` проходит `z.iso.date()`, но `refine` (дополнительное правило поверх типа) режет дату из будущего. Такую ошибку модель может исправить, если сказать ей, какое поле и что не так. Поэтому из `parsed.error.issues` собираем строки вида `путь: сообщение`. Отправляем их как `tool_result` (ответ на вызов инструмента) с `is_error: true` и `tool_use_id`, равным `id` того вызова, на который отвечаем. Для модели это выглядит как «инструмент ответил ошибкой», и следующий вызов она делает с поправкой.

```ts
lastProblem = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
messages.push({
  role: 'user',
  content: [
    {
      type: 'tool_result',
      tool_use_id: call.id,
      is_error: true,
      content: `Validation failed: ${lastProblem}. Fix these fields and call the tool again.`,
    },
  ],
})
```

**Зеленеют тесты:** «не прошло схему → ошибки валидации уходят модели как tool_result is_error, вторая попытка успешна».

**Ловушка:** не положить ответ модели в историю (тот `push` из шага 2). Тогда `tool_result` ссылается на `tool_use`, которого в истории нет, и API отвечает 400. Вторая ловушка: слать «Invalid JSON» без полей. Чинить вслепую модель не умеет.

## Шаг 4. Потолок попыток

Если модель три раза подряд не справилась с одним и тем же полем, четвёртая попытка обычно даёт то же самое, а каждая попытка это полный запрос с растущей историей, то есть деньги и секунды. Цикл `for` уже ограничен `maxAttempts`. Осталось после цикла бросить понятную ошибку. В `lastProblem` лежит причина последней неудачи, её кладём в сообщение: человек, который откроет лог, должен сразу увидеть поле.

```ts
let lastProblem = ''

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  // запрос, разбор, tool_result с ошибкой: шаги 1-3
}
throw new ExtractionError(`Extraction failed after ${maxAttempts} attempts. Last problem: ${lastProblem}`, maxAttempts)
```

**Зеленеют тесты:** «модель упорно ошибается → ExtractionError после maxAttempts, лишних вызовов нет».

**Ловушка:** `while (true)` до успеха. На тестах всё зелёное, а в проде один кривой документ крутит цикл и счёт.

## Шаг 5. Ответ текстом вместо вызова

Даже с `tool_choice` стоит обрабатывать ответ без `tool_use`: например, `tool_choice` потерялся при рефакторинге. Это неудачная попытка, но `tool_result` здесь слать нельзя: ему не на что ссылаться, API ответит 400. Поэтому просим обычным user-сообщением с текстом и идём на следующую попытку. Чередование ролей не ломается: ответ модели (assistant) уже в истории, следом идёт наш user.

```ts
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  // запрос и push ответа модели: шаги 1-2
  if (!call) {
    lastProblem = 'model answered with text instead of calling the tool'
    messages.push({ role: 'user', content: `Respond only by calling the ${o.name} tool.` })
    continue
  }
  // safeParse: шаги 2-3
}
```

**Зеленеют тесты:** «ответ без tool_use (только текст) → считается неудачной попыткой, ретрай просит вызвать инструмент».

## Шаг 6. max_tokens: сразу ошибка, без ретрая

`stop_reason` (почему модель остановилась) равен `max_tokens`, если ответ упёрся в лимит токенов. Тогда аргументы вызова обрезаны на середине. Повтор с тем же лимитом оборвётся там же, ты просто заплатишь дважды. Проверяем это первым делом после ответа, до разбора. Эталон так же обрабатывает `model_context_window_exceeded` (кончилось контекстное окно): повтор с той же историей упрётся туда же.

```ts
const res = await o.client.messages.create({
  model: o.model,
  max_tokens: o.maxTokens ?? 1024,
  tools: [tool],
  tool_choice: { type: 'tool', name: o.name },
  messages,
})
if (res.stop_reason === 'max_tokens' || res.stop_reason === 'model_context_window_exceeded') throw new TruncatedError()
```

**Зеленеют тесты:** «stop_reason max_tokens → TruncatedError сразу, без ретрая с тем же лимитом».

**Ловушка:** проверить `stop_reason` после `safeParse`. Обрезанный объект не пройдёт схему (полей не хватает), код отправит `tool_result` и честно сделает ещё две обречённые попытки.

## Собираем целиком

Всё вместе, это ровно `labs/solutions/extract.ts` с комментариями.

```ts
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { LLM } from '../shared/fake-client'

export class ExtractionError extends Error {
  constructor(message: string, public attempts: number) {
    super(message)
    this.name = 'ExtractionError'
  }
}

export class TruncatedError extends Error {
  constructor() {
    super('Output was cut by max_tokens: raise the limit or shrink the schema, retrying as-is will fail again')
    this.name = 'TruncatedError'
  }
}

export type ExtractOptions<S extends z.ZodType> = {
  client: LLM
  model: string
  schema: S
  name: string
  description: string
  input: string
  maxAttempts?: number
  maxTokens?: number
}

export async function extract<S extends z.ZodType>(o: ExtractOptions<S>): Promise<{ data: z.infer<S>; attempts: number }> {
  const maxAttempts = o.maxAttempts ?? 3
  // одна схема на всё: zod для проверки у нас, JSON Schema как подсказка модели
  const tool: Anthropic.Tool = {
    name: o.name,
    description: o.description,
    input_schema: z.toJSONSchema(o.schema) as Anthropic.Tool.InputSchema,
  }
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: o.input }]
  let lastProblem = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await o.client.messages.create({
      model: o.model,
      max_tokens: o.maxTokens ?? 1024,
      tools: [tool],
      tool_choice: { type: 'tool', name: o.name }, // ответить можно только вызовом
      messages,
    })
    // обрезанный ответ не чинится повтором с тем же лимитом
    if (res.stop_reason === 'max_tokens' || res.stop_reason === 'model_context_window_exceeded') throw new TruncatedError()

    // в историю до tool_result: иначе tool_result сошлётся на невидимый tool_use
    messages.push({ role: 'assistant', content: res.content })
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === o.name)

    if (!call) {
      // tool_use нет, tool_result ссылаться не на что: просим обычным текстом
      lastProblem = 'model answered with text instead of calling the tool'
      messages.push({ role: 'user', content: `Respond only by calling the ${o.name} tool.` })
      continue
    }

    const parsed = o.schema.safeParse(call.input)
    if (parsed.success) return { data: parsed.data, attempts: attempt }

    // "purchased_at: purchase date cannot be in the future" модель починить может, "Invalid JSON" нет
    lastProblem = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `Validation failed: ${lastProblem}. Fix these fields and call the tool again.` }],
    })
  }
  throw new ExtractionError(`Extraction failed after ${maxAttempts} attempts. Last problem: ${lastProblem}`, maxAttempts)
}
```

## Как рассказать на интервью

Сценарий: 1 из 200 извлечений падает с `ExtractionError`, продакт просит поднять `maxAttempts` до 10.

- Сначала смотрю, на чём падает. В `ExtractionError` лежит последняя проблема с путём поля, группирую логи по полю и правилу. Обычно это одна-две причины, а не шум.
- Ретрай работает, когда модель ошиблась случайно и по сообщению «поле: что не так» может исправиться. Если она трижды подряд не смогла, попытки с 4 по 10 почти всегда дают то же самое, а каждая это полный запрос с растущей историей: в худшем случае латентность и цена этого запроса растут в разы.
- Частая причина в самих данных: в письме нет даты покупки или там два заказа. Тогда фикс в схеме и процессе: разрешить «не знаю» (nullable поле, то есть допускающее null, или reason 'other') и отправлять такие письма человеку в очередь, а не крутить ретраи.
- Если причина в схеме: улучшаю description полей, enum, формат. Это двигает процент ошибок, `maxAttempts` не двигает.
- `TruncatedError` считаю отдельно: это лимит `max_tokens` или слишком большая схема, ретрай там бесполезен по определению.
- И главное: 0.5% громких ошибок лучше, чем тихо неправильные данные. Даже со strict structured outputs, где схема соблюдается на уровне декодирования, `refine`-правила вроде «дата не в будущем» остаются на мне, так что этот цикл с обратной связью никуда не девается.
