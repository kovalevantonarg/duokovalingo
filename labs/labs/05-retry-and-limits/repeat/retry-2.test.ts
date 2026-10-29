import { describe, it, expect, vi } from 'vitest'
import { createLimiter, withBreaker } from '@lab/retry-2'

/** Форма ошибки как у APIError в SDK: status + headers. */
const http = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status, headers: new Headers() })
const network = () => Object.assign(new TypeError('fetch failed'), { cause: 'ECONNRESET' })
const aborted = () => Object.assign(new Error('aborted'), { name: 'AbortError' })

/** Скриптованный вызов модели: ошибка бросается, строка возвращается; скрипт кончился → 'ok'. */
function script(steps: Array<Error | string>) {
  const q = [...steps]
  return vi.fn(async () => {
    const s = q.shift() ?? 'ok'
    if (s instanceof Error) throw s
    return s
  })
}

/** Ручные часы: время идёт только через advance, sleep лишь записывает, сколько просили ждать. */
function clock() {
  let t = 0
  const delays: number[] = []
  return {
    delays,
    now: () => t,
    advance: (ms: number) => { t += ms },
    sleep: async (ms: number) => { delays.push(ms) },
  }
}

describe('05 повторение: token bucket (createLimiter)', () => {
  it('burst запросов проходят сразу, без ожидания', async () => {
    const c = clock()
    const limiter = createLimiter({ ratePerSec: 1, burst: 3, now: c.now, sleep: c.sleep })
    await limiter.take()
    await limiter.take()
    await limiter.take()
    expect(c.delays).toEqual([])
  })

  it('дальше очередь: каждый следующий ждёт ещё 1/ratePerSec секунды', async () => {
    const c = clock()
    const limiter = createLimiter({ ratePerSec: 2, burst: 1, now: c.now, sleep: c.sleep })
    await Promise.all([limiter.take(), limiter.take(), limiter.take(), limiter.take()])
    expect(c.delays).toEqual([500, 1000, 1500])
  })

  it('жетоны доливаются со временем, но не больше burst', async () => {
    const c = clock()
    const limiter = createLimiter({ ratePerSec: 1, burst: 2, now: c.now, sleep: c.sleep })
    await limiter.take()
    await limiter.take()
    c.advance(10_000) // накапало бы 10, но в ведро влезает только 2
    await limiter.take()
    await limiter.take()
    await limiter.take()
    expect(c.delays).toEqual([1000])
  })

  it('уже отменённый signal → AbortError сразу, жетон не тратится', async () => {
    const c = clock()
    const limiter = createLimiter({ ratePerSec: 1, burst: 1, now: c.now, sleep: c.sleep })
    const ac = new AbortController()
    ac.abort()
    await expect(limiter.take(ac.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await limiter.take()
    expect(c.delays).toEqual([])
  })

  it('отмена во время ожидания → AbortError, бронь возвращается в ведро', async () => {
    const ac = new AbortController()
    const delays: number[] = []
    const sleep = async (ms: number) => {
      delays.push(ms)
      if (delays.length === 1) ac.abort() // пользователь ушёл, пока ждали жетон
    }
    const limiter = createLimiter({ ratePerSec: 1, burst: 1, now: () => 0, sleep })
    await limiter.take()
    await expect(limiter.take(ac.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await limiter.take()
    expect(delays).toEqual([1000, 1000]) // не 2000: отменённый не держит место в очереди
  })

  it('настоящий sleep тоже прерывается: не спим секунду зря', async () => {
    const limiter = createLimiter({ ratePerSec: 1, burst: 1 })
    await limiter.take()
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 10)
    const started = Date.now()
    await expect(limiter.take(ac.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - started).toBeLessThan(500)
  })
})

describe('05 повторение: circuit breaker (withBreaker)', () => {
  it('closed: результат и ошибки проходят насквозь, как есть', async () => {
    const fn = script([http(503)])
    const b = withBreaker(fn, { now: clock().now })
    await expect(b.call()).rejects.toMatchObject({ status: 503 })
    await expect(b.call()).resolves.toBe('ok')
    expect(b.state()).toBe('closed')
  })

  it('failures ретраибельных ошибок подряд → open: fail fast, fn не вызывается', async () => {
    const c = clock()
    const fn = script([http(503), network(), http(529)])
    const b = withBreaker(fn, { failures: 3, cooldownMs: 10_000, now: c.now })
    for (let i = 0; i < 3; i++) await b.call().catch(() => {})
    expect(b.state()).toBe('open')
    c.advance(4000)
    await expect(b.call()).rejects.toMatchObject({ name: 'CircuitOpenError', retryAfterMs: 6000 })
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('успех посередине обнуляет счётчик: считаются только ошибки подряд', async () => {
    const fn = script([http(503), http(503), 'ok', http(503), http(503)])
    const b = withBreaker(fn, { failures: 3, now: clock().now })
    for (let i = 0; i < 5; i++) await b.call().catch(() => {})
    expect(b.state()).toBe('closed')
    expect(fn).toHaveBeenCalledTimes(5)
  })

  it('4xx и AbortError не открывают предохранитель: сервис жив, ошибка наша', async () => {
    const fn = script([http(400), http(404), http(413), aborted(), http(400)])
    const b = withBreaker(fn, { failures: 2, now: clock().now })
    for (let i = 0; i < 5; i++) await b.call().catch(() => {})
    expect(b.state()).toBe('closed')
    await expect(b.call()).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(6)
  })

  it('после cooldown одна проба (half-open): успех закрывает', async () => {
    const c = clock()
    const fn = script([http(529)])
    const b = withBreaker(fn, { failures: 1, cooldownMs: 10_000, now: c.now })
    await b.call().catch(() => {})
    expect(b.state()).toBe('open')
    c.advance(10_000)
    await expect(b.call()).resolves.toBe('ok')
    expect(b.state()).toBe('closed')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('проба упала → снова open на полный cooldown', async () => {
    const c = clock()
    const fn = script([http(529), http(503)])
    const b = withBreaker(fn, { failures: 1, cooldownMs: 10_000, now: c.now })
    await b.call().catch(() => {})
    c.advance(10_000)
    await expect(b.call()).rejects.toMatchObject({ status: 503 })
    expect(b.state()).toBe('open')
    c.advance(9_999)
    await expect(b.call()).rejects.toMatchObject({ name: 'CircuitOpenError', retryAfterMs: 1 })
    expect(fn).toHaveBeenCalledTimes(2)
    c.advance(1)
    await expect(b.call()).resolves.toBe('ok')
  })

  it('пока проба в полёте, остальные получают fail fast', async () => {
    const c = clock()
    let release!: (v: string) => void
    const gate = new Promise<string>((r) => { release = r })
    let n = 0
    const fn = vi.fn(async () => {
      if (n++ === 0) throw http(503)
      return gate // проба висит, пока тест её не отпустит
    })
    const b = withBreaker(fn, { failures: 1, cooldownMs: 1000, now: c.now })
    await b.call().catch(() => {})
    c.advance(1000)
    const probe = b.call()
    expect(b.state()).toBe('half-open')
    await expect(b.call()).rejects.toMatchObject({ name: 'CircuitOpenError' })
    expect(fn).toHaveBeenCalledTimes(2)
    release('ok')
    await expect(probe).resolves.toBe('ok')
    expect(b.state()).toBe('closed')
  })
})

describe('05 повторение: вместе', () => {
  it('лимитер внутри предохранителя: открытый предохранитель не тратит жетоны', async () => {
    const c = clock()
    const limiter = createLimiter({ ratePerSec: 1, burst: 2, now: c.now, sleep: c.sleep })
    const callModel = script([http(529)])
    const b = withBreaker(async () => {
      await limiter.take()
      return callModel()
    }, { failures: 1, now: c.now })
    await expect(b.call()).rejects.toMatchObject({ status: 529 })
    for (let i = 0; i < 3; i++) await expect(b.call()).rejects.toMatchObject({ name: 'CircuitOpenError' })
    await limiter.take() // второй жетон всё ещё в ведре
    expect(c.delays).toEqual([])
    expect(callModel).toHaveBeenCalledTimes(1)
  })
})
