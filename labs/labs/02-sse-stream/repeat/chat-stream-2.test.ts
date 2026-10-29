import { describe, it, expect } from 'vitest'
import { parseNDJSON, collectChat } from '@lab/chat-stream-2'

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

/** Одна строка NDJSON. */
const line = (o: object) => JSON.stringify(o) + '\n'

// Чанки в стиле OpenAI Chat Completions, как их пересылает шлюз
const text = (t: string) => line({ choices: [{ index: 0, delta: { content: t }, finish_reason: null }] })
const role = line({ choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })
const toolFirst = (i: number, id: string, name: string, args = '') =>
  line({
    choices: [{ index: 0, delta: { content: null, tool_calls: [{ index: i, id, type: 'function', function: { name, arguments: args } }] }, finish_reason: null }],
  })
const toolArgs = (i: number, args: string) =>
  line({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: args } }] }, finish_reason: null }] })
const finish = (reason: string) => line({ choices: [{ index: 0, delta: {}, finish_reason: reason }] })
const usage = line({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })
const done = line({ done: true })

describe('02 повторение: parseNDJSON, байты → объекты', () => {
  it('несколько строк в одном чанке: по объекту на строку', async () => {
    const out = await all(parseNDJSON(streamOf(['{"a":1}\n{"b":2}\n'])))
    expect(out).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('чанк режет JSON посреди строки: хвост ждёт следующего чанка', async () => {
    const out = await all(parseNDJSON(streamOf(['{"te', 'xt":"he', 'llo"}', '\n{"n":', '2}\n'])))
    expect(out).toEqual([{ text: 'hello' }, { n: 2 }])
  })

  it('чанк режет кириллицу посреди UTF-8 символа: текст не превращается в мусор', async () => {
    const bytes = enc.encode('{"t":"Привет"}\n')
    const cut = bytes.indexOf(0xd0, 8) + 1 // после первого байта двухбайтового символа
    const out = await all(parseNDJSON(streamOf([bytes.slice(0, cut), bytes.slice(cut)])))
    expect(out).toEqual([{ t: 'Привет' }])
  })

  it('CRLF, в том числе \\r и \\n в разных чанках, и пустые строки не дают лишних объектов', async () => {
    const out = await all(parseNDJSON(streamOf(['{"a":1}\r', '\n\n\r\n{"b":2}\r\n'])))
    expect(out).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('последняя строка без \\n в конце потока тоже объект (в SSE такое событие выбросили бы)', async () => {
    const out = await all(parseNDJSON(streamOf(['{"a":1}\n{"done":', 'true}'])))
    expect(out).toEqual([{ a: 1 }, { done: true }])
  })

  it('битая строка: ошибка с номером строки, а не тихий пропуск', async () => {
    await expect(all(parseNDJSON(streamOf(['{"a":1}\n{"b":\n'])))).rejects.toThrow(/строка 2/)
  })
})

describe('02 повторение: collectChat, OpenAI-чанки → результат', () => {
  it('склеивает текст из delta.content, берёт finish_reason, {"done":true} даёт complete', async () => {
    const r = await collectChat(streamOf([role, text('Hel'), text('lo'), finish('stop'), done]))
    expect(r).toMatchObject({ text: 'Hello', finishReason: 'stop', complete: true, toolCalls: [] })
    expect(r.error).toBeUndefined()
  })

  it('чанк с пустым choices (usage в конце) не ломает сборку', async () => {
    const r = await collectChat(streamOf([text('ok'), finish('stop'), usage, done]))
    expect(r).toMatchObject({ text: 'ok', complete: true })
  })

  it('аргументы приходят кусками по index; id и name только в первом куске; JSON.parse после finish_reason', async () => {
    const r = await collectChat(
      streamOf([
        text('Checking.'),
        toolFirst(0, 'call_1', 'get_order'),
        toolArgs(0, '{"order_'), toolArgs(0, 'id": "#W'), toolArgs(0, '1"}'),
        finish('tool_calls'), done,
      ]),
    )
    expect(r.text).toBe('Checking.')
    expect(r.toolCalls).toEqual([{ id: 'call_1', name: 'get_order', args: { order_id: '#W1' } }])
    expect(r.finishReason).toBe('tool_calls')
  })

  it('два вызова вперемешку: куски не путаются, порядок по index', async () => {
    const r = await collectChat(
      streamOf([
        toolFirst(1, 'call_b', 'b', '{"y":'), toolFirst(0, 'call_a', 'a'),
        toolArgs(0, '{"x":'), toolArgs(1, '2}'), toolArgs(0, '1}'),
        finish('tool_calls'), done,
      ]),
    )
    expect(r.toolCalls).toEqual([
      { id: 'call_a', name: 'a', args: { x: 1 } },
      { id: 'call_b', name: 'b', args: { y: 2 } },
    ])
  })

  it('инструмент без аргументов: arguments пустой → args = {}', async () => {
    const r = await collectChat(streamOf([toolFirst(0, 'call_1', 'list_all'), finish('tool_calls'), done]))
    expect(r.toolCalls).toEqual([{ id: 'call_1', name: 'list_all', args: {} }])
  })
})

describe('02 повторение: обрывы и ошибки посреди потока', () => {
  it('строка {"error": …} посреди потока → error заполнен, уже полученный текст сохранён', async () => {
    const r = await collectChat(
      streamOf([text('Part'), line({ error: { code: 'upstream_timeout', message: 'Upstream timed out' } }), text('never')]),
    )
    expect(r).toMatchObject({ text: 'Part', complete: false, error: { code: 'upstream_timeout', message: 'Upstream timed out' } })
  })

  it('поток кончился без {"done":true} → complete: false, finishReason: null', async () => {
    const r = await collectChat(streamOf([role, text('The answer is')]))
    expect(r).toMatchObject({ text: 'The answer is', complete: false, finishReason: null })
  })

  it('обрыв посреди аргументов: полувызов не отдаём и JSON.parse не падает', async () => {
    const r = await collectChat(streamOf([toolFirst(0, 'call_1', 'refund', '{"amount": 1'), toolArgs(0, '00, "ord')]))
    expect(r).toMatchObject({ complete: false, toolCalls: [], finishReason: null })
  })
})
