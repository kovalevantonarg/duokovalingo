export type SSEEvent = { event: string; data: string }

export type StreamResult = {
  text: string
  toolCalls: { id: string; name: string; input: unknown }[]
  stopReason: string | null
  complete: boolean
  error?: { type: string; message: string }
}

export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader()
  // stream: true держит недописанные байты UTF-8 до следующего чанка
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  let event = ''
  let data: string[] = []

  function* lines(final: boolean): Generator<string> {
    while (true) {
      const i = buf.search(/[\r\n]/)
      if (i === -1) return
      // \r в самом конце буфера: следом может прийти \n из следующего чанка
      if (buf[i] === '\r' && i === buf.length - 1 && !final) return
      const line = buf.slice(0, i)
      buf = buf.slice(buf[i] === '\r' && buf[i + 1] === '\n' ? i + 2 : i + 1)
      yield line
    }
  }

  function* handle(line: string): Generator<SSEEvent> {
    if (line === '') {
      if (data.length) yield { event: event || 'message', data: data.join('\n') }
      event = ''
      data = []
      return
    }
    if (line.startsWith(':')) return
    const c = line.indexOf(':')
    const field = c === -1 ? line : line.slice(0, c)
    let value = c === -1 ? '' : line.slice(c + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      for (const l of lines(false)) yield* handle(l)
    }
    buf += decoder.decode()
    for (const l of lines(true)) yield* handle(l)
    // всё, что осталось без пустой строки, по спецификации отбрасывается
  } finally {
    reader.releaseLock()
  }
}

export async function collectMessage(stream: ReadableStream<Uint8Array>): Promise<StreamResult> {
  const r: StreamResult = { text: '', toolCalls: [], stopReason: null, complete: false }
  const blocks = new Map<number, { kind: 'text' | 'tool'; id?: string; name?: string; json: string }>()

  for await (const e of parseSSE(stream)) {
    const d = JSON.parse(e.data)
    switch (d.type) {
      case 'content_block_start': {
        const b = d.content_block
        blocks.set(d.index, b.type === 'tool_use' ? { kind: 'tool', id: b.id, name: b.name, json: '' } : { kind: 'text', json: '' })
        break
      }
      case 'content_block_delta': {
        if (d.delta.type === 'text_delta') r.text += d.delta.text
        else if (d.delta.type === 'input_json_delta') {
          const b = blocks.get(d.index)
          if (b) b.json += d.delta.partial_json
        }
        break
      }
      case 'content_block_stop': {
        const b = blocks.get(d.index)
        if (b?.kind === 'tool') r.toolCalls.push({ id: b.id!, name: b.name!, input: b.json ? JSON.parse(b.json) : {} })
        break
      }
      case 'message_delta':
        r.stopReason = d.delta.stop_reason ?? r.stopReason
        break
      case 'message_stop':
        r.complete = true
        break
      case 'error':
        r.error = { type: d.error.type, message: d.error.message }
        return r
    }
  }
  return r
}
