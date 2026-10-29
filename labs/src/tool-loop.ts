import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { LLM } from '../shared/fake-client'

export type Tool<S extends z.ZodType> = {
  description: string
  input: S
  run: (input: z.infer<S>, ctx: { signal?: AbortSignal }) => Promise<unknown>
}

export type StopReason = 'end_turn' | 'max_turns' | 'max_tokens' | 'refusal' | 'aborted' | 'loop_detected'

export type RunResult = {
  reason: StopReason
  text: string // текст последнего ответа модели
  messages: Anthropic.MessageParam[] // вся история, включая последний ответ
  turns: number // сколько раз вызвали модель
  usage: { input: number; output: number } // сумма по всем ходам
}

export type RunOptions = {
  client: LLM
  model: string
  system?: string
  tools: Record<string, Tool<any>>
  messages: Anthropic.MessageParam[]
  maxTurns?: number // по умолчанию 10
  maxTokens?: number
  maxRepeats?: number // сколько раз можно исполнить ОДИН И ТОТ ЖЕ вызов (имя + аргументы), по умолчанию 2
  signal?: AbortSignal
}

/**
 * Агентный цикл. Порядок мыслей, а не код:
 *  1. Схема инструмента для API: z.toJSONSchema(tool.input).
 *  2. Перед каждым вызовом модели: не отменили ли? не кончились ли ходы?
 *  3. Ответ ассистента кладётся в историю целиком, как пришёл.
 *  4. Решение принимается по stop_reason, а не по наличию tool_use в content.
 *  5. Все tool_result одного хода — в одном user-сообщении.
 *  6. Любая ошибка инструмента становится tool_result с is_error, цикл живёт дальше.
 */
export async function runAgent(o: RunOptions): Promise<RunResult> {
  throw new Error('TODO: lab 01')
}
