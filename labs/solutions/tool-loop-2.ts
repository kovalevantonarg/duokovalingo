import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { LLM } from '../shared/fake-client'

export type SupportTool<S extends z.ZodType = z.ZodType> = {
  name: string
  description: string
  schema: S
  handler: (args: z.infer<S>) => Promise<unknown>
}

/** Цена в долларах за миллион токенов. */
export type Pricing = { inputPerMTok: number; outputPerMTok: number }

export type SupportStatus = 'done' | 'truncated' | 'refused' | 'turn_limit' | 'over_budget'

export type StepInfo = {
  turn: number // номер вызова модели, с 1
  stopReason: Anthropic.StopReason | null
  calls: { name: string; isError: boolean }[] // инструменты, исполненные на этом ходу
  spentUsd: number // потрачено с начала диалога, включая этот ход
}

export type SupportOptions = {
  client: LLM
  model: string
  system?: string
  tools: SupportTool<any>[]
  history: Anthropic.MessageParam[]
  pricing: Pricing
  budgetUsd?: number
  maxTurns?: number
  maxTokens?: number
  onStep?: (step: StepInfo) => void
}

export type SupportResult = {
  status: SupportStatus
  answer: string
  transcript: Anthropic.MessageParam[]
  spentUsd: number
}

export async function runSupportAgent(o: SupportOptions): Promise<SupportResult> {
  const { client, tools, pricing } = o
  const maxTurns = o.maxTurns ?? 8
  const budgetUsd = o.budgetUsd ?? Infinity

  // Массив не гарантирует уникальность имён, а модель зовёт инструмент по имени.
  // Ошибка конфигурации: падаем сразу, до первого платного вызова.
  const byName = new Map<string, SupportTool<any>>()
  for (const t of tools) {
    if (byName.has(t.name)) throw new Error(`Duplicate tool name "${t.name}"`)
    byName.set(t.name, t)
  }

  const toolDefs: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(t.schema) as Anthropic.Tool.InputSchema,
  }))

  const transcript = [...o.history]
  let spentUsd = 0
  let turn = 0
  let answer = ''
  const finish = (status: SupportStatus): SupportResult => ({ status, answer, transcript, spentUsd })

  while (true) {
    if (turn >= maxTurns) return finish('turn_limit')
    if (spentUsd >= budgetUsd) return finish('over_budget')

    const res = await client.messages.create({
      model: o.model,
      max_tokens: o.maxTokens ?? 1024,
      ...(o.system ? { system: o.system } : {}),
      ...(toolDefs.length ? { tools: toolDefs } : {}),
      messages: transcript,
    })
    turn++
    // Делим на миллион один раз в конце: меньше шума плавающей точки.
    spentUsd += (res.usage.input_tokens * pricing.inputPerMTok + res.usage.output_tokens * pricing.outputPerMTok) / 1e6
    transcript.push({ role: 'assistant', content: res.content })
    answer = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')

    const step = (calls: StepInfo['calls'] = []) =>
      o.onStep?.({ turn, stopReason: res.stop_reason, calls, spentUsd })

    if (res.stop_reason !== 'tool_use') {
      step()
      if (res.stop_reason === 'max_tokens' || res.stop_reason === 'model_context_window_exceeded') return finish('truncated')
      if (res.stop_reason === 'refusal') return finish('refused')
      return finish('done')
    }

    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const results = await Promise.all(uses.map((u) => execute(u, byName)))
    transcript.push({ role: 'user', content: results })
    step(uses.map((u, i) => ({ name: u.name, isError: results[i]!.is_error === true })))
  }
}

async function execute(use: Anthropic.ToolUseBlock, byName: Map<string, SupportTool<any>>): Promise<Anthropic.ToolResultBlockParam> {
  const fail = (content: string): Anthropic.ToolResultBlockParam => ({
    type: 'tool_result',
    tool_use_id: use.id,
    is_error: true,
    content,
  })

  const tool = byName.get(use.name)
  if (!tool) return fail(`Unknown tool "${use.name}". Available: ${[...byName.keys()].join(', ') || 'none'}`)

  const parsed = tool.schema.safeParse(use.input)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i: { path: PropertyKey[]; message: string }) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    return fail(`Invalid input: ${issues}`)
  }

  try {
    const out = await tool.handler(parsed.data)
    return { type: 'tool_result', tool_use_id: use.id, content: typeof out === 'string' ? out : JSON.stringify(out) }
  } catch (e) {
    return fail(`Error: ${(e as Error).message}`)
  }
}
