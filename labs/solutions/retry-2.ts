export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>

export type LimiterOptions = {
  ratePerSec: number // сколько жетонов доливается в секунду
  burst: number // ёмкость ведра; стартует полным
  now?: () => number // часы в мс, в тестах подменяются
  sleep?: Sleep // в тестах подменяется
}

export type Limiter = {
  /** Ждёт свой жетон и забирает его. Отмена во время ожидания: AbortError, жетон возвращается. */
  take: (signal?: AbortSignal) => Promise<void>
}

export type BreakerOptions = {
  failures?: number // сколько ретраибельных ошибок ПОДРЯД открывают предохранитель, по умолчанию 5
  cooldownMs?: number // сколько держать открытым до пробной попытки, по умолчанию 30_000
  now?: () => number
}

export type BreakerState = 'closed' | 'open' | 'half-open'

export type Breaker<A extends unknown[], T> = {
  call: (...args: A) => Promise<T>
  state: () => BreakerState
}

/** Fail fast: предохранитель открыт, fn даже не вызывали. retryAfterMs: когда имеет смысл прийти снова. */
export class CircuitOpenError extends Error {
  retryAfterMs: number
  constructor(retryAfterMs: number) {
    super(`circuit open, retry in ${retryAfterMs} ms`)
    this.name = 'CircuitOpenError'
    this.retryAfterMs = retryAfterMs
  }
}

type HttpLike = { status?: number }

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529])

/** Та же классификация, что в лабе 05: болезнь сервиса или сети, а не наша ошибка и не отмена. */
function isRetryable(e: unknown): boolean {
  const err = e as Error & HttpLike
  if (err?.name === 'AbortError') return false
  if (typeof err?.status === 'number') return RETRYABLE.has(err.status) || err.status >= 500
  return true // нет статуса: сеть, DNS, обрыв сокета
}

function abortError() {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' })
}

const defaultSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const onAbort = () => {
      clearTimeout(t)
      reject(abortError())
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

export function createLimiter(o: LimiterOptions): Limiter {
  const now = o.now ?? Date.now
  const sleep = o.sleep ?? defaultSleep
  let tokens = o.burst
  let last = now()

  // Ленивый долив: не таймер, а пересчёт по прошедшему времени в момент запроса.
  function refill() {
    const t = now()
    tokens = Math.min(o.burst, tokens + ((t - last) / 1000) * o.ratePerSec)
    last = t
  }

  return {
    async take(signal) {
      if (signal?.aborted) throw abortError()
      refill()
      // Бронируем жетон сразу, даже в долг (tokens < 0). Синхронно, до первого await,
      // поэтому одновременные вызовы встают в честную очередь: 1-й, 2-й, 3-й в долг.
      tokens -= 1
      if (tokens >= 0) return
      const wait = (-tokens / o.ratePerSec) * 1000
      try {
        await sleep(wait, signal)
        if (signal?.aborted) throw abortError()
      } catch (e) {
        tokens += 1 // ушли из очереди: бронь возвращаем, следующий не должен ждать за нас
        throw e
      }
    },
  }
}

export function withBreaker<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
  o: BreakerOptions = {},
): Breaker<A, T> {
  const limit = o.failures ?? 5
  const cooldown = o.cooldownMs ?? 30_000
  const now = o.now ?? Date.now
  let state: BreakerState = 'closed'
  let streak = 0 // ретраибельные ошибки подряд
  let openedAt = 0
  let probing = false // в half-open пропускаем ровно одну пробу
  // После await состояние могли поменять параллельные вызовы. TS этого не видит и держит сужение
  // типа с начала функции, поэтому после await читаем состояние через функцию.
  const current = () => state

  return {
    state: current,
    async call(...args) {
      if (state === 'open') {
        const left = openedAt + cooldown - now()
        if (left > 0) throw new CircuitOpenError(left)
        state = 'half-open'
      }
      if (state === 'half-open' && probing) throw new CircuitOpenError(0) // проба уже летит
      const isProbe = state === 'half-open'
      if (isProbe) probing = true
      try {
        const value = await fn(...args)
        // Поздний успех старого запроса не закрывает уже открытый предохранитель.
        if (current() !== 'open') {
          state = 'closed'
          streak = 0
        }
        return value
      } catch (e) {
        // 4xx и AbortError предохранитель не видит: сервис жив, ошибка наша или отмена.
        if (isRetryable(e) && current() !== 'open') {
          streak++
          if (isProbe || streak >= limit) {
            state = 'open'
            openedAt = now()
          }
        }
        throw e // ошибку всегда отдаём как есть
      } finally {
        if (isProbe) probing = false
      }
    },
  }
}
