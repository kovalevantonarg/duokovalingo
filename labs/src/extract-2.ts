import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { LLM } from '../shared/fake-client'

export const TOOL_NAME = 'record_invoice'

/** Типы и форматы полей уже описаны: это часть схемы, которую увидит модель. */
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
 * Бизнес-правила счёта, которые связывают несколько полей.
 *
 * Порядок мыслей:
 * - срок оплаты due_at строго позже даты счёта issued_at (ISO-даты можно сравнивать как строки);
 * - сумма quantity * unit_price по всем позициям равна total; деньги во float сравнивай аккуратно;
 * - каждая проблема это ctx.addIssue({ code: 'custom', path: [...], message }); без path ошибка
 *   повиснет на корне объекта, и модель не поймёт, какое поле чинить;
 * - в message для total положи настоящую сумму позиций: модели нужна цифра, а не «неправильно».
 */
export function invoiceRules(inv: InvoiceDraft, ctx: z.RefinementCtx<InvoiceDraft>): void {
  throw new Error('TODO: повторение 03')
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
    super('Invoice output was cut by max_tokens')
    this.name = 'InvoiceTruncatedError'
  }
}

export type ExtractInvoiceOptions = {
  client: LLM
  model: string
  document: string // текст счёта (письмо, OCR из PDF)
  maxAttempts?: number // по умолчанию 3
  maxTokens?: number
}

/**
 * Извлечь счёт через принудительный вызов инструмента record_invoice.
 *
 * Порядок мыслей:
 * - инструмент: name = TOOL_NAME, input_schema из схемы Invoice, tool_choice заставляет его вызвать;
 * - цикл попыток; первым делом stop_reason: max_tokens означает обрезанный JSON, ретрай не поможет;
 * - ответ модели кладёшь в историю, ищешь в нём tool_use с нужным именем;
 * - нет tool_use: обычное user-сообщение с просьбой вызвать инструмент (tool_result ссылаться не на что);
 * - есть: Invoice.safeParse; успех → { invoice, attempts }, ошибка → tool_result с is_error и путями полей;
 * - попытки кончились → InvoiceExtractionError с attempts и issues последней попытки.
 */
export async function extractInvoice(o: ExtractInvoiceOptions): Promise<{ invoice: Invoice; attempts: number }> {
  throw new Error('TODO: повторение 03')
}
