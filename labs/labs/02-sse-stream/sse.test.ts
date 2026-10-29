import { describe, it, expect } from 'vitest'
import { parseSSE, collectMessage } from '@lab/sse'

const enc = new TextEncoder()

/** Поток из заранее нарезанных кусков. Сеть режет байты где угодно, не по строкам. */
function streamOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(typeof ch === 'string' ? enc.encode(ch) : ch)
      c.close()
    },
  })
}

async function all<T>(it: AsyncIterable<T>) {
  const out: T[] = []
  for await (const x of it) out.push(x)
  return out
}

const ev = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

const start = ev('message_start', { type: 'message_start', message: { id: 'm1', usage: { input_tokens: 10, output_tokens: 1 } } })
const textStart = (i: number) => ev('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } })
const textDelta = (i: number, t: string) => ev('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: t } })
const toolStart = (i: number, id: string, name: string) =>
  ev('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'tool_use', id, name, input: {} } })
const jsonDelta = (i: number, p: string) => ev('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: p } })
const blockStop = (i: number) => ev('content_block_stop', { type: 'content_block_stop', index: i })
const msgDelta = (stop: string) => ev('message_delta', { type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 42 } })
const stop = ev('message_stop', { type: 'message_stop' })

describe('02 parseSSE: формат на проводе (билеты 11, 50)', () => {
  it('одно событие: event + data, пустая строка завершает событие', async () => {
    const out = await all(parseSSE(streamOf(['event: ping\ndata: {"type":"ping"}\n\n'])))
    expect(out).toEqual([{ event: 'ping', data: '{"type":"ping"}' }])
  })

  it('несколько событий в одном чанке', async () => {
    const out = await all(parseSSE(streamOf([ev('a', { x: 1 }) + ev('b', { x: 2 })])))
    expect(out.map((e) => e.event)).toEqual(['a', 'b'])
  })

  it('чанк режет строку посередине', async () => {
    const out = await all(parseSSE(streamOf(['event: pi', 'ng\nda', 'ta: {"a"', ':1}\n', '\n'])))
    expect(out).toEqual([{ event: 'ping', data: '{"a":1}' }])
  })

  it('чанк режет кириллицу посреди UTF-8 символа — текст не превращается в мусор', async () => {
    const bytes = enc.encode('event: t\ndata: Привет\n\n')
    const cut = bytes.indexOf(0xd0, 20) + 1 // после первого байта двухбайтового символа
    const out = await all(parseSSE(streamOf([bytes.slice(0, cut), bytes.slice(cut)])))
    expect(out[0]!.data).toBe('Привет')
  })

  it('CRLF-переводы строк тоже валидны по спецификации', async () => {
    const out = await all(parseSSE(streamOf(['event: x\r\ndata: 1\r\n\r\n'])))
    expect(out).toEqual([{ event: 'x', data: '1' }])
  })

  it('CR в конце одного чанка, LF в начале следующего — это ОДИН перевод строки', async () => {
    const out = await all(parseSSE(streamOf(['event: x\r', '\ndata: 1\r', '\n\r', '\n'])))
    expect(out).toEqual([{ event: 'x', data: '1' }])
  })

  it('строки-комментарии (начинаются с ":") игнорируются: так прокси держат соединение живым', async () => {
    const out = await all(parseSSE(streamOf([': keepalive\n\n', 'event: x\ndata: 1\n\n'])))
    expect(out).toEqual([{ event: 'x', data: '1' }])
  })

  it('несколько data-строк склеиваются через \\n; без event: тип по умолчанию "message"', async () => {
    const out = await all(parseSSE(streamOf(['data: a\ndata: b\n\n'])))
    expect(out).toEqual([{ event: 'message', data: 'a\nb' }])
  })

  it('недописанное событие в конце потока (без пустой строки) отбрасывается', async () => {
    const out = await all(parseSSE(streamOf(['event: x\ndata: 1\n\n', 'event: y\ndata: 2\n'])))
    expect(out.map((e) => e.event)).toEqual(['x'])
  })
})

describe('02 collectMessage: события Anthropic → результат', () => {
  it('склеивает текст из дельт и берёт stop_reason из message_delta', async () => {
    const r = await collectMessage(streamOf([start, textStart(0), textDelta(0, 'Hel'), textDelta(0, 'lo'), blockStop(0), msgDelta('end_turn'), stop]))
    expect(r).toMatchObject({ text: 'Hello', stopReason: 'end_turn', complete: true })
  })

  it('ping посреди потока не ломает сборку', async () => {
    const r = await collectMessage(streamOf([start, textStart(0), ev('ping', { type: 'ping' }), textDelta(0, 'ok'), blockStop(0), msgDelta('end_turn'), stop]))
    expect(r.text).toBe('ok')
  })

  it('аргументы tool_use приходят кусками partial_json; парсить только на content_block_stop', async () => {
    const r = await collectMessage(
      streamOf([
        start,
        textStart(0), textDelta(0, 'Checking.'), blockStop(0),
        toolStart(1, 'toolu_1', 'get_order'),
        jsonDelta(1, '{"order_'), jsonDelta(1, 'id": "#W'), jsonDelta(1, '1"}'),
        blockStop(1),
        msgDelta('tool_use'), stop,
      ]),
    )
    expect(r.text).toBe('Checking.')
    expect(r.toolCalls).toEqual([{ id: 'toolu_1', name: 'get_order', input: { order_id: '#W1' } }])
    expect(r.stopReason).toBe('tool_use')
  })

  it('инструмент без аргументов: partial_json пустой → input = {}', async () => {
    const r = await collectMessage(streamOf([start, toolStart(0, 'toolu_1', 'list_all'), jsonDelta(0, ''), blockStop(0), msgDelta('tool_use'), stop]))
    expect(r.toolCalls[0]!.input).toEqual({})
  })

  it('два tool_use по разным index: дельты не перемешиваются', async () => {
    const r = await collectMessage(
      streamOf([
        start,
        toolStart(0, 't0', 'a'), toolStart(1, 't1', 'b'),
        jsonDelta(0, '{"x":'), jsonDelta(1, '{"y":'), jsonDelta(0, '1}'), jsonDelta(1, '2}'),
        blockStop(0), blockStop(1), msgDelta('tool_use'), stop,
      ]),
    )
    expect(r.toolCalls.map((c) => c.input)).toEqual([{ x: 1 }, { y: 2 }])
  })

  it('event: error посреди потока (overloaded) → error заполнен, уже полученный текст сохранён', async () => {
    const r = await collectMessage(
      streamOf([start, textStart(0), textDelta(0, 'Part'), ev('error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })]),
    )
    expect(r.complete).toBe(false)
    expect(r.text).toBe('Part')
    expect(r.error).toEqual({ type: 'overloaded_error', message: 'Overloaded' })
  })

  it('соединение оборвалось без message_stop → complete: false (UI должен это показать)', async () => {
    const r = await collectMessage(streamOf([start, textStart(0), textDelta(0, 'The answer is')]))
    expect(r).toMatchObject({ text: 'The answer is', complete: false, stopReason: null })
  })
})
