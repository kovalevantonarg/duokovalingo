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
  text: string
  messages: Anthropic.MessageParam[]
  turns: number
  usage: { input: number; output: number }
}

export type RunOptions = {
  client: LLM
  model: string
  system?: string
  tools: Record<string, Tool<any>>
  messages: Anthropic.MessageParam[]
  maxTurns?: number
  maxTokens?: number
  maxRepeats?: number
  signal?: AbortSignal
}

export async function runAgent(o: RunOptions): Promise<RunResult> {
  const { client, tools, signal } = o
  const maxTurns = o.maxTurns ?? 10
  const maxRepeats = o.maxRepeats ?? 2
  const messages = [...o.messages]
  const usage = { input: 0, output: 0 }
  const callCounts = new Map<string, number>()
  let turns = 0
  let lastText = ''

  const toolDefs: Anthropic.Tool[] = Object.entries(tools).map(([name, t]) => ({
    name,
    description: t.description,
    input_schema: z.toJSONSchema(t.input) as Anthropic.Tool.InputSchema,
  }))

  const done = (reason: StopReason): RunResult => ({ reason, text: lastText, messages, turns, usage })

  while (true) {
    if (signal?.aborted) return done('aborted')
    if (turns >= maxTurns) return done('max_turns')

    let res: Anthropic.Message
    try {
      res = await client.messages.create(
        {
          model: o.model,
          max_tokens: o.maxTokens ?? 1024,
          ...(o.system ? { system: o.system } : {}),
          ...(toolDefs.length ? { tools: toolDefs } : {}),
          messages,
        },
        { signal },
      )
    } catch (e) {
      if (signal?.aborted || (e as Error).name === 'AbortError') return done('aborted')
      throw e
    }
    turns++
    usage.input += res.usage.input_tokens
    usage.output += res.usage.output_tokens
    messages.push({ role: 'assistant', content: res.content })
    lastText = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')

    switch (res.stop_reason) {
      case 'max_tokens':
      case 'model_context_window_exceeded':
        // tool_use мог оборваться на середине JSON — исполнять нельзя
        return done('max_tokens')
      case 'refusal':
        return done('refusal')
      case 'tool_use':
        break
      default:
        return done('end_turn')
    }

    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

    for (const c of calls) {
      const key = `${c.name}:${JSON.stringify(c.input)}`
      const n = (callCounts.get(key) ?? 0) + 1
      callCounts.set(key, n)
      if (n > maxRepeats) return done('loop_detected')
    }

    const results = await Promise.all(calls.map((c) => execute(c, tools, signal)))
    messages.push({ role: 'user', content: results })
  }
}

async function execute(
  call: Anthropic.ToolUseBlock,
  tools: Record<string, Tool<any>>,
  signal?: AbortSignal,
): Promise<Anthropic.ToolResultBlockParam> {
  const err = (content: string): Anthropic.ToolResultBlockParam => ({
    type: 'tool_result',
    tool_use_id: call.id,
    is_error: true,
    content,
  })
  const tool = tools[call.name]
  if (!tool) return err(`Unknown tool "${call.name}". Available: ${Object.keys(tools).join(', ') || 'none'}`)

  const parsed = tool.input.safeParse(call.input)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i: { path: PropertyKey[]; message: string }) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    return err(`Invalid input: ${issues}`)
  }
  try {
    const out = await tool.run(parsed.data, { signal })
    return { type: 'tool_result', tool_use_id: call.id, content: typeof out === 'string' ? out : JSON.stringify(out) }
  } catch (e) {
    return err(`Error: ${(e as Error).message}`)
  }
}
