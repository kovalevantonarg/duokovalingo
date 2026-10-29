import { describe, it, expect } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { compactHistory, BudgetError } from '@lab/budget-2'

// Тот же грубый счётчик, что в лабе: 1 токен = 4 символа сериализованного content.
const count = (s: string) => Math.ceil(s.length / 4)
const size = (m: M) => count(JSON.stringify(m.content))
const total = (ms: M[]) => ms.reduce((s, m) => s + size(m), 0)

type M = Anthropic.MessageParam
const TASK = 'TASK: найти дубликаты среди тикетов поддержки за октябрь'
const u = (t: string): M => ({ role: 'user', content: t })
const a = (t: string): M => ({ role: 'assistant', content: t })
const call = (id: string, pad = ''): M => ({ role: 'assistant', content: [{ type: 'tool_use', id, name: 'read_ticket', input: { pad } }] })
const result = (id: string, pad = ''): M => ({ role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: pad }] })

const pad = 'x'.repeat(400) // ~100 токенов

function history(turns: number, task: M['content'] = TASK): M[] {
  const ms: M[] = [{ role: 'user', content: task }]
  for (let i = 0; i < turns; i++) ms.push(call(`r${i}`, pad), result(`r${i}`, pad))
  ms.push(a('нашёл трёх кандидатов'), u('а что с тикетом #812?'))
  return ms
}

/** Что бросила функция: так в отчёте видно саму ошибку, а не только «не тот класс». */
const thrown = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return e
  }
  return undefined
}

/** Инварианты, которые API проверяет сам и отвечает 400, если нарушены. */
function assertValid(ms: M[]) {
  expect(ms[0]!.role).toBe('user')
  ms.forEach((m, i) => i > 0 && expect(m.role).not.toBe(ms[i - 1]!.role))
  ms.forEach((m, i) => {
    if (!Array.isArray(m.content)) return
    for (const b of m.content) {
      if (b.type !== 'tool_result') continue
      const prev = ms[i - 1]
      const ids = Array.isArray(prev?.content) ? prev.content.flatMap((p) => (p.type === 'tool_use' ? [p.id] : [])) : []
      expect(ids, `tool_result ${b.tool_use_id} без своего tool_use`).toContain(b.tool_use_id)
    }
  })
}

describe('04 повторение: бюджет и заметка об обрезке', () => {
  it('влезает → история как есть, dropped = 0, без заметки', () => {
    const ms = history(2)
    const r = compactHistory(ms, { window: 10_000, maxTokens: 1000, count })
    expect(r.dropped).toBe(0)
    expect(r.messages).toEqual(ms)
  })

  it('не влезает → самые старые пары выкинуты, в задаче последним блоком «[обрезано K сообщений]»', () => {
    const ms = history(6)
    const window = total(ms) - 300
    const r = compactHistory(ms, { window, maxTokens: 0, count })
    expect(r.dropped).toBe(4)
    expect(r.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: TASK },
        { type: 'text', text: '[обрезано 4 сообщений]' },
      ],
    })
    expect(r.messages.slice(1)).toEqual(ms.slice(5)) // всё после выкинутого не тронуто
    expect(total(r.messages)).toBeLessThanOrEqual(window)
  })

  it('заметка тоже стоит токенов: без неё хватило бы одной пары, с ней режутся две', () => {
    const ms = history(6)
    const pair = size(ms[1]!) + size(ms[2]!)
    const window = total(ms) - pair + 5
    expect(total(ms) - pair).toBeLessThanOrEqual(window) // без заметки одной пары достаточно
    const r = compactHistory(ms, { window, maxTokens: 0, count })
    expect(r.dropped).toBe(4)
    expect(total(r.messages)).toBeLessThanOrEqual(window)
  })

  it('max_tokens и system вычитаются из окна', () => {
    const ms = history(2)
    const window = total(ms) + 100
    expect(compactHistory(ms, { window, maxTokens: 0, count }).dropped).toBe(0)
    expect(compactHistory(ms, { window, maxTokens: 150, count }).dropped).toBeGreaterThan(0)
    expect(compactHistory(ms, { window, maxTokens: 0, count, system: 'y'.repeat(800) }).dropped).toBeGreaterThan(0)
  })

  it('на любом бюджете: результат влезает и валиден для API, или честная BudgetError', () => {
    const ms = history(8)
    for (let cut = 40; cut < total(ms); cut += 41) {
      const window = total(ms) - cut
      let r
      try {
        r = compactHistory(ms, { window, maxTokens: 0, count })
      } catch (e) {
        expect(e).toBeInstanceOf(BudgetError)
        continue
      }
      assertValid(r.messages)
      expect(total(r.messages)).toBeLessThanOrEqual(window)
      expect(r.messages.at(-1)).toEqual(ms.at(-1))
    }
  })
})

describe('04 повторение: что закреплено и что нельзя трогать', () => {
  it('keepRecent: последние N пар не трогаются, режется только то, что старше', () => {
    const ms = history(6)
    const r = compactHistory(ms, { window: total(ms) - 300, maxTokens: 0, count, keepRecent: 3 })
    expect(r.dropped).toBeGreaterThan(0)
    expect(r.messages.slice(-6)).toEqual(ms.slice(-6))
    assertValid(r.messages)

    // нужно выкинуть 5 пар: с keepRecent 1 это можно, с keepRecent 3 закреплённое трогать нельзя
    const pair = size(ms[1]!) + size(ms[2]!)
    const tight = { window: total(ms) - 5 * pair, maxTokens: 0, count }
    expect(compactHistory(ms, tight).dropped).toBeGreaterThanOrEqual(10)
    expect(thrown(() => compactHistory(ms, { ...tight, keepRecent: 3 }))).toBeInstanceOf(BudgetError)
  })

  it('задача массивом блоков: исходные блоки на месте, заметка добавлена последним блоком', () => {
    const task: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: TASK },
      { type: 'text', text: 'Контекст: тикеты лежат в Zendesk, дубликат = тот же заказ и та же проблема' },
    ]
    const ms = history(6, task)
    const r = compactHistory(ms, { window: total(ms) - 300, maxTokens: 0, count })
    expect(r.messages[0]!.content).toEqual([...task, { type: 'text', text: `[обрезано ${r.dropped} сообщений]` }])
  })

  it('не мутирует вход: ни массив, ни первое сообщение', () => {
    for (const ms of [history(6), history(6, [{ type: 'text', text: TASK }])]) {
      const copy = structuredClone(ms)
      compactHistory(ms, { window: total(ms) - 300, maxTokens: 0, count })
      expect(ms).toEqual(copy)
    }
  })

  it('задача + заметка + закреплённые пары не влезают → BudgetError, а не обрезанный вопрос', () => {
    const ms = history(4) // 11 сообщений: задача и 5 пар
    expect(thrown(() => compactHistory(ms, { window: total(ms) - 10, maxTokens: 0, count, keepRecent: 5 }))).toBeInstanceOf(BudgetError)
    const huge = [u('z'.repeat(4000)), a('ok'), u('дальше?')]
    expect(thrown(() => compactHistory(huge, { window: 500, maxTokens: 0, count }))).toBeInstanceOf(BudgetError)
  })

  it('system + max_tokens съели всё окно → BudgetError', () => {
    expect(thrown(() => compactHistory(history(1), { window: 100, maxTokens: 50, count, system: 'y'.repeat(400) }))).toBeInstanceOf(BudgetError)
  })
})
