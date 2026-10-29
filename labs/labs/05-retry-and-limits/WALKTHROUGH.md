# Разбор: Retry и лимиты

Любой вызов модели идёт по сети, и иногда он падает: 429 (rate limit, превышен лимит запросов), 529 (Anthropic перегружен), 500 и 503, обрыв соединения. Почти все такие сбои временные: тот же запрос через секунду пройдёт. Поэтому в любом проде вызов модели завёрнут в `withRetry` (retry, повтор запроса), а массовая обработка идёт через `mapLimit`, который не даёт запустить сто запросов разом и самому себе устроить 429.

Ментальная модель `withRetry`: это цикл «попробовал, упал, решил, стоит ли повторять, подождал, попробовал снова». На каждом круге три вопроса: что повторять, сколько ждать, когда остановиться (кончились попытки или пользователь нажал Stop). Ментальная модель `mapLimit`: пул из `limit` работников (worker pool), каждый берёт из общей очереди следующий элемент, пока очередь не опустеет.

Ошибка, которую ловит `withRetry`, устроена как `APIError` из SDK: у неё есть `status` и `headers`. У сетевой ошибки статуса нет вообще.

```ts
const rateLimited = Object.assign(new Error('HTTP 429'), {
  status: 429,
  headers: new Headers({ 'retry-after': '3' }), // сервер просит подождать 3 секунды
})
const networkDown = Object.assign(new TypeError('fetch failed'), { cause: 'ECONNRESET' })
```

`sleep` и `random` приходят в опциях снаружи (dependency injection, внедрение зависимостей). Так тесты не ждут настоящие секунды и не зависят от случайности: подменили `sleep` на функцию, которая просто записывает задержку, и проверяем список задержек.

## Шаг 1. Цикл попыток

Скелет: бесконечный `for`, в котором `attempt` считает попытки с нуля. Успех сразу выходит через `return`, ошибка попадает в `catch`. Если попытки кончились, бросаем ту ошибку, что прилетела последней: она самая свежая и самая честная для логов. `retries: 3` значит до 4 вызовов: первый плюс три повтора. Пока ждём фиксированные `base` миллисекунд, формулу сделаем в шаге 3.

```ts
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions = {}): Promise<T> {
  const retries = o.retries ?? 3
  const base = o.baseMs ?? 500
  const sleep = o.sleep ?? defaultSleep // настоящий sleep напишем в шаге 6

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt)
    } catch (e) {
      if (attempt >= retries) throw e
      await sleep(base, o.signal)
    }
  }
}
```

**Зеленеют тесты:** «429, 500, 503, 529 ретраится», «сетевая ошибка без статуса ретраится», «исчерпал попытки → бросает ПОСЛЕДНЮЮ ошибку».

**Ловушка:** `return fn(attempt)` без `await`. Промис уйдёт наружу ещё не завершённым, его reject пролетит мимо `catch`, и ретраев не будет ни одного.

## Шаг 2. Что ретраить

Повторять имеет смысл только то, что может само пройти. 429, 5xx и 529 означают «сервер занят или болен», сеть без статуса означает «не дошли». А 400, 401, 403, 404, 413 означают «ты прислал не то»: повтор вернёт ту же ошибку, только позже и дороже. В набор `RETRYABLE` эталон ещё кладёт 408 и 409, плюс страхуется условием `>= 500` для любого другого серверного кода.

```ts
type HttpLike = { status?: number; headers?: Headers }

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529])

function isRetryable(e: unknown): boolean {
  const err = e as Error & HttpLike
  if (typeof err?.status === 'number') return RETRYABLE.has(err.status) || err.status >= 500
  return true // нет статуса: сеть, DNS, обрыв сокета
}

// в цикле условие выхода становится таким:
// if (attempt >= retries || !isRetryable(e)) throw e
```

**Зеленеют тесты:** «400, 401, 403, 404, 413 НЕ ретраится».

**Ловушка:** считать «нет статуса» неретраибельной ошибкой. Как раз обрыв соединения чаще всего и лечится повтором.

## Шаг 3. Сколько ждать: экспонента и full jitter

Потолок задержки растёт вдвое с каждой попыткой (exponential backoff, экспоненциальная пауза): 500, 1000, 2000 мс и так далее, но не больше `maxMs`. Сама задержка берётся случайно от нуля до этого потолка (full jitter, полный случайный разброс). Без случайности тысяча клиентов, упавших в одну секунду, вернутся тоже в одну секунду и снова положат сервис: это thundering herd (стадо, которое ломится в одну дверь).

```ts
const max = o.maxMs ?? 30_000
const random = o.random ?? Math.random

// внутри catch, вместо фиксированного base:
const delay = random() * Math.min(max, base * 2 ** attempt)
await sleep(delay, o.signal)
```

С `random: () => 1` и `maxMs: 1500` получаем ровно потолки: `[500, 1000, 1500]`. С `random: () => 0.5` половину: `[250, 500]`.

**Зеленеют тесты:** «экспоненциальная задержка с full jitter».

**Ловушка:** jitter «сверху», вроде `base * 2 ** attempt + random() * 100`. Сто миллисекунд разброса на паузу в 8 секунд стадо не разгоняют, все снова приходят почти одновременно.

## Шаг 4. retry-after от сервера важнее формулы

Сервер знает, когда освободится окно лимита, а ты нет. Если в ответе есть `retry-after-ms` (миллисекунды, точнее) или `retry-after` (секунды), ждём столько, сколько сказали, а формулу из шага 3 используем только когда заголовков нет.

```ts
function serverDelay(e: unknown): number | null {
  const h = (e as HttpLike)?.headers
  if (!h) return null
  const ms = Number(h.get('retry-after-ms'))
  if (h.get('retry-after-ms') && Number.isFinite(ms)) return ms
  const s = Number(h.get('retry-after'))
  if (h.get('retry-after') && Number.isFinite(s)) return s * 1000
  return null
}

// в catch:
const delay = serverDelay(e) ?? random() * Math.min(max, base * 2 ** attempt)
```

**Зеленеют тесты:** «retry-after (секунды) от сервера важнее своей формулы», «retry-after-ms точнее retry-after».

**Ловушка:** `Number(h.get('retry-after'))` без проверки, что заголовок есть. `get` вернёт `null`, а `Number(null)` это `0`: ждём ноль и сразу бьём сервер снова. Поэтому сначала проверка наличия, и `??`, а не `||`, чтобы законный ноль не подменялся формулой.

## Шаг 5. AbortError не ретраится

Пользователь нажал Stop, `fetch` внутри `fn` бросил ошибку с `name: 'AbortError'`. Статуса у неё нет, и по правилу из шага 2 она бы ретраилась: кнопка Stop запускала бы повтор. Одна строка в начале `isRetryable` это закрывает.

```ts
function isRetryable(e: unknown): boolean {
  const err = e as Error & HttpLike
  if (err?.name === 'AbortError') return false
  if (typeof err?.status === 'number') return RETRYABLE.has(err.status) || err.status >= 500
  return true // нет статуса: сеть, DNS, обрыв сокета
}
```

**Зеленеют тесты:** «AbortError от самого вызова не ретраится».

## Шаг 6. Отмена во время ожидания

Пользователь ушёл, пока мы спим 30 секунд перед повтором. Если сигнал не проверить, мы проснёмся и сделаем платный запрос в никуда. Поэтому `signal` проверяется в двух местах: перед каждой попыткой и сразу после `sleep`. Настоящий `defaultSleep` ещё и сам просыпается по `abort`, чтобы не досыпать впустую. Проверка после `sleep` нужна потому, что подставленный снаружи `sleep` может и не уметь отмену: в тесте он просто вызывает `abort()` и спокойно возвращается.

```ts
function abortError() {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' })
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(abortError()) }, { once: true })
  })

// цикл целиком:
for (let attempt = 0; ; attempt++) {
  if (o.signal?.aborted) throw abortError()
  try {
    return await fn(attempt)
  } catch (e) {
    if (attempt >= retries || !isRetryable(e)) throw e
    const delay = serverDelay(e) ?? random() * Math.min(max, base * 2 ** attempt)
    await sleep(delay, o.signal)
    if (o.signal?.aborted) throw abortError()
  }
}
```

**Зеленеют тесты:** «отмена во время ожидания → AbortError, больше вызовов нет».

**Ловушка:** проверить `signal` только перед `sleep`. Отмена прилетает как раз во время долгой паузы, и после неё уходит лишний вызов.

## Шаг 7. mapLimit: пул работников

Сто запросов через `Promise.all` без лимита это гарантированный 429. Решение: запускаем `limit` асинхронных работников, каждый в цикле берёт следующий индекс из общего счётчика `next`. `const i = next++` безопасно: JavaScript однопоточный, между проверкой `next < items.length` и `next++` нет `await`, никто не влезет. Результат пишем по индексу `i`, поэтому порядок выхода равен порядку входа, даже если задачи заканчиваются вразнобой.

```ts
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = { status: 'fulfilled', value: await fn(items[i]!, i) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
```

**Зеленеют тесты:** «одновременно не больше limit, порядок результатов = порядок входа».

**Ловушка:** резать массив на пачки по `limit` и гнать каждую через `Promise.all`. Одна медленная задача держит всю пачку, остальные слоты простаивают. Пул работников берёт новую задачу, как только освободился слот.

## Шаг 8. Одна ошибка не роняет остальное

Сейчас `fn` упала, работник упал, `Promise.all` упал целиком, а остальные работники доделывают своё в фоне, и их результаты никто не увидит. Ловим ошибку внутри работника и пишем её в ту же ячейку в форме `Promise.allSettled`: `{ status: 'rejected', reason }`. Работник при этом живёт дальше и берёт следующую задачу.

```ts
async function worker() {
  while (next < items.length) {
    const i = next++
    try {
      out[i] = { status: 'fulfilled', value: await fn(items[i]!, i) }
    } catch (reason) {
      out[i] = { status: 'rejected', reason }
    }
  }
}
```

**Зеленеют тесты:** «одна задача упала → остальные не теряются: результат как у allSettled».

## Собираем целиком

Вот эталон `solutions/retry.ts` целиком, с короткими комментариями к неочевидным местам.

```ts
export type RetryOptions = {
  retries?: number
  baseMs?: number
  maxMs?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  random?: () => number
  signal?: AbortSignal
}

type HttpLike = { status?: number; headers?: Headers }

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529])

function isRetryable(e: unknown): boolean {
  const err = e as Error & HttpLike
  if (err?.name === 'AbortError') return false // иначе кнопка Stop запускает повтор
  if (typeof err?.status === 'number') return RETRYABLE.has(err.status) || err.status >= 500
  return true // нет статуса: сеть, DNS, обрыв сокета
}

function serverDelay(e: unknown): number | null {
  const h = (e as HttpLike)?.headers
  if (!h) return null
  const ms = Number(h.get('retry-after-ms'))
  if (h.get('retry-after-ms') && Number.isFinite(ms)) return ms // Number(null) === 0, поэтому сначала проверка наличия
  const s = Number(h.get('retry-after'))
  if (h.get('retry-after') && Number.isFinite(s)) return s * 1000
  return null
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(abortError()) }, { once: true })
  })

function abortError() {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' })
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions = {}): Promise<T> {
  const retries = o.retries ?? 3
  const base = o.baseMs ?? 500
  const max = o.maxMs ?? 30_000
  const sleep = o.sleep ?? defaultSleep
  const random = o.random ?? Math.random

  for (let attempt = 0; ; attempt++) {
    if (o.signal?.aborted) throw abortError()
    try {
      return await fn(attempt) // без await catch не поймает reject
    } catch (e) {
      if (attempt >= retries || !isRetryable(e)) throw e // бросаем последнюю ошибку как есть
      const delay = serverDelay(e) ?? random() * Math.min(max, base * 2 ** attempt) // full jitter
      await sleep(delay, o.signal)
      if (o.signal?.aborted) throw abortError() // отменили, пока спали
    }
  }
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++ // между проверкой и инкрементом нет await, гонки нет
      try {
        out[i] = { status: 'fulfilled', value: await fn(items[i]!, i) }
      } catch (reason) {
        out[i] = { status: 'rejected', reason } // ошибка одной задачи не роняет пул
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
```

## Как рассказать на интервью

> Ночью запустили переобработку 10 тысяч документов, утром лёг прод-чат с 429. Что произошло и как не допустить повтора?

- Что произошло: батч, скорее всего, шёл без потолка конкурентности, через `Promise.all` по всему списку, и выбрал весь лимит запросов, общий с прод-чатом. Чат утром получил тот же 429. Если ретраи были без jitter, упавшие запросы возвращались синхронными волнами и держали лимит забитым, пока батч не кончился.
- Первое, что чиню: батч идёт через `mapLimit` с небольшим `limit`, подобранным так, чтобы батч занимал только свою долю лимита. Порядок результатов сохраняется, один упавший документ не теряет остальные.
- Каждый вызов в `withRetry`: повторяю только 429, 5xx, 529 и сетевые ошибки, 4xx сразу наверх. Пауза экспоненциальная с full jitter, потолок `maxMs`, ограниченное число попыток. Если сервер прислал `retry-after-ms` или `retry-after`, жду столько, сколько он сказал.
- Развожу трафик: батч и прод не должны делить один бюджет. Отдельный ключ или хотя бы свой жёсткий потолок для фоновых задач, чтобы ночная работа никогда не выедала лимит пользовательского чата.
- Отмена: батч принимает `signal`, и его можно остановить сразу, в том числе посреди долгой паузы между повторами, без лишних платных запросов.
- Идемпотентность: повтор вызова модели безопасен, но если батч ещё и пишет результат в базу, запись делаю идемпотентной (повтор не меняет результат), чтобы ретрай не создал дубль. Плюс алерт на долю 429, чтобы узнать об этом ночью, а не от пользователей утром.
