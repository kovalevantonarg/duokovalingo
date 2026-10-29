import type Anthropic from '@anthropic-ai/sdk'

export class BudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetError'
  }
}

export type CompactOptions = {
  window: number
  maxTokens: number
  count: (text: string) => number
  system?: string
  keepRecent?: number
}

/** Текст заметки, которая встаёт на место выкинутого. */
export const trimNote = (k: number) => `[обрезано ${k} сообщений]`

/**
 * История имеет форму: задача (user), затем пары (assistant, user). Выкидываем самые старые пары
 * целиком, последние keepRecent пар не трогаем, а в первое сообщение дописываем заметку.
 * Заметка не может быть отдельным сообщением: между задачей (user) и хвостом (начинается с assistant)
 * нет места для третьей роли, поэтому она идёт последним text-блоком задачи.
 */
export function compactHistory(
  messages: Anthropic.MessageParam[],
  o: CompactOptions,
): { messages: Anthropic.MessageParam[]; dropped: number } {
  const size = (m: Anthropic.MessageParam) => o.count(JSON.stringify(m.content))
  const budget = o.window - o.maxTokens - (o.system ? o.count(o.system) : 0)
  if (budget <= 0) throw new BudgetError(`system + max_tokens already exceed the window (${budget} left)`)

  const sizes = messages.map(size)
  const total = sizes.reduce((s, n) => s + n, 0)
  if (total <= budget) return { messages, dropped: 0 }

  const first = messages[0]!
  // content бывает строкой или массивом блоков; копируем, исходное сообщение не трогаем
  const blocks: Anthropic.ContentBlockParam[] =
    typeof first.content === 'string' ? [{ type: 'text', text: first.content }] : [...first.content]
  const withNote = (k: number): Anthropic.MessageParam => ({
    role: 'user', // первое сообщение истории всегда user: задача
    content: [...blocks, { type: 'text', text: trimNote(k) }],
  })

  // с этого индекса начинается закреплённый хвост из keepRecent последних пар
  const tailFrom = Math.max(1, messages.length - 2 * (o.keepRecent ?? 1))
  let rest = total - sizes[0]! // всё, кроме первого сообщения
  let from = 1
  while (from + 1 < tailFrom) {
    rest -= sizes[from]! + sizes[from + 1]!
    from += 2
    // заметка меняет размер первого сообщения, а её длина зависит от K: пересчитываем каждый раз
    const head = withNote(from - 1)
    if (size(head) + rest <= budget) return { messages: [head, ...messages.slice(from)], dropped: from - 1 }
  }
  throw new BudgetError(`task + note + last ${o.keepRecent ?? 1} turns do not fit: budget is ${budget}`)
}
