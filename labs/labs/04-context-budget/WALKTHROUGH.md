# Разбор: Context budget

Что строим: функцию, которая перед каждым запросом к модели проверяет, влезает ли история диалога в context window (контекстное окно, максимум токенов на один запрос), и если нет, аккуратно выкидывает старое. API stateless (не хранит состояние между запросами): каждый ход агента отправляет всю историю целиком, и она растёт с каждым вызовом инструмента. Через 40 минут работы агент упирается в окно, и запрос падает. `fitToBudget` это первая и самая дешёвая ступень защиты: выкинуть старое, не сломав то, что API проверяет сам.

Ментальная модель. Окно делят вход и ответ. В окно должны влезть `system` (системный промпт), все `messages` и зарезервированный `max_tokens` (сколько токенов модели разрешено написать в ответ). Если вход занял почти всё окно, на ответ места нет. Резать можно не что угодно: `tool_use` (вызов инструмента в сообщении assistant) и его `tool_result` (результат в следующем сообщении user) живут парой, и роли должны чередоваться. Задачу из первого сообщения и текущий вопрос в конце не трогаем никогда.

Как выглядит история в лабе: задача, потом пары (assistant, user), в конце текущий ход.

```ts
const history = [
  { role: 'user', content: 'TASK: refund order #W7' },
  { role: 'assistant', content: [{ type: 'tool_use', id: 't0', name: 'get_order', input: {} }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't0', content: '…' }] },
  { role: 'assistant', content: 'checking' },
  { role: 'user', content: 'and the second order?' },
]
```

На входе история и опции `{ window, maxTokens, count, system? }`, на выходе `{ messages, dropped }`: новая история и сколько сообщений выкинуто. Токены считает переданная функция `count`: в тестах это грубое «4 символа = 1 токен», в проде `messages.countTokens` или `usage.input_tokens` прошлого хода.

## Шаг 1. Сколько места на самом деле

Бюджет на историю это окно минус резерв под ответ минус system. Про `max_tokens` забывают, потому что это «выход», а он занимает то же окно. Про `system` забывают, потому что его нет в `messages`. Если уже `system` и `max_tokens` съели всё окно, резать историю бессмысленно: даже пустой запрос не влезет. Честная ошибка здесь лучше, чем запрос, который API отвергнет.

```ts
export function fitToBudget(
  messages: Anthropic.MessageParam[],
  o: BudgetOptions,
): { messages: Anthropic.MessageParam[]; dropped: number } {
  const size = (m: Anthropic.MessageParam) => o.count(JSON.stringify(m.content))
  const budget = o.window - o.maxTokens - (o.system ? o.count(o.system) : 0)
  if (budget <= 0) throw new BudgetError(`system + max_tokens already exceed the window (${budget} left)`)
  // дальше шаги 2-5
}
```

**Зеленеют тесты:** «сам system + max_tokens больше окна → BudgetError».

**Ловушка:** `budget = o.window`. На коротких диалогах всё работает, на длинных запрос падает, потому что вход 195k плюс 8k ответа не влезают в окно 200k.

## Шаг 2. Размер истории и быстрый выход

Считаем размер каждого сообщения один раз и складываем. Массив `sizes` пригодится в цикле: пересчитывать `JSON.stringify` на каждой итерации незачем. Если всё влезло, возвращаем исходный массив как есть. Это самый частый случай в проде, и он не должен ничего менять.

```ts
const size = (m: Anthropic.MessageParam) => o.count(JSON.stringify(m.content))
const budget = o.window - o.maxTokens - (o.system ? o.count(o.system) : 0)
if (budget <= 0) throw new BudgetError(`system + max_tokens already exceed the window (${budget} left)`)

const sizes = messages.map(size)
let used = sizes.reduce((s, n) => s + n, 0)
if (used <= budget) return { messages, dropped: 0 }
```

**Зеленеют тесты:** «влезает → ничего не трогает».

## Шаг 3. Резать только парами

Почему не по одному сообщению. Если выкинуть assistant с `tool_use`, а следующий user с `tool_result` оставить, получится «сиротский» `tool_result`, и API ответит 400. Если выкинуть один user, рядом окажутся два assistant подряд, роли перестанут чередоваться, снова 400. В проде это вылезает только на длинных диалогах, то есть редко и не на тестах. Решение: после задачи история состоит из пар (assistant, user), и мы снимаем их целиком, самые старые первыми, пока не влезем. `from` это индекс первого сообщения, которое остаётся после задачи.

```ts
let from = 1
while (used > budget && from + 1 < messages.length) {
  used -= sizes[from]! + sizes[from + 1]!
  from += 2
}

const kept = [messages[0]!, ...messages.slice(from)]
return { messages: kept, dropped: messages.length - kept.length }
```

**Зеленеют тесты:** «режет самое старое, а первое сообщение и последнее сохраняет», «режет минимально», «max_tokens входит в бюджет», «system промпт тоже съедает окно», «никогда не оставляет tool_result без tool_use и не ломает чередование ролей».

**Ловушка:** резать с запасом, например сразу половину истории, «чтобы точно влезло». Тест «режет минимально» ловит именно это: каждое лишнее выкинутое сообщение это потерянный контекст.

## Шаг 4. Задача и текущий ход закреплены, иначе честная ошибка

Версия из шага 3 при маленьком бюджете съест всё до конца, включая текущий вопрос пользователя. Поэтому цикл останавливается до последней пары: `last` это индекс последнего сообщения, и условие `from + 1 < last` не даёт снять пару, в которой лежит текущий ход. Почему хватает такого простого условия: в истории нечётное число сообщений (задача плюс пары), `from` всегда нечётный, `last` чётный, поэтому `from + 1 < last` значит `from + 1 <= last - 2`, и пара `(last - 1, last)` остаётся.

Если цикл кончился, а `used` всё ещё больше бюджета, не влезают даже задача и текущий ход. Отправить такой запрос нельзя, а молча обрезать вопрос пользователя хуже ошибки: модель ответит на вопрос, которого не задавали. Бросаем `BudgetError` с цифрами, чтобы по логу было видно, сколько не хватило.

```ts
const last = messages.length - 1
let from = 1
while (used > budget && from + 1 < last) {
  used -= sizes[from]! + sizes[from + 1]!
  from += 2
}
if (used > budget) throw new BudgetError(`task + current turn alone need ${used} tokens, budget is ${budget}`)
```

**Зеленеют тесты:** «даже задача + текущий вопрос не влезают → BudgetError».

**Ловушка:** закрепить только последнее сообщение, а не пару. Если это `tool_result` (агент в середине цикла инструментов), без своего `tool_use` он сирота.

## Шаг 5. Не мутировать вход

Массив истории принадлежит вызывающему коду: агентский цикл хранит полную историю для логов и UI и на следующем ходу снова вызовет `fitToBudget`, может быть с другим бюджетом. Поэтому мы ничего не удаляем из `messages`: `slice` и spread собирают новый массив, а быстрый выход из шага 2 возвращает исходный, ничего в нём не меняя. Для React-разработчика это то же правило, что для state: новый массив вместо `splice`.

```ts
// быстрый выход: тот же массив, но мы в нём ничего не поменяли
if (used <= budget) return { messages, dropped: 0 }

// цикл из шагов 3-4 двигает только индекс from, сам массив не трогает
// так нельзя: messages.splice(1, 2) меняет историю вызывающего кода

const kept = [messages[0]!, ...messages.slice(from)]
return { messages: kept, dropped: messages.length - kept.length }
```

**Зеленеют тесты:** «не мутирует входной массив». Честно говоря, он зелёный с шага 3, пока в коде нет `splice`; этот шаг про то, чтобы так и осталось.

**Ловушка:** `messages.splice(1, 2)` в цикле. Остальные тесты проходят, а история в UI и логах теряет сообщения, и следующий ход режет уже обрезанное.

## Собираем целиком

Всё вместе, это ровно `labs/solutions/budget.ts` с комментариями.

```ts
import type Anthropic from '@anthropic-ai/sdk'

export class BudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetError'
  }
}

export type BudgetOptions = {
  window: number
  maxTokens: number
  count: (text: string) => number
  system?: string
}

/**
 * Окно делят вход И ответ: если вход + max_tokens > окна, места на ответ нет.
 * Режем парами (assistant, user) после первого сообщения: tool_use и его tool_result
 * живут в соседних сообщениях, поэтому пара удаляется только целиком.
 */
export function fitToBudget(
  messages: Anthropic.MessageParam[],
  o: BudgetOptions,
): { messages: Anthropic.MessageParam[]; dropped: number } {
  const size = (m: Anthropic.MessageParam) => o.count(JSON.stringify(m.content))
  // бюджет на историю: окно минус резерв под ответ минус system
  const budget = o.window - o.maxTokens - (o.system ? o.count(o.system) : 0)
  if (budget <= 0) throw new BudgetError(`system + max_tokens already exceed the window (${budget} left)`)

  const sizes = messages.map(size)
  let used = sizes.reduce((s, n) => s + n, 0)
  if (used <= budget) return { messages, dropped: 0 }

  // первое сообщение (задачу) и последнюю пару (текущий ход) не трогаем
  const last = messages.length - 1
  let from = 1
  // from нечётный, last чётный: from + 1 < last не даёт задеть последнюю пару
  while (used > budget && from + 1 < last) {
    used -= sizes[from]! + sizes[from + 1]!
    from += 2
  }
  if (used > budget) throw new BudgetError(`task + current turn alone need ${used} tokens, budget is ${budget}`)

  // новый массив: вход вызывающего кода не мутируем
  const kept = [messages[0]!, ...messages.slice(from)]
  return { messages: kept, dropped: messages.length - kept.length }
}
```

## Как рассказать на интервью

Сценарий: после 40 минут диалога агент «забывает» номер заказа, который пользователь назвал в начале.

- Причина. API stateless, каждый ход я отправляю всю историю. Когда вход плюс `max_tokens` перестал влезать в окно, обрезка выкинула самые старые сообщения, а номер заказа был именно там. Если номер прозвучал не в первом сообщении, а во втором-третьем, даже мой `fitToBudget` его выкинет: закреплены только задача и текущий ход.
- Вариант 1, самый дешёвый: закреплять важное. Задачу и текущую пару я уже не трогаю, режу только целыми парами, чтобы не словить 400 на сиротском `tool_result`. Следующий шаг: закреплять и сообщения с ключевыми фактами или поднимать их в system. Цена: ноль лишних вызовов.
- Вариант 2: summarization (сжатие старой части в краткое изложение). Вместо выкинутых пар кладу краткую сводку, которую пишет модель. Это лишний вызов и риск, что сводка потеряет именно ту деталь.
- Вариант 3, самый дорогой и надёжный: память. Факты вроде `order_id` вытаскиваю в структурированное состояние вне истории и подкладываю в каждый запрос. Тогда обрезка истории их не трогает вообще.
- И мониторинг: логирую `dropped` и токены на каждом ходу (`usage.input_tokens`), чтобы видеть, как часто срабатывает обрезка, до того как пользователи начнут жаловаться.
