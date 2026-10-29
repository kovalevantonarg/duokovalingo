import type Anthropic from '@anthropic-ai/sdk'

export class BudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetError'
  }
}

export type BudgetOptions = {
  window: number // размер контекстного окна модели
  maxTokens: number // сколько резервируем на ответ
  count: (text: string) => number // счётчик токенов; размер сообщения = count(JSON.stringify(m.content))
  system?: string
}

/**
 * Обрезать историю, чтобы вход + ответ влезли в окно.
 * Подумай до кода: какие сообщения нельзя удалять по отдельности и почему API ответит 400.
 */
export function fitToBudget(
  messages: Anthropic.MessageParam[],
  o: BudgetOptions,
): { messages: Anthropic.MessageParam[]; dropped: number } {
  throw new Error('TODO: lab 04')
}
