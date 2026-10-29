import type Anthropic from '@anthropic-ai/sdk'

/**
 * Минимальный интерфейс клиента, который нужен лабам.
 * Настоящий `new Anthropic()` ему соответствует, поэтому код из лаб
 * работает и с живым API, и с фейком в тестах.
 */
export interface LLM {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal },
    ): Promise<Anthropic.Message>
  }
}

type Step = Anthropic.Message | Error | ((req: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.Message)

/**
 * Скриптованная модель: отдаёт ответы по очереди и записывает каждый запрос.
 * Так компании и тестируют агентов: детерминированно, без сети и без денег.
 * Лишний вызов модели = упавший тест (это тоже баг: агент не остановился).
 */
export function fakeClient(script: Step[]) {
  const queue = [...script]
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = []
  const client: LLM = {
    messages: {
      async create(params, options) {
        if (options?.signal?.aborted) throw abortError()
        requests.push(structuredClone(params))
        const next = queue.shift()
        if (!next) throw new Error(`fake client: лишний вызов модели №${requests.length}, скрипт закончился`)
        if (next instanceof Error) throw next
        return typeof next === 'function' ? next(params) : next
      },
    },
  }
  return { client, requests }
}

export function abortError() {
  const e = new Error('The operation was aborted')
  e.name = 'AbortError'
  return e
}

let seq = 0

export function msg(
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id?: string; name: string; input: unknown }
  >,
  stop_reason: Anthropic.StopReason = content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
  usage: { input: number; output: number } = { input: 100, output: 20 },
): Anthropic.Message {
  return {
    id: `msg_${++seq}`,
    type: 'message',
    role: 'assistant',
    model: 'fake-model',
    stop_reason,
    stop_sequence: null,
    content: content.map((b) =>
      b.type === 'tool_use' ? { ...b, id: b.id ?? `toolu_${++seq}` } : { ...b, citations: null },
    ),
    usage: {
      input_tokens: usage.input,
      output_tokens: usage.output,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    },
  } as unknown as Anthropic.Message
}

export const text = (t: string) => ({ type: 'text' as const, text: t })
export const toolUse = (name: string, input: unknown, id?: string) => ({ type: 'tool_use' as const, name, input, id })
