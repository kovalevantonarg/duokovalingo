import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'
import { extract, ExtractionError, TruncatedError } from '@lab/extract'
import { fakeClient, msg, text, toolUse } from '../../shared/fake-client'

// «Валидный JSON» и «правильные данные» — разные вещи (KILL билета 12).
// refine ловит второе: дата возврата не может быть в будущем.
const Refund = z.object({
  order_id: z.string().regex(/^#W\d+$/),
  amount: z.number().positive(),
  reason: z.enum(['damaged', 'wrong_item', 'late', 'other']),
  purchased_at: z.iso.date().refine((d) => d <= '2026-10-29', 'purchase date cannot be in the future'),
})

const good = { order_id: '#W7', amount: 49.9, reason: 'damaged', purchased_at: '2026-10-01' }
const base = { model: 'm', schema: Refund, name: 'record_refund', description: 'Record a refund request', input: 'email text…' }

describe('03 extract: structured output через принудительный tool_use (билеты 12, 38)', () => {
  it('запрос: один инструмент со схемой и tool_choice, который заставляет его вызвать', async () => {
    const { client, requests } = fakeClient([msg([toolUse('record_refund', good)])])
    await extract({ client, ...base })
    const req = requests[0]!
    expect(req.tool_choice).toEqual({ type: 'tool', name: 'record_refund' })
    const t = req.tools![0] as Anthropic.Tool
    expect(t.name).toBe('record_refund')
    expect(t.input_schema.required).toEqual(expect.arrayContaining(['order_id', 'amount', 'reason', 'purchased_at']))
  })

  it('валидно с первого раза → данные типизированы, attempts = 1', async () => {
    const { client } = fakeClient([msg([toolUse('record_refund', good)])])
    const r = await extract({ client, ...base })
    expect(r).toEqual({ data: good, attempts: 1 })
  })

  it('не прошло схему → ошибки валидации уходят модели как tool_result is_error, вторая попытка успешна', async () => {
    const bad = { ...good, purchased_at: '2027-01-01' } // JSON валидный, данные неправильные
    const { client, requests } = fakeClient([msg([toolUse('record_refund', bad, 'toolu_X')]), msg([toolUse('record_refund', good)])])
    const r = await extract({ client, ...base })
    expect(r.attempts).toBe(2)

    const second = requests[1]!.messages
    expect(second.at(-2)!.role).toBe('assistant')
    const last = second.at(-1)!
    const [res] = last.content as Anthropic.ToolResultBlockParam[]
    expect(res!.tool_use_id).toBe('toolu_X')
    expect(res!.is_error).toBe(true)
    expect(String(res!.content)).toContain('purchased_at')
    expect(String(res!.content)).toContain('future')
  })

  it('модель упорно ошибается → ExtractionError после maxAttempts, лишних вызовов нет', async () => {
    const bad = () => msg([toolUse('record_refund', { ...good, amount: -5 })])
    const { client, requests } = fakeClient([bad, bad, bad, bad])
    const err = await extract({ client, ...base, maxAttempts: 3 }).catch((e) => e)
    expect(err).toBeInstanceOf(ExtractionError)
    expect(err.attempts).toBe(3)
    expect(err.message).toContain('amount')
    expect(requests).toHaveLength(3)
  })

  it('ответ без tool_use (только текст) → считается неудачной попыткой, ретрай просит вызвать инструмент', async () => {
    const { client, requests } = fakeClient([msg([text('Sure! Here is the JSON: {...}')]), msg([toolUse('record_refund', good)])])
    const r = await extract({ client, ...base })
    expect(r.attempts).toBe(2)
    const last = requests[1]!.messages.at(-1)!
    expect(last.role).toBe('user')
    expect(JSON.stringify(last.content)).toContain('record_refund')
    expect(JSON.stringify(last.content)).not.toContain('tool_result') // tool_result без tool_use = 400 от API
  })

  it('stop_reason max_tokens → TruncatedError сразу, без ретрая с тем же лимитом', async () => {
    const { client, requests } = fakeClient([msg([toolUse('record_refund', { order_id: '#W7' })], 'max_tokens')])
    await expect(extract({ client, ...base })).rejects.toBeInstanceOf(TruncatedError)
    expect(requests).toHaveLength(1)
  })
})
