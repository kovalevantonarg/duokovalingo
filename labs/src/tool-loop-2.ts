import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { LLM } from '../shared/fake-client'

export type SupportTool<S extends z.ZodType = z.ZodType> = {
  name: string // имя, по которому модель зовёт инструмент
  description: string
  schema: S // zod-схема аргументов
  handler: (args: z.infer<S>) => Promise<unknown>
}

/** Цена в долларах за миллион токенов. */
export type Pricing = { inputPerMTok: number; outputPerMTok: number }

export type SupportStatus = 'done' | 'truncated' | 'refused' | 'turn_limit' | 'over_budget'

export type StepInfo = {
  turn: number // номер вызова модели, с 1
  stopReason: Anthropic.StopReason | null
  calls: { name: string; isError: boolean }[] // инструменты, исполненные на этом ходу (пусто, если не исполняли)
  spentUsd: number // потрачено с начала диалога, включая этот ход
}

export type SupportOptions = {
  client: LLM
  model: string
  system?: string
  tools: SupportTool<any>[] // массив, а не объект: имена могут повториться
  history: Anthropic.MessageParam[]
  pricing: Pricing
  budgetUsd?: number // по умолчанию без ограничения
  maxTurns?: number // по умолчанию 8
  maxTokens?: number
  onStep?: (step: StepInfo) => void // один раз на каждый ответ модели, после исполнения его инструментов
}

export type SupportResult = {
  status: SupportStatus
  answer: string // текст последнего ответа модели
  transcript: Anthropic.MessageParam[] // вся история, включая последний ответ
  spentUsd: number
}

/**
 * Агент поддержки провайдера. Порядок мыслей, а не код:
 *  1. До цикла: проверь, что имена инструментов уникальны, и собери Map имя → инструмент.
 *  2. Перед каждым вызовом модели: не кончились ли ходы? не кончился ли бюджет?
 *  3. После ответа: посчитай стоимость хода по usage и pricing, положи ответ в transcript целиком.
 *  4. Решение по stop_reason: max_tokens и model_context_window_exceeded это обрезка, инструменты не трогаем.
 *  5. Все tool_result одного хода, в порядке вызовов, в одном user-сообщении.
 *  6. Неизвестное имя, кривые аргументы, исключение в handler: всё это tool_result с is_error.
 *  7. onStep зови один раз на ход, когда уже знаешь, какие вызовы упали.
 */
export async function runSupportAgent(o: SupportOptions): Promise<SupportResult> {
  throw new Error('TODO: повторение 01')
}
