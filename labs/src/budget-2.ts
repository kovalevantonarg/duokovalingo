import type Anthropic from '@anthropic-ai/sdk'

export class BudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetError'
  }
}

export type CompactOptions = {
  window: number // размер контекстного окна модели
  maxTokens: number // сколько резервируем на ответ
  count: (text: string) => number // размер сообщения = count(JSON.stringify(m.content))
  system?: string
  keepRecent?: number // сколько последних пар (assistant, user) не трогать никогда; по умолчанию 1
}

/** Текст заметки, которая встаёт на место выкинутого: trimNote(4) === '[обрезано 4 сообщений]'. */
export const trimNote = (k: number) => `[обрезано ${k} сообщений]`

/**
 * Ужать историю под бюджет, оставив след: модель должна знать, что часть разговора выкинута.
 * Форма истории: задача (user), затем пары (assistant, user).
 *
 * Порядок мыслей:
 * - бюджет = окно - max_tokens - system; если он уже не больше нуля, это BudgetError;
 * - влезает целиком → вернуть как есть, dropped = 0, никакой заметки;
 * - резать можно только целые пары после задачи (tool_use и tool_result живут в соседних сообщениях),
 *   самые старые первыми и не трогая последние keepRecent пар;
 * - заметку некуда вставить отдельным сообщением, не сломав чередование ролей: допиши её последним
 *   text-блоком в первое сообщение (content бывает строкой или массивом блоков);
 * - заметка тоже съедает бюджет, и её длина зависит от K;
 * - выкинул всё, что можно, и всё равно не влезает → BudgetError;
 * - входной массив и его сообщения не мутировать.
 */
export function compactHistory(
  messages: Anthropic.MessageParam[],
  o: CompactOptions,
): { messages: Anthropic.MessageParam[]; dropped: number } {
  throw new Error('TODO: повторение 04')
}
