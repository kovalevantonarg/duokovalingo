export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>

export type LimiterOptions = {
  ratePerSec: number // сколько жетонов доливается в секунду
  burst: number // ёмкость ведра; стартует полным
  now?: () => number // часы в мс, в тестах подменяются (по умолчанию Date.now)
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

/**
 * Token bucket (ведро с жетонами). Порядок мыслей, а не код:
 *  1. Ведро стартует полным: burst запросов проходят сразу.
 *  2. Долив ленивый: в момент take() считаешь, сколько накапало с прошлого раза, но не больше burst.
 *  3. Жетон бронируется сразу, даже в долг (меньше нуля), до первого await. Так одновременные
 *     вызовы встают в честную очередь, и каждый знает, сколько ему ждать: долг / ratePerSec.
 *  4. Время только через now() и sleep() из опций, никаких setTimeout в логике.
 *  5. Уже отменённый signal: AbortError сразу, жетон не трогаешь.
 *  6. Отмена во время ожидания: AbortError и бронь возвращается в ведро.
 */
export function createLimiter(o: LimiterOptions): Limiter {
  throw new Error('TODO: повторение 05')
}

/**
 * Circuit breaker (предохранитель). Порядок мыслей, а не код:
 *  1. closed: вызываешь fn, ошибку отдаёшь как есть, считаешь ретраибельные ошибки подряд.
 *  2. Что считается: та же классификация, что в withRetry (429, 5xx, 529, сеть). 4xx и AbortError не считаются.
 *  3. Успех обнуляет счётчик. Счётчик дошёл до failures: open, запомни время.
 *  4. open: fn не вызываешь, сразу CircuitOpenError с retryAfterMs (сколько осталось до конца cooldown).
 *  5. cooldown прошёл: half-open, пропускаешь ОДНУ пробу, остальным CircuitOpenError.
 *  6. Проба успешна: closed. Проба упала ретраибельно: снова open на полный cooldown.
 */
export function withBreaker<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
  o: BreakerOptions = {},
): Breaker<A, T> {
  throw new Error('TODO: повторение 05')
}
