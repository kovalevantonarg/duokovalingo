import type Anthropic from '@anthropic-ai/sdk'

export class BudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetError'
  }
}

export type BudgetOptions = {
  window: number
  maxTokens: number
  count: (text: string) => number
  system?: string
}

/**
 * Окно делят вход И ответ: если вход + max_tokens > окна, места на ответ нет.
 * Режем парами (assistant, user) после первого сообщения: tool_use и его tool_result
 * живут в соседних сообщениях, поэтому пара удаляется только целиком.
 */
export function fitToBudget(
  messages: Anthropic.MessageParam[],
  o: BudgetOptions,
): { messages: Anthropic.MessageParam[]; dropped: number } {
  const size = (m: Anthropic.MessageParam) => o.count(JSON.stringify(m.content))
  const budget = o.window - o.maxTokens - (o.system ? o.count(o.system) : 0)
  if (budget <= 0) throw new BudgetError(`system + max_tokens already exceed the window (${budget} left)`)

  const sizes = messages.map(size)
  let used = sizes.reduce((s, n) => s + n, 0)
  if (used <= budget) return { messages, dropped: 0 }

  // первое сообщение (задача) и последнюю пару (текущий ход) не трогаем
  const last = messages.length - 1
  let from = 1
  while (used > budget && from + 1 < last) {
    used -= sizes[from]! + sizes[from + 1]!
    from += 2
  }
  if (used > budget) throw new BudgetError(`task + current turn alone need ${used} tokens, budget is ${budget}`)

  const kept = [messages[0]!, ...messages.slice(from)]
  return { messages: kept, dropped: messages.length - kept.length }
}
