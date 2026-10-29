# Разбор: SSE stream

Когда ты отправляешь в Anthropic API запрос со `stream: true`, ответ приходит не одним JSON, а постепенно: сервер держит HTTP-соединение открытым и дописывает в него строки по мере того, как модель генерирует токены. Этот формат называется SSE (Server-Sent Events, события от сервера). Зачем: пользователь видит первые слова через доли секунды, а не ждёт весь ответ. Это и есть TTFT (time to first token, время до первого токена), главная метрика чат-интерфейса.

`EventSource` из браузера тут не подходит: он умеет только GET без заголовков, а нам нужен POST с историей сообщений и ключом. Поэтому делаем `fetch` и читаем `response.body` руками. `response.body` это `ReadableStream<Uint8Array>` (поток байтов), и сеть режет его на chunk (куски) где угодно: посреди строки, посреди события, даже посреди одной русской буквы. Наша задача: два слоя. Нижний `parseSSE` превращает байты в события `{ event, data }`. Верхний `collectMessage` собирает из событий Anthropic итог: текст, вызовы инструментов, `stop_reason` (почему модель остановилась) и флаг `complete`.

Как выглядит поток на проводе: каждое событие это несколько строк вида `поле: значение`, а пустая строка завершает событие.

```ts
// кусок ответа на проводе: две строки и пустая строка = одно событие
const wire =
  'event: content_block_delta\n' +
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}\n' +
  '\n'

// что хотим получить в конце
type StreamResult = {
  text: string
  toolCalls: { id: string; name: string; input: unknown }[]
  stopReason: string | null
  complete: boolean // пришёл ли message_stop
  error?: { type: string; message: string }
}
```

Порядок событий Anthropic: `message_start`, потом для каждого блока контента `content_block_start`, несколько `content_block_delta`, `content_block_stop`, затем `message_delta` (в нём `stop_reason`) и `message_stop`. Между ними может прийти `ping`, а посреди потока может прийти `error`.

## Шаг 1. Байты в текст и текст в строки

`parseSSE` это async generator (асинхронный генератор: функция с `async function*`, которая отдаёт значения через `yield`, а потребитель забирает их через `for await`). Берём reader (читатель потока) через `getReader()` и читаем кусками в цикле. Байты переводим в строку через `TextDecoder`, и тут первая ловушка: русская буква в UTF-8 занимает 2 байта. Если кусок закончился на первом байте буквы, обычный `decode(value)` выдаст `�`. Флаг `{ stream: true }` говорит декодеру: недописанные байты держи у себя и приклей к следующему куску. Второе: кусок может закончиться посреди строки, поэтому копим текст в `buf` (буфер) и отрезаем от него только целые строки, хвост ждёт следующего куска. В конце потока вызываем `decoder.decode()` без аргументов, чтобы выдать то, что декодер ещё держит, а в `finally` отпускаем reader.

```ts
export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  function* lines(final: boolean): Generator<string> {
    while (true) {
      const i = buf.indexOf('\n') // упрощённо, на шаге 3 научим \r
      if (i === -1) return // целой строки нет, ждём следующий кусок
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      yield line
    }
  }
  try { // handle(line) пишем на шаге 2
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      for (const l of lines(false)) yield* handle(l)
    }
    buf += decoder.decode()
    for (const l of lines(true)) yield* handle(l)
  } finally {
    reader.releaseLock()
  }
}
```

**Зеленеют тесты:** пока ни одного, потому что `handle` ещё не написан. Но фундамент для «чанк режет строку посередине» и «кириллица посреди UTF-8 символа» уже здесь.

**Ловушка:** `decoder.decode(value)` без `{ stream: true }`. На английском тексте всё работает, а на демо с русским ответом посреди слова появляется `�`.

## Шаг 2. Строки в события

Теперь `handle(line)`: разбираем строку `поле: значение`. Поле `event` запоминаем, поле `data` складываем в массив, потому что у одного события data-строк может быть несколько. Пустая строка значит «событие закончилось»: отдаём его и сбрасываем состояние. Пробел после двоеточия по спецификации необязательный, поэтому срезаем ровно один. Если в конце потока событие не закрыто пустой строкой, мы его просто не отдадим: по спецификации недописанное событие выбрасывается, и наш код делает это бесплатно, потому что отдаёт событие только на пустой строке.

```ts
let event = ''
let data: string[] = []

function* handle(line: string): Generator<SSEEvent> {
  if (line === '') {
    if (data.length) yield { event, data: data.join('\n') }
    event = ''
    data = []
    return
  }
  const c = line.indexOf(':')
  const field = line.slice(0, c)
  let value = line.slice(c + 1)
  if (value.startsWith(' ')) value = value.slice(1)
  if (field === 'event') event = value
  else if (field === 'data') data.push(value)
}
```

**Зеленеют тесты:** «одно событие», «несколько событий в одном чанке», «чанк режет строку посередине», «кириллица посреди UTF-8 символа», «недописанное событие в конце потока отбрасывается».

## Шаг 3. Три вида перевода строки

Спецификация SSE разрешает три окончания строки: `\n`, `\r\n` и одиночный `\r`. Ищем первый из `\r` или `\n` регуляркой. Если нашли `\r\n`, съедаем два символа, иначе один. Самое тонкое место: `\r` оказался последним символом буфера. Мы не знаем, придёт ли следующим куском `\n`. Если сразу считать `\r` концом строки, а потом `\n` из следующего куска тоже концом строки, получится лишняя пустая строка, и она разрежет событие пополам. Поэтому такой `\r` оставляем в буфере до следующего куска. Для этого и нужен параметр `final`: когда поток уже кончился, ждать больше нечего, и `\r` в конце считаем переводом строки.

```ts
function* lines(final: boolean): Generator<string> {
  while (true) {
    const i = buf.search(/[\r\n]/)
    if (i === -1) return
    // \r в самом конце буфера: следом может прийти \n из следующего чанка
    if (buf[i] === '\r' && i === buf.length - 1 && !final) return
    const line = buf.slice(0, i)
    buf = buf.slice(buf[i] === '\r' && buf[i + 1] === '\n' ? i + 2 : i + 1)
    yield line
  }
}
```

**Зеленеют тесты:** «CRLF-переводы строк тоже валидны», «CR в конце одного чанка, LF в начале следующего».

**Ловушка:** `buf.split('\n')` по каждому куску. Он не знает про `\r`, а `\r` на стыке кусков превращается в лишнюю пустую строку.

## Шаг 4. Комментарии и значения по умолчанию

Строка, которая начинается с `:`, это комментарий. Прокси и балансировщики шлют такие строки (`: keepalive`), чтобы соединение не закрылось по таймауту, когда модель долго думает. Их надо молча пропускать. Ещё два правила спецификации: если поля `event` не было, тип события `message`; строка без двоеточия это имя поля с пустым значением. Добавляем это в `handle`.

```ts
function* handle(line: string): Generator<SSEEvent> {
  if (line === '') {
    if (data.length) yield { event: event || 'message', data: data.join('\n') }
    event = ''
    data = []
    return
  }
  if (line.startsWith(':')) return // комментарий, например keepalive от прокси
  const c = line.indexOf(':')
  const field = c === -1 ? line : line.slice(0, c)
  let value = c === -1 ? '' : line.slice(c + 1)
  if (value.startsWith(' ')) value = value.slice(1)
  if (field === 'event') event = value
  else if (field === 'data') data.push(value)
}
```

**Зеленеют тесты:** «строки-комментарии игнорируются», «несколько data-строк склеиваются через \n, без event тип message». Весь `parseSSE` готов.

## Шаг 5. collectMessage: текст и stop_reason

Второй слой ничего не знает про байты, он перебирает готовые события через `for await` и парсит `data` как JSON. Тип события смотрим по полю `type` внутри JSON. Текст приходит в `content_block_delta` с `delta.type === 'text_delta'`, его просто дописываем. `stop_reason` лежит в `message_delta`. `message_stop` значит, что ответ дошёл целиком: ставим `complete = true`. Всё, чего нет в `switch` (например `ping` и `message_start`), пропускается само.

```ts
export async function collectMessage(stream: ReadableStream<Uint8Array>): Promise<StreamResult> {
  const r: StreamResult = { text: '', toolCalls: [], stopReason: null, complete: false }
  for await (const e of parseSSE(stream)) {
    const d = JSON.parse(e.data)
    switch (d.type) {
      case 'content_block_delta': {
        if (d.delta.type === 'text_delta') r.text += d.delta.text
        break
      }
      case 'message_delta':
        r.stopReason = d.delta.stop_reason ?? r.stopReason
        break
      case 'message_stop':
        r.complete = true
        break
    }
  }
  return r
}
```

**Зеленеют тесты:** «склеивает текст из дельт и берёт stop_reason», «ping посреди потока не ломает сборку».

## Шаг 6. Вызовы инструментов по кускам

Когда модель вызывает инструмент, `content_block_start` приходит с `content_block.type === 'tool_use'`, в нём `id` и `name`. Аргументы приходят потом кусками в `input_json_delta` через поле `partial_json`, и каждый кусок по отдельности невалидный JSON (`{"order_`). Поэтому копим строку и парсим её только на `content_block_stop` этого блока. Блоки различаются по `index`, а два инструмента могут стримиться вперемешку, так что состояние держим в `Map` по `index`. Пустая строка аргументов значит инструмент без аргументов, это `{}`, а не ошибка `JSON.parse('')`.

```ts
const blocks = new Map<number, { kind: 'text' | 'tool'; id?: string; name?: string; json: string }>()

switch (d.type) {
  case 'content_block_start': {
    const b = d.content_block
    blocks.set(d.index, b.type === 'tool_use' ? { kind: 'tool', id: b.id, name: b.name, json: '' } : { kind: 'text', json: '' })
    break
  }
  case 'content_block_delta': {
    if (d.delta.type === 'text_delta') r.text += d.delta.text
    else if (d.delta.type === 'input_json_delta') {
      const b = blocks.get(d.index)
      if (b) b.json += d.delta.partial_json
    }
    break
  }
  case 'content_block_stop': {
    const b = blocks.get(d.index)
    if (b?.kind === 'tool') r.toolCalls.push({ id: b.id!, name: b.name!, input: b.json ? JSON.parse(b.json) : {} })
    break
  }
  // message_delta и message_stop из шага 5 без изменений
}
```

**Зеленеют тесты:** «аргументы tool_use приходят кусками partial_json», «инструмент без аргументов», «два tool_use по разным index».

**Ловушка:** `JSON.parse` на каждой дельте. Падает уже на первом куске.

## Шаг 7. Ошибка посреди потока и обрыв

Две ситуации, которые обычная проверка `res.ok` не ловит. Первая: `event: error` с `overloaded_error` приходит уже после HTTP 200, статус ответа давно получен. Заполняем `error` и сразу возвращаем то, что успели собрать: текст, который пользователь уже видел, терять нельзя. Вторая: соединение просто кончилось без `message_stop` (мобильная сеть, прокси, таймаут). Ошибки нет, цикл тихо закончился. Для этого `complete` по умолчанию `false`, и только `message_stop` ставит его в `true`. UI обязан смотреть на этот флаг, иначе покажет полуответ как полный.

```ts
export async function collectMessage(stream: ReadableStream<Uint8Array>): Promise<StreamResult> {
  // complete: false, пока message_stop не доказал обратное
  const r: StreamResult = { text: '', toolCalls: [], stopReason: null, complete: false }
  for await (const e of parseSSE(stream)) {
    const d = JSON.parse(e.data)
    switch (d.type) {
      // case из шагов 5 и 6 без изменений
      case 'error':
        r.error = { type: d.error.type, message: d.error.message }
        return r // уже собранный текст остаётся в r.text
    }
  }
  return r
}
```

**Зеленеют тесты:** «event: error посреди потока», «соединение оборвалось без message_stop». Все 16 тестов зелёные.

## Собираем целиком

Это `labs/solutions/sse.ts` с комментариями, по поведению один в один.

```ts
export type SSEEvent = { event: string; data: string }

export type StreamResult = {
  text: string
  toolCalls: { id: string; name: string; input: unknown }[]
  stopReason: string | null
  complete: boolean
  error?: { type: string; message: string }
}

export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader()
  // stream: true держит недописанные байты UTF-8 до следующего чанка
  const decoder = new TextDecoder('utf-8')
  let buf = '' // текст, из которого ещё не вырезаны целые строки
  let event = '' // поле event текущего события
  let data: string[] = [] // data-строки текущего события

  function* lines(final: boolean): Generator<string> {
    while (true) {
      const i = buf.search(/[\r\n]/)
      if (i === -1) return
      // \r в самом конце буфера: следом может прийти \n из следующего чанка
      if (buf[i] === '\r' && i === buf.length - 1 && !final) return
      const line = buf.slice(0, i)
      buf = buf.slice(buf[i] === '\r' && buf[i + 1] === '\n' ? i + 2 : i + 1)
      yield line
    }
  }

  function* handle(line: string): Generator<SSEEvent> {
    // пустая строка закрывает событие
    if (line === '') {
      if (data.length) yield { event: event || 'message', data: data.join('\n') }
      event = ''
      data = []
      return
    }
    if (line.startsWith(':')) return // комментарий, например keepalive от прокси
    const c = line.indexOf(':')
    const field = c === -1 ? line : line.slice(0, c)
    let value = c === -1 ? '' : line.slice(c + 1)
    if (value.startsWith(' ')) value = value.slice(1) // один необязательный пробел после двоеточия
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      for (const l of lines(false)) yield* handle(l)
    }
    buf += decoder.decode() // отдать байты, которые декодер ещё держит
    for (const l of lines(true)) yield* handle(l)
    // всё, что осталось без пустой строки, по спецификации отбрасывается
  } finally {
    reader.releaseLock()
  }
}

export async function collectMessage(stream: ReadableStream<Uint8Array>): Promise<StreamResult> {
  const r: StreamResult = { text: '', toolCalls: [], stopReason: null, complete: false }
  // состояние блоков контента по index: у инструментов копим куски JSON
  const blocks = new Map<number, { kind: 'text' | 'tool'; id?: string; name?: string; json: string }>()

  for await (const e of parseSSE(stream)) {
    const d = JSON.parse(e.data)
    switch (d.type) {
      case 'content_block_start': {
        const b = d.content_block
        blocks.set(d.index, b.type === 'tool_use' ? { kind: 'tool', id: b.id, name: b.name, json: '' } : { kind: 'text', json: '' })
        break
      }
      case 'content_block_delta': {
        if (d.delta.type === 'text_delta') r.text += d.delta.text
        else if (d.delta.type === 'input_json_delta') {
          const b = blocks.get(d.index)
          if (b) b.json += d.delta.partial_json
        }
        break
      }
      case 'content_block_stop': {
        const b = blocks.get(d.index)
        // аргументы целиком только здесь; пустая строка значит {}
        if (b?.kind === 'tool') r.toolCalls.push({ id: b.id!, name: b.name!, input: b.json ? JSON.parse(b.json) : {} })
        break
      }
      case 'message_delta':
        r.stopReason = d.delta.stop_reason ?? r.stopReason
        break
      case 'message_stop':
        r.complete = true
        break
      case 'error':
        r.error = { type: d.error.type, message: d.error.message }
        return r // текст, полученный до ошибки, сохраняем
    }
  }
  return r
}
```

## Как рассказать на интервью

> Пользователи на мобильном жалуются: ответ иногда обрывается на середине, ошибки в UI нет. Что проверяешь и что меняешь в клиенте?

- Сначала проверяю, отличает ли клиент законченный ответ от оборванного. Законченный это только тот, где пришёл `message_stop`. У меня в коде это флаг `complete`, по умолчанию `false`. Если поток кончился без него, UI показывает «ответ прервался» и кнопку повторить, а не делает вид, что всё нормально. На мобильной сети соединение рвётся при смене вышки или уходе в фон, и это ровно тот случай.
- Второе: ошибка внутри потока. `overloaded_error` может прийти событием `error` уже после HTTP 200, так что проверка статуса её не видит. Я обрабатываю `event: error` отдельно: показываю ошибку и сохраняю текст, который пользователь уже прочитал.
- Третье: сам парсер. Мобильная сеть режет ответ на куски мельче и чаще, поэтому баги на стыках всплывают именно там. Проверяю буфер для хвоста строки, `TextDecoder` с `{ stream: true }` для кириллицы и `\r\n`, разрезанный между кусками, иначе лишняя пустая строка рвёт событие и его конец теряется.
- Четвёртое: долгие паузы. Прокси шлют комментарии `: keepalive`, парсер их пропускает. Аргументы инструментов парсю только на `content_block_stop`, чтобы обрыв посреди JSON не превращался в исключение и пустой экран.
- И наблюдаемость: логирую на клиенте `stopReason`, `complete` и `error` для каждого ответа, чтобы видеть долю оборванных потоков по типу сети и версии приложения, а не узнавать о проблеме из жалоб.
