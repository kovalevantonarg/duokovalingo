import { describe, it, expect, vi } from 'vitest'
import { withRetry, mapLimit } from '@lab/retry'

/** Форма ошибки как у APIError в SDK: status + headers. */
const http = (status: number, headers: Record<string, string> = {}) =>
  Object.assign(new Error(`HTTP ${status}`), { status, headers: new Headers(headers) })
const network = () => Object.assign(new TypeError('fetch failed'), { cause: 'ECONNRESET' })

function failing(errors: Error[], value = 'ok') {
  const q = [...errors]
  return vi.fn(async () => {
    const e = q.shift()
    if (e) throw e
    return value
  })
}

const noSleep = () => {
  const delays: number[] = []
  return { delays, sleep: async (ms: number) => { delays.push(ms) } }
}

describe('05 withRetry: что ретраить (билеты 8, 33)', () => {
  it.each([429, 500, 503, 529])('%i ретраится', async (status) => {
    const fn = failing([http(status)])
    const { sleep } = noSleep()
    await expect(withRetry(fn, { sleep })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('сетевая ошибка без статуса (обрыв соединения) ретраится', async () => {
    const fn = failing([network()])
    await expect(withRetry(fn, noSleep())).resolves.toBe('ok')
  })

  it.each([400, 401, 403, 404, 413])('%i НЕ ретраится: повтор даст ту же ошибку', async (status) => {
    const fn = failing([http(status)])
    await expect(withRetry(fn, noSleep())).rejects.toMatchObject({ status })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('исчерпал попытки → бросает ПОСЛЕДНЮЮ ошибку, вызовов retries + 1', async () => {
    const fn = failing([http(529), http(529), http(503)])
    await expect(withRetry(fn, { ...noSleep(), retries: 2 })).rejects.toMatchObject({ status: 503 })
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

describe('05 withRetry: сколько ждать', () => {
  it('экспоненциальная задержка с full jitter: random * min(max, base * 2^n)', async () => {
    const fn = failing([http(500), http(500), http(500)])
    const s = noSleep()
    await withRetry(fn, { ...s, retries: 3, baseMs: 500, maxMs: 1500, random: () => 1 })
    expect(s.delays).toEqual([500, 1000, 1500])

    const fn2 = failing([http(500), http(500)])
    const s2 = noSleep()
    await withRetry(fn2, { ...s2, baseMs: 500, random: () => 0.5 })
    expect(s2.delays).toEqual([250, 500])
  })

  it('retry-after (секунды) от сервера важнее своей формулы', async () => {
    const s = noSleep()
    await withRetry(failing([http(429, { 'retry-after': '3' })]), { ...s, random: () => 1 })
    expect(s.delays).toEqual([3000])
  })

  it('retry-after-ms точнее retry-after', async () => {
    const s = noSleep()
    await withRetry(failing([http(429, { 'retry-after': '3', 'retry-after-ms': '1200' })]), s)
    expect(s.delays).toEqual([1200])
  })

  it('отмена во время ожидания → AbortError, больше вызовов нет', async () => {
    const ac = new AbortController()
    const fn = failing([http(500), http(500)])
    const sleep = async () => { ac.abort() }
    await expect(withRetry(fn, { sleep, signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('AbortError от самого вызова не ретраится', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const fn = failing([abort])
    await expect(withRetry(fn, noSleep())).rejects.toBe(abort)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('05 mapLimit: 100 запросов при лимите (билет 33)', () => {
  it('одновременно не больше limit, порядок результатов = порядок входа', async () => {
    let active = 0
    let peak = 0
    const items = Array.from({ length: 20 }, (_, i) => i)
    const out = await mapLimit(items, 3, async (i) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5 + ((i * 7) % 11)))
      active--
      return i * 10
    })
    expect(peak).toBe(3)
    expect(out).toEqual(items.map((i) => ({ status: 'fulfilled', value: i * 10 })))
  })

  it('одна задача упала → остальные не теряются: результат как у allSettled', async () => {
    const out = await mapLimit([1, 2, 3], 2, async (i) => {
      if (i === 2) throw new Error('boom')
      return i
    })
    expect(out[0]).toEqual({ status: 'fulfilled', value: 1 })
    expect(out[1]).toMatchObject({ status: 'rejected' })
    expect(out[2]).toEqual({ status: 'fulfilled', value: 3 })
  })
})
