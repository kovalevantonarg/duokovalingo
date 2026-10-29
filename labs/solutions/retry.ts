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
  if (err?.name === 'AbortError') return false
  if (typeof err?.status === 'number') return RETRYABLE.has(err.status) || err.status >= 500
  return true // нет статуса: сеть, DNS, обрыв сокета
}

function serverDelay(e: unknown): number | null {
  const h = (e as HttpLike)?.headers
  if (!h) return null
  const ms = Number(h.get('retry-after-ms'))
  if (h.get('retry-after-ms') && Number.isFinite(ms)) return ms
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
      return await fn(attempt)
    } catch (e) {
      if (attempt >= retries || !isRetryable(e)) throw e
      const delay = serverDelay(e) ?? random() * Math.min(max, base * 2 ** attempt)
      await sleep(delay, o.signal)
      if (o.signal?.aborted) throw abortError()
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
      const i = next++
      try {
        out[i] = { status: 'fulfilled', value: await fn(items[i]!, i) }
      } catch (reason) {
        out[i] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
