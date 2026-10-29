import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { LLM } from '../shared/fake-client'

export class ExtractionError extends Error {
  constructor(message: string, public attempts: number) {
    super(message)
    this.name = 'ExtractionError'
  }
}

export class TruncatedError extends Error {
  constructor() {
    super('Output was cut by max_tokens')
    this.name = 'TruncatedError'
  }
}

export type ExtractOptions<S extends z.ZodType> = {
  client: LLM
  model: string
  schema: S
  name: string // имя инструмента
  description: string
  input: string // текст, из которого извлекаем
  maxAttempts?: number // по умолчанию 3
  maxTokens?: number
}

/**
 * JSON по схеме через принудительный вызов инструмента (tool_choice).
 * Валидируешь zod-ом сам: схема в запросе — подсказка модели, а не проверка.
 * Ошибку валидации возвращаешь модели так, чтобы она поняла, какое поле чинить.
 */
export async function extract<S extends z.ZodType>(o: ExtractOptions<S>): Promise<{ data: z.infer<S>; attempts: number }> {
  throw new Error('TODO: lab 03')
}
