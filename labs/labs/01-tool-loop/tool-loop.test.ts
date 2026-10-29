import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'
import { runAgent, type Tool } from '@lab/tool-loop'
import { fakeClient, msg, text, toolUse } from '../../shared/fake-client'

const getOrder: Tool<z.ZodObject<{ order_id: z.ZodString }>> = {
  description: 'Get order details by id',
  input: z.object({ order_id: z.string().regex(/^#W\d+$/) }),
  run: async ({ order_id }) => ({ order_id, status: 'delivered' }),
}

const user = (t: string): Anthropic.MessageParam => ({ role: 'user', content: t })

function toolResults(req: Anthropic.MessageCreateParamsNonStreaming) {
  const last = req.messages.at(-1)!
  expect(last.role).toBe('user')
  return last.content as Anthropic.ToolResultBlockParam[]
}

describe('01 tool loop: базовый цикл (билеты 7, 14)', () => {
  it('отправляет tools с JSON Schema из zod', async () => {
    const { client, requests } = fakeClient([msg([text('hi')])])
    await runAgent({ client, model: 'm', tools: { get_order: getOrder }, messages: [user('hi')] })
    const t = requests[0]!.tools as Anthropic.Tool[]
    expect(t).toHaveLength(1)
    expect(t[0]!.name).toBe('get_order')
    expect(t[0]!.description).toBe('Get order details by id')
    expect(t[0]!.input_schema.type).toBe('object')
    expect(t[0]!.input_schema.properties).toHaveProperty('order_id')
  })

  it('happy path: tool_use → исполнение → tool_result с тем же id → финальный текст', async () => {
    const first = msg([text('Let me check.'), toolUse('get_order', { order_id: '#W1' }, 'toolu_A')])
    const { client, requests } = fakeClient([first, msg([text('Delivered.')])])
    const r = await runAgent({ client, model: 'm', tools: { get_order: getOrder }, messages: [user('where is #W1?')] })

    expect(r.reason).toBe('end_turn')
    expect(r.text).toBe('Delivered.')
    expect(r.turns).toBe(2)

    // ассистентское сообщение уходит обратно ЦЕЛИКОМ: и text, и tool_use
    expect(requests[1]!.messages[1]).toEqual({ role: 'assistant', content: first.content })
    const [res] = toolResults(requests[1]!)
    expect(res!.type).toBe('tool_result')
    expect(res!.tool_use_id).toBe('toolu_A')
    expect(res!.is_error ?? false).toBe(false)
    // не-строковый результат сериализуется в JSON
    expect(JSON.parse(res!.content as string)).toEqual({ order_id: '#W1', status: 'delivered' })
  })

  it('историю не мутирует: входной массив messages остаётся прежним', async () => {
    const input = [user('hi')]
    const { client } = fakeClient([msg([toolUse('get_order', { order_id: '#W1' })]), msg([text('ok')])])
    const r = await runAgent({ client, model: 'm', tools: { get_order: getOrder }, messages: input })
    expect(input).toHaveLength(1)
    expect(r.messages).toHaveLength(4) // user, assistant(tool_use), user(tool_result), assistant(text)
  })

  it('суммирует usage по всем ходам (билет 3: в агенте input растёт каждый ход)', async () => {
    const { client } = fakeClient([
      msg([toolUse('get_order', { order_id: '#W1' })], 'tool_use', { input: 1000, output: 50 }),
      msg([text('ok')], 'end_turn', { input: 1300, output: 30 }),
    ])
    const r = await runAgent({ client, model: 'm', tools: { get_order: getOrder }, messages: [user('x')] })
    expect(r.usage).toEqual({ input: 2300, output: 80 })
  })
})

describe('01 tool loop: параллельные вызовы', () => {
  it('два tool_use в одном ответе → ОБА результата в ОДНОМ user-сообщении, в порядке вызовов', async () => {
    const slow: Tool<z.ZodObject<{}>> = {
      description: 'slow',
      input: z.object({}),
      run: () => new Promise((r) => setTimeout(() => r('slow done'), 30)),
    }
    const fast: Tool<z.ZodObject<{}>> = { description: 'fast', input: z.object({}), run: async () => 'fast done' }
    const { client, requests } = fakeClient([
      msg([toolUse('slow', {}, 'toolu_1'), toolUse('fast', {}, 'toolu_2')]),
      msg([text('ok')]),
    ])
    await runAgent({ client, model: 'm', tools: { slow, fast }, messages: [user('x')] })
    const res = toolResults(requests[1]!)
    expect(res.map((r) => r.tool_use_id)).toEqual(['toolu_1', 'toolu_2'])
    expect(res.map((r) => r.content)).toEqual(['slow done', 'fast done'])
  })

  it('один из параллельных упал → второй результат всё равно возвращается', async () => {
    const boom: Tool<z.ZodObject<{}>> = { description: 'b', input: z.object({}), run: async () => { throw new Error('db timeout') } }
    const { client, requests } = fakeClient([
      msg([toolUse('boom', {}, 'toolu_1'), toolUse('get_order', { order_id: '#W2' }, 'toolu_2')]),
      msg([text('ok')]),
    ])
    await runAgent({ client, model: 'm', tools: { boom, get_order: getOrder }, messages: [user('x')] })
    const [a, b] = toolResults(requests[1]!)
    expect(a!.is_error).toBe(true)
    expect(a!.content).toContain('db timeout')
    expect(b!.is_error ?? false).toBe(false)
  })
})

describe('01 tool loop: ошибки инструментов уходят модели, а не роняют цикл (билет 8)', () => {
  it('неизвестный инструмент → is_error с именем, цикл продолжается', async () => {
    const { client, requests } = fakeClient([msg([toolUse('cancel_order', { id: 1 })]), msg([text('sorry')])])
    const r = await runAgent({ client, model: 'm', tools: { get_order: getOrder }, messages: [user('x')] })
    const [res] = toolResults(requests[1]!)
    expect(res!.is_error).toBe(true)
    expect(res!.content).toContain('cancel_order')
    expect(r.reason).toBe('end_turn')
  })

  it('аргументы не прошли схему → is_error с полем, инструмент НЕ вызван (билет 38)', async () => {
    const run = vi.fn(getOrder.run)
    const { client, requests } = fakeClient([msg([toolUse('get_order', { order_id: 'W1' })]), msg([text('ok')])])
    await runAgent({ client, model: 'm', tools: { get_order: { ...getOrder, run } }, messages: [user('x')] })
    expect(run).not.toHaveBeenCalled()
    const [res] = toolResults(requests[1]!)
    expect(res!.is_error).toBe(true)
    expect(res!.content).toContain('order_id')
  })

  it('инструмент бросил исключение → is_error с текстом ошибки', async () => {
    const boom: Tool<z.ZodObject<{}>> = { description: 'b', input: z.object({}), run: async () => { throw new Error('404 order not found') } }
    const { client, requests } = fakeClient([msg([toolUse('boom', {})]), msg([text('ok')])])
    const r = await runAgent({ client, model: 'm', tools: { boom }, messages: [user('x')] })
    expect(toolResults(requests[1]!)[0]!.content).toContain('404 order not found')
    expect(r.reason).toBe('end_turn')
  })
})

describe('01 tool loop: стоп-условия (билеты 2, 8, 14)', () => {
  it('потолок ходов: maxTurns=3, модель всё время зовёт инструмент → ровно 3 вызова, reason max_turns', async () => {
    const loop = () => msg([toolUse('get_order', { order_id: `#W${Math.random().toString().slice(2, 8)}` })])
    const { client, requests } = fakeClient([loop, loop, loop, loop, loop])
    const r = await runAgent({ client, model: 'm', tools: { get_order: getOrder }, messages: [user('x')], maxTurns: 3 })
    expect(r.reason).toBe('max_turns')
    expect(requests).toHaveLength(3)
  })

  it('stop_reason max_tokens при недописанном tool_use → инструмент НЕ исполняется', async () => {
    const run = vi.fn(getOrder.run)
    const { client, requests } = fakeClient([msg([toolUse('get_order', { order_id: '#W1' })], 'max_tokens')])
    const r = await runAgent({ client, model: 'm', tools: { get_order: { ...getOrder, run } }, messages: [user('x')] })
    expect(r.reason).toBe('max_tokens')
    expect(run).not.toHaveBeenCalled()
    expect(requests).toHaveLength(1)
  })

  it('model_context_window_exceeded → тоже обрезка, тоже стоп', async () => {
    const { client } = fakeClient([msg([text('The order is')], 'model_context_window_exceeded')])
    const r = await runAgent({ client, model: 'm', tools: {}, messages: [user('x')] })
    expect(r.reason).toBe('max_tokens')
    expect(r.text).toBe('The order is')
  })

  it('refusal → стоп с reason refusal', async () => {
    const { client } = fakeClient([msg([], 'refusal')])
    const r = await runAgent({ client, model: 'm', tools: {}, messages: [user('x')] })
    expect(r.reason).toBe('refusal')
  })

  it('зацикливание: тот же вызов с теми же аргументами в третий раз не исполняется, reason loop_detected', async () => {
    const run = vi.fn(getOrder.run)
    const same = () => msg([toolUse('get_order', { order_id: '#W1' })])
    const { client, requests } = fakeClient([same, same, same, same])
    const r = await runAgent({ client, model: 'm', tools: { get_order: { ...getOrder, run } }, messages: [user('x')], maxTurns: 10 })
    expect(r.reason).toBe('loop_detected')
    expect(run).toHaveBeenCalledTimes(2)
    expect(requests).toHaveLength(3)
  })
})

describe('01 tool loop: отмена (билет 33)', () => {
  it('пользователь нажал Stop во время инструмента → модель больше не вызывается, reason aborted', async () => {
    const ac = new AbortController()
    const stopper: Tool<z.ZodObject<{}>> = {
      description: 's',
      input: z.object({}),
      run: async () => { ac.abort(); return 'done' },
    }
    const { client, requests } = fakeClient([msg([toolUse('stopper', {})]), msg([text('never')])])
    const r = await runAgent({ client, model: 'm', tools: { stopper }, messages: [user('x')], signal: ac.signal })
    expect(r.reason).toBe('aborted')
    expect(requests).toHaveLength(1)
  })

  it('signal передаётся и в модель, и в инструмент', async () => {
    const ac = new AbortController()
    const seen: (AbortSignal | undefined)[] = []
    const probe: Tool<z.ZodObject<{}>> = { description: 'p', input: z.object({}), run: async (_i, ctx) => { seen.push(ctx.signal); return 'ok' } }
    const create = vi.fn()
    const { client } = fakeClient([msg([toolUse('probe', {})]), msg([text('ok')])])
    const wrapped = { messages: { create: (p: never, o?: { signal?: AbortSignal }) => { create(o?.signal); return client.messages.create(p, o) } } }
    await runAgent({ client: wrapped, model: 'm', tools: { probe }, messages: [user('x')], signal: ac.signal })
    expect(create).toHaveBeenCalledWith(ac.signal)
    expect(seen[0]).toBe(ac.signal)
  })
})
