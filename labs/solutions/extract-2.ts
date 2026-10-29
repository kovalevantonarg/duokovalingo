import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { LLM } from '../shared/fake-client'

export const TOOL_NAME = 'record_invoice'

/** Типы и форматы: это схема знает сама и отдаёт модели через JSON Schema. */
export const LineItem = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
})

export const InvoiceDraft = z.object({
  invoice_number: z.string().regex(/^INV-\d+$/),
  vendor: z.string().min(1),
  currency: z.enum(['USD', 'EUR', 'ARS']),
  issued_at: z.iso.date(),
  due_at: z.iso.date(),
  items: z.array(LineItem).min(1),
  total: z.number().positive(),
})
export type InvoiceDraft = z.infer<typeof InvoiceDraft>

/**
 * Бизнес-правила, которые связывают несколько полей. В JSON Schema они не попадают
 * (z.toJSONSchema их молча пропускает), поэтому проверяем их только мы.
 */
export function invoiceRules(inv: InvoiceDraft, ctx: z.RefinementCtx<InvoiceDraft>): void {
  // ISO-даты YYYY-MM-DD сравниваются как строки
  if (inv.due_at <= inv.issued_at) {
    ctx.addIssue({ code: 'custom', path: ['due_at'], message: `due date must be after issued_at (${inv.issued_at})` })
  }
  // деньги сравниваем в центах: 3 * 0.1 в float это 0.30000000000000004
  const sum = inv.items.reduce((s, it) => s + it.quantity * it.unit_price, 0)
  if (Math.round(sum * 100) !== Math.round(inv.total * 100)) {
    // path обязателен: без него ошибка висит на корне, и модель не знает, какое поле чинить
    ctx.addIssue({ code: 'custom', path: ['total'], message: `total ${inv.total} does not match sum of items ${sum.toFixed(2)}` })
  }
}

export const Invoice = InvoiceDraft.superRefine(invoiceRules)
export type Invoice = z.infer<typeof Invoice>

export class InvoiceExtractionError extends Error {
  constructor(message: string, public attempts: number, public issues: string[]) {
    super(message)
    this.name = 'InvoiceExtractionError'
  }
}

export class InvoiceTruncatedError extends Error {
  constructor() {
    super('Invoice output was cut by max_tokens: raise the limit, retrying with the same one will fail again')
    this.name = 'InvoiceTruncatedError'
  }
}

export type ExtractInvoiceOptions = {
  client: LLM
  model: string
  document: string
  maxAttempts?: number
  maxTokens?: number
}

export async function extractInvoice(o: ExtractInvoiceOptions): Promise<{ invoice: Invoice; attempts: number }> {
  const maxAttempts = o.maxAttempts ?? 3
  const tool: Anthropic.Tool = {
    name: TOOL_NAME,
    description: 'Record the invoice fields exactly as printed in the document',
    input_schema: z.toJSONSchema(Invoice) as Anthropic.Tool.InputSchema,
  }
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: o.document }]
  let issues: string[] = []

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await o.client.messages.create({
      model: o.model,
      max_tokens: o.maxTokens ?? 2048,
      tools: [tool],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages,
    })
    // обрезанный JSON не чинится повтором с тем же лимитом
    if (res.stop_reason === 'max_tokens') throw new InvoiceTruncatedError()

    messages.push({ role: 'assistant', content: res.content })
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME)

    if (!call) {
      // tool_use нет, значит и tool_result ссылаться не на что: просим обычным текстом
      issues = [`model answered with text instead of calling ${TOOL_NAME}`]
      messages.push({ role: 'user', content: `Respond only by calling the ${TOOL_NAME} tool.` })
      continue
    }

    const parsed = Invoice.safeParse(call.input)
    if (parsed.success) return { invoice: parsed.data, attempts: attempt }

    // путь целиком: items.1.quantity, а не просто quantity
    issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: call.id,
          is_error: true,
          content: `Validation failed: ${issues.join('; ')}. Fix these fields and call ${TOOL_NAME} again.`,
        },
      ],
    })
  }
  throw new InvoiceExtractionError(`Invoice extraction failed after ${maxAttempts} attempts: ${issues.join('; ')}`, maxAttempts, issues)
}
