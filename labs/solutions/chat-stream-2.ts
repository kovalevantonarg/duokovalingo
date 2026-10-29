export type ChatToolCall = { id: string; name: string; args: unknown }

export type ChatResult = {
  text: string
  toolCalls: ChatToolCall[]
  finishReason: string | null
  complete: boolean // пришла ли строка {"done":true}
  error?: { code: string; message: string }
}

/** Одна строка потока: чанк в стиле OpenAI, финальная строка шлюза или ошибка шлюза. */
type Line = {
  choices?: {
    delta?: {
      content?: string | null
      tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[]
    }
    finish_reason?: string | null
  }[]
  done?: boolean
  error?: { code: string; message: string }
}

export async function* parseNDJSON(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = stream.getReader()
  // stream: true держит недописанные байты UTF-8 до следующего чанка
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  let lineNo = 0

  function parse(raw: string): unknown[] {
    lineNo++
    // \r от CRLF остаётся в конце строки: разделитель тут только \n, так что \r на стыке чанков не страшен
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (line.trim() === '') return []
    try {
      return [JSON.parse(line)]
    } catch {
      throw new Error(`NDJSON: строка ${lineNo} не JSON: ${line.slice(0, 80)}`)
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf('\n')) !== -1) {
        const raw = buf.slice(0, i)
        buf = buf.slice(i + 1)
        yield* parse(raw)
      }
    }
    buf += decoder.decode()
    // в отличие от SSE, последняя строка NDJSON может прийти без \n: это всё равно полноценный объект
    if (buf !== '') yield* parse(buf)
  } finally {
    reader.releaseLock()
  }
}

export async function collectChat(stream: ReadableStream<Uint8Array>): Promise<ChatResult> {
  const r: ChatResult = { text: '', toolCalls: [], finishReason: null, complete: false }
  // аргументы копятся по index из tool_calls; id и name приходят только в первом куске
  const calls = new Map<number, { id: string; name: string; args: string }>()

  for await (const obj of parseNDJSON(stream)) {
    const o = obj as Line
    if (o.error) {
      r.error = { code: o.error.code, message: o.error.message }
      return r // текст, полученный до ошибки, остаётся в r.text
    }
    if (o.done) {
      r.complete = true
      break
    }
    const choice = o.choices?.[0]
    if (!choice) continue // например, чанк с usage и пустым choices

    const delta = choice.delta ?? {}
    if (typeof delta.content === 'string') r.text += delta.content
    for (const tc of delta.tool_calls ?? []) {
      let c = calls.get(tc.index)
      if (!c) calls.set(tc.index, (c = { id: '', name: '', args: '' }))
      if (tc.id) c.id = tc.id
      if (tc.function?.name) c.name = tc.function.name
      if (tc.function?.arguments) c.args += tc.function.arguments
    }

    if (choice.finish_reason) {
      r.finishReason = choice.finish_reason
      // отдельного "stop" на каждый вызов нет: аргументы готовы, только когда закончился весь ответ
      r.toolCalls = [...calls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, c]) => ({ id: c.id, name: c.name, args: c.args ? JSON.parse(c.args) : {} }))
    }
  }
  return r
}
