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
    super('Output was cut by max_tokens: raise the limit or shrink the schema, retrying as-is will fail again')
    this.name = 'TruncatedError'
  }
}

export type ExtractOptions<S extends z.ZodType> = {
  client: LLM
  model: string
  schema: S
  name: string
  description: string
  input: string
  maxAttempts?: number
  maxTokens?: number
}

export async function extract<S extends z.ZodType>(o: ExtractOptions<S>): Promise<{ data: z.infer<S>; attempts: number }> {
  const maxAttempts = o.maxAttempts ?? 3
  const tool: Anthropic.Tool = {
    name: o.name,
    description: o.description,
    input_schema: z.toJSONSchema(o.schema) as Anthropic.Tool.InputSchema,
  }
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: o.input }]
  let lastProblem = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await o.client.messages.create({
      model: o.model,
      max_tokens: o.maxTokens ?? 1024,
      tools: [tool],
      tool_choice: { type: 'tool', name: o.name },
      messages,
    })
    if (res.stop_reason === 'max_tokens' || res.stop_reason === 'model_context_window_exceeded') throw new TruncatedError()

    messages.push({ role: 'assistant', content: res.content })
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === o.name)

    if (!call) {
      lastProblem = 'model answered with text instead of calling the tool'
      messages.push({ role: 'user', content: `Respond only by calling the ${o.name} tool.` })
      continue
    }

    const parsed = o.schema.safeParse(call.input)
    if (parsed.success) return { data: parsed.data, attempts: attempt }

    lastProblem = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `Validation failed: ${lastProblem}. Fix these fields and call the tool again.` }],
    })
  }
  throw new ExtractionError(`Extraction failed after ${maxAttempts} attempts. Last problem: ${lastProblem}`, maxAttempts)
}
