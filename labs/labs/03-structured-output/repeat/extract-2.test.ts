import { describe, it, expect } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { Invoice, extractInvoice, InvoiceExtractionError, InvoiceTruncatedError } from '@lab/extract-2'
import { fakeClient, msg, text, toolUse } from '../../../shared/fake-client'

// 2 * 15000 + 1 * 9000 = 39000
const good = {
  invoice_number: 'INV-1042',
  vendor: 'Panadería Sol',
  currency: 'ARS',
  issued_at: '2026-10-01',
  due_at: '2026-10-31',
  items: [
    { description: 'Café en grano 1kg', quantity: 2, unit_price: 15000 },
    { description: 'Medialunas x12', quantity: 1, unit_price: 9000 },
  ],
  total: 39000,
}
const base = { model: 'm', document: 'FACTURA INV-1042, Panadería Sol…' }

const issuePaths = (input: unknown) => {
  const r = Invoice.safeParse(input)
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
}

describe('03 повторение: бизнес-правила живут в схеме, а не в промпте', () => {
  it('правильный счёт проходит схему целиком', () => {
    expect(Invoice.safeParse(good).success).toBe(true)
  })

  it('срок оплаты раньше даты счёта → ошибка висит на поле due_at', () => {
    expect(issuePaths({ ...good, due_at: '2026-09-15' })).toEqual(['due_at'])
  })

  it('total не равен сумме позиций → ошибка на поле total, в тексте настоящая сумма', () => {
    const r = Invoice.safeParse({ ...good, total: 40000 })
    expect(r.success).toBe(false)
    const issue = r.error!.issues[0]!
    expect(issue.path).toEqual(['total'])
    expect(issue.message).toContain('39000')
  })

  it('float не ломает сравнение денег: 3 × 0.1 это ровно 0.3', () => {
    const cheap = { ...good, items: [{ description: 'Bolsa', quantity: 3, unit_price: 0.1 }], total: 0.3 }
    expect(Invoice.safeParse(cheap).success).toBe(true)
  })
})

describe('03 повторение: extractInvoice, обратная связь модели', () => {
  it('запрос: инструмент record_invoice со схемой счёта и tool_choice, который заставляет его вызвать', async () => {
    const { client, requests } = fakeClient([msg([toolUse('record_invoice', good)])])
    await extractInvoice({ client, ...base })
    const req = requests[0]!
    expect(req.tool_choice).toEqual({ type: 'tool', name: 'record_invoice' })
    expect(req.tools).toHaveLength(1)
    const t = req.tools![0] as Anthropic.Tool
    expect(t.name).toBe('record_invoice')
    expect(t.input_schema.required).toEqual(expect.arrayContaining(['invoice_number', 'issued_at', 'due_at', 'items', 'total']))
    expect(t.input_schema.properties).toHaveProperty('items.type', 'array')
    expect(req.messages[0]).toEqual({ role: 'user', content: base.document })
  })

  it('валидный счёт с первого раза → { invoice, attempts: 1 }', async () => {
    const { client } = fakeClient([msg([toolUse('record_invoice', good)])])
    await expect(extractInvoice({ client, ...base })).resolves.toEqual({ invoice: good, attempts: 1 })
  })

  it('нарушено бизнес-правило → tool_result is_error с полем total и суммой, вторая попытка успешна', async () => {
    const bad = { ...good, total: 40000 } // по типам всё верно, по смыслу нет
    const { client, requests } = fakeClient([msg([toolUse('record_invoice', bad, 'toolu_INV')]), msg([toolUse('record_invoice', good)])])
    const r = await extractInvoice({ client, ...base })
    expect(r.attempts).toBe(2)

    const second = requests[1]!.messages
    expect(second).toHaveLength(3) // документ, ответ модели, tool_result
    expect(second[1]!.role).toBe('assistant')
    const [res] = second[2]!.content as Anthropic.ToolResultBlockParam[]
    expect(res!.type).toBe('tool_result')
    expect(res!.tool_use_id).toBe('toolu_INV')
    expect(res!.is_error).toBe(true)
    expect(String(res!.content)).toContain('total')
    expect(String(res!.content)).toContain('39000')
  })

  it('ошибка во вложенной позиции → в tool_result полный путь поля items.1.quantity', async () => {
    const items = [good.items[0]!, { ...good.items[1]!, quantity: 0 }]
    const { client, requests } = fakeClient([msg([toolUse('record_invoice', { ...good, items })]), msg([toolUse('record_invoice', good)])])
    await extractInvoice({ client, ...base })
    const [res] = requests[1]!.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[]
    expect(String(res!.content)).toContain('items.1.quantity')
  })
})

describe('03 повторение: когда остановиться', () => {
  it('модель упорно ошибается → InvoiceExtractionError после maxAttempts, issues с полями, лишних вызовов нет', async () => {
    const bad = () => msg([toolUse('record_invoice', { ...good, due_at: '2026-01-01' })])
    const { client, requests } = fakeClient([bad, bad, bad])
    const err = await extractInvoice({ client, ...base, maxAttempts: 2 }).catch((e) => e)
    expect(err).toBeInstanceOf(InvoiceExtractionError)
    expect(err.attempts).toBe(2)
    expect(err.issues).toEqual([expect.stringContaining('due_at')])
    expect(err.message).toContain('due_at')
    expect(requests).toHaveLength(2)
  })

  it('ответ текстом → следующая попытка просит вызвать record_invoice обычным текстом, без tool_result', async () => {
    const { client, requests } = fakeClient([msg([text('Here is the invoice: INV-1042, total 39000')]), msg([toolUse('record_invoice', good)])])
    const r = await extractInvoice({ client, ...base })
    expect(r.attempts).toBe(2)
    const last = requests[1]!.messages.at(-1)!
    expect(last.role).toBe('user')
    expect(JSON.stringify(last.content)).toContain('record_invoice')
    expect(JSON.stringify(last.content)).not.toContain('tool_result') // tool_result без tool_use = 400 от API
  })

  it('текст на всех попытках → InvoiceExtractionError объясняет, что инструмент так и не вызвали', async () => {
    const chat = () => msg([text('I think the total is 39000.')])
    const { client } = fakeClient([chat, chat, chat])
    const err = await extractInvoice({ client, ...base }).catch((e) => e)
    expect(err).toBeInstanceOf(InvoiceExtractionError)
    expect(err.attempts).toBe(3)
    expect(err.issues).toEqual([expect.stringContaining('record_invoice')])
  })

  it('stop_reason max_tokens → InvoiceTruncatedError сразу, один запрос', async () => {
    const { client, requests } = fakeClient([msg([toolUse('record_invoice', { invoice_number: 'INV-1042' })], 'max_tokens')])
    await expect(extractInvoice({ client, ...base })).rejects.toBeInstanceOf(InvoiceTruncatedError)
    expect(requests).toHaveLength(1)
  })
})
