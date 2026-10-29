import { describe, it, expect } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { fitToBudget, BudgetError } from '@lab/budget'

// Грубый счётчик для тестов: 1 токен = 4 символа сериализованного сообщения.
// В проде: messages.countTokens или usage.input_tokens прошлого хода.
const count = (s: string) => Math.ceil(s.length / 4)
const size = (m: Anthropic.MessageParam) => count(JSON.stringify(m.content))
const total = (ms: Anthropic.MessageParam[]) => ms.reduce((s, m) => s + size(m), 0)

type M = Anthropic.MessageParam
const u = (t: string): M => ({ role: 'user', content: t })
const a = (t: string): M => ({ role: 'assistant', content: t })
const call = (id: string, pad = ''): M => ({ role: 'assistant', content: [{ type: 'tool_use', id, name: 'get_order', input: { pad } }] })
const result = (id: string, pad = ''): M => ({ role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: pad }] })

const big = 'x'.repeat(400) // ~100 токенов

function conversation(turns: number): M[] {
  const ms: M[] = [u('TASK: refund order #W7')]
  for (let i = 0; i < turns; i++) ms.push(call(`t${i}`, big), result(`t${i}`, big))
  ms.push(a('checking'), u('and the second order?'))
  return ms
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

describe('04 fitToBudget: окно = вход + max_tokens (билеты 2, 10)', () => {
  it('влезает → ничего не трогает', () => {
    const ms = conversation(2)
    const r = fitToBudget(ms, { window: 10_000, maxTokens: 1000, count })
    expect(r.dropped).toBe(0)
    expect(r.messages).toEqual(ms)
  })

  it('max_tokens входит в бюджет: вход 195k-аналог + 8k ответа не влезает в 200k-аналог', () => {
    const ms = conversation(4)
    const window = total(ms) + 500
    expect(fitToBudget(ms, { window, maxTokens: 400, count }).dropped).toBe(0)
    expect(fitToBudget(ms, { window, maxTokens: 800, count }).dropped).toBeGreaterThan(0)
  })

  it('режет самое старое, а первое сообщение (задачу) и последнее (текущий вопрос) сохраняет', () => {
    const ms = conversation(6)
    const r = fitToBudget(ms, { window: total(ms) - 150, maxTokens: 0, count })
    expect(r.messages[0]).toEqual(ms[0])
    expect(r.messages.at(-1)).toEqual(ms.at(-1))
    expect(r.messages.length).toBe(ms.length - r.dropped)
    expect(total(r.messages)).toBeLessThanOrEqual(total(ms) - 150)
  })

  it('режет минимально: выкидывает ровно столько, сколько нужно', () => {
    const ms = conversation(6)
    const r = fitToBudget(ms, { window: total(ms) - 150, maxTokens: 0, count })
    expect(r.dropped).toBe(2) // одна пара call+result это ~200 токенов, хватает
  })

  it('никогда не оставляет tool_result без tool_use и не ломает чередование ролей', () => {
    const ms = conversation(8)
    for (let cut = 50; cut < total(ms) - 60; cut += 37) {
      let r
      try {
        r = fitToBudget(ms, { window: total(ms) - cut, maxTokens: 0, count })
      } catch (e) {
        expect(e).toBeInstanceOf(BudgetError)
        continue
      }
      assertValid(r.messages)
    }
  })

  it('system промпт тоже съедает окно', () => {
    const ms = conversation(2)
    const window = total(ms) + 100
    expect(fitToBudget(ms, { window, maxTokens: 0, count }).dropped).toBe(0)
    expect(fitToBudget(ms, { window, maxTokens: 0, count, system: 'y'.repeat(800) }).dropped).toBeGreaterThan(0)
  })

  it('сам system + max_tokens больше окна → BudgetError, а не пустой запрос', () => {
    expect(() => fitToBudget(conversation(1), { window: 100, maxTokens: 50, count, system: 'y'.repeat(400) })).toThrow(BudgetError)
  })

  it('даже задача + текущий вопрос не влезают → BudgetError (молча резать вопрос пользователя нельзя)', () => {
    const ms = [u('TASK'), a('ok'), u('z'.repeat(4000))]
    expect(() => fitToBudget(ms, { window: 500, maxTokens: 0, count })).toThrow(BudgetError)
  })

  it('не мутирует входной массив', () => {
    const ms = conversation(6)
    const copy = structuredClone(ms)
    fitToBudget(ms, { window: total(ms) - 300, maxTokens: 0, count })
    expect(ms).toEqual(copy)
  })
})
