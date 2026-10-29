export type RetryOptions = {
  retries?: number // по умолчанию 3 (то есть до 4 вызовов)
  baseMs?: number // по умолчанию 500
  maxMs?: number // по умолчанию 30_000
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void> // в тестах подменяется
  random?: () => number // в тестах подменяется
  signal?: AbortSignal
}

/**
 * Ошибка выглядит как APIError из SDK: { status?: number, headers?: Headers }.
 * Реши сам: какие статусы имеет смысл повторять, а какие повторять бессмысленно.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions = {}): Promise<T> {
  throw new Error('TODO: lab 05')
}

/** Не больше limit задач одновременно. Результат в форме Promise.allSettled, в порядке входа. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  throw new Error('TODO: lab 05')
}
