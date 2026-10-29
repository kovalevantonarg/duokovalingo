import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'
import { runSupportAgent, type SupportTool, type Pricing } from '@lab/tool-loop-2'
import { fakeClient, msg, text, toolUse } from '../../../shared/fake-client'

// Поддержка интернет-провайдера: проверить линию по номеру договора, открыть заявку на мастера.
const checkLine: SupportTool<z.ZodObject<{ contract: z.ZodString }>> = {
  name: 'check_line',
  description: 'Check the internet line status by contract number',
  schema: z.object({ contract: z.string().regex(/^C-\d{6}$/) }),
  handler: async ({ contract }) => ({ contract, line: 'down', since: '09:40' }),
}

const openTicket: SupportTool<z.ZodObject<{ contract: z.ZodString; reason: z.ZodString }>> = {
  name: 'open_ticket',
  description: 'Open a technician ticket',
  schema: z.object({ contract: z.string(), reason: z.string().min(3) }),
  handler: async () => 'ticket T-77 opened',
}

// $10 за миллион входных, $50 за миллион выходных: удобные круглые числа для тестов
const pricing: Pricing = { inputPerMTok: 10, outputPerMTok: 50 }

const user = (t: string): Anthropic.MessageParam => ({ role: 'user', content: t })

function toolResults(req: Anthropic.MessageCreateParamsNonStreaming) {
  const last = req.messages.at(-1)!
  expect(last.role).toBe('user')
  return last.content as Anthropic.ToolResultBlockParam[]
}

describe('01 повторение: основной цикл', () => {
  it('инструменты из массива уходят в запрос в том же порядке, со схемой из zod, и system тоже', async () => {
    const { client, requests } = fakeClient([msg([text('hi')])])
    await runSupportAgent({ client, model: 'm', system: 'You are ISP support', tools: [openTicket, checkLine], history: [user('hi')], pricing })
    const t = requests[0]!.tools as Anthropic.Tool[]
    expect(t.map((x) => x.name)).toEqual(['open_ticket', 'check_line'])
    expect(t[1]!.description).toBe('Check the internet line status by contract number')
    expect(t[1]!.input_schema.type).toBe('object')
    expect(t[1]!.input_schema.properties).toHaveProperty('contract')
    expect(requests[0]!.system).toBe('You are ISP support')
  })

  it('happy path: ассистентское сообщение целиком, tool_result с тем же id, объект как JSON, status done', async () => {
    const first = msg([text('Checking your line.'), toolUse('check_line', { contract: 'C-000123' }, 'toolu_L')])
    const { client, requests } = fakeClient([first, msg([text('Your line is down since 09:40.')])])
    const r = await runSupportAgent({ client, model: 'm', tools: [checkLine], history: [user('no internet, C-000123')], pricing })

    expect(r.status).toBe('done')
    expect(r.answer).toBe('Your line is down since 09:40.')
    expect(requests[1]!.messages[1]).toEqual({ role: 'assistant', content: first.content })
    const [res] = toolResults(requests[1]!)
    expect(res!.tool_use_id).toBe('toolu_L')
    expect(res!.is_error ?? false).toBe(false)
    expect(JSON.parse(res!.content as string)).toEqual({ contract: 'C-000123', line: 'down', since: '09:40' })
  })

  it('входная history не мутируется, transcript содержит весь диалог', async () => {
    const history = [user('C-000123 offline')]
    const { client } = fakeClient([msg([toolUse('check_line', { contract: 'C-000123' })]), msg([text('ok')])])
    const r = await runSupportAgent({ client, model: 'm', tools: [checkLine], history, pricing })
    expect(history).toHaveLength(1)
    expect(r.transcript.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
  })

  it('два инструмента с одним именем → ошибка конфигурации ДО первого вызова модели', async () => {
    const { client, requests } = fakeClient([msg([text('hi')])])
    const twin = { ...checkLine, description: 'copy' }
    await expect(
      runSupportAgent({ client, model: 'm', tools: [checkLine, twin], history: [user('x')], pricing }),
    ).rejects.toThrow('check_line')
    expect(requests).toHaveLength(0)
  })
})

describe('01 повторение: параллельные вызовы и ошибки инструментов', () => {
  it('два tool_use в одном ответе → оба результата в одном user-сообщении, в порядке вызовов', async () => {
    const slowCheck: SupportTool<z.ZodObject<{ contract: z.ZodString }>> = {
      ...checkLine,
      handler: () => new Promise((r) => setTimeout(() => r('line down'), 30)),
    }
    const { client, requests } = fakeClient([
      msg([toolUse('check_line', { contract: 'C-000123' }, 'toolu_1'), toolUse('open_ticket', { contract: 'C-000123', reason: 'line down' }, 'toolu_2')]),
      msg([text('ok')]),
    ])
    await runSupportAgent({ client, model: 'm', tools: [slowCheck, openTicket], history: [user('x')], pricing })
    expect(requests[1]!.messages).toHaveLength(3)
    const res = toolResults(requests[1]!)
    expect(res.map((x) => x.tool_use_id)).toEqual(['toolu_1', 'toolu_2'])
    expect(res.map((x) => x.content)).toEqual(['line down', 'ticket T-77 opened'])
  })

  it('неизвестный инструмент → is_error с его именем, цикл продолжается', async () => {
    const { client, requests } = fakeClient([msg([toolUse('reboot_router', { contract: 'C-000123' })]), msg([text('I cannot reboot it.')])])
    const r = await runSupportAgent({ client, model: 'm', tools: [checkLine], history: [user('x')], pricing })
    const [res] = toolResults(requests[1]!)
    expect(res!.is_error).toBe(true)
    expect(res!.content).toContain('reboot_router')
    expect(r.status).toBe('done')
  })

  it('аргументы не прошли zod → is_error с именем поля, handler НЕ вызван', async () => {
    const handler = vi.fn(checkLine.handler)
    const { client, requests } = fakeClient([msg([toolUse('check_line', { contract: '123' })]), msg([text('ok')])])
    await runSupportAgent({ client, model: 'm', tools: [{ ...checkLine, handler }], history: [user('x')], pricing })
    expect(handler).not.toHaveBeenCalled()
    const [res] = toolResults(requests[1]!)
    expect(res!.is_error).toBe(true)
    expect(res!.content).toContain('contract')
  })

  it('handler бросил исключение → is_error с текстом ошибки, соседний вызов всё равно отработал', async () => {
    const broken = { ...openTicket, handler: async () => { throw new Error('CRM 503') } }
    const { client, requests } = fakeClient([
      msg([toolUse('open_ticket', { contract: 'C-000123', reason: 'down' }), toolUse('check_line', { contract: 'C-000123' })]),
      msg([text('ok')]),
    ])
    const r = await runSupportAgent({ client, model: 'm', tools: [broken, checkLine], history: [user('x')], pricing })
    const [a, b] = toolResults(requests[1]!)
    expect(a!.is_error).toBe(true)
    expect(a!.content).toContain('CRM 503')
    expect(b!.is_error ?? false).toBe(false)
    expect(r.status).toBe('done')
  })
})

describe('01 повторение: стоп-условия, бюджет и onStep', () => {
  it('max_tokens при недописанном tool_use → status truncated, handler НЕ вызван, модель больше не зовём', async () => {
    const handler = vi.fn(openTicket.handler)
    const { client, requests } = fakeClient([msg([text('Opening'), toolUse('open_ticket', { contract: 'C-000123', reason: 'do' })], 'max_tokens')])
    const r = await runSupportAgent({ client, model: 'm', tools: [{ ...openTicket, handler }], history: [user('x')], pricing })
    expect(r.status).toBe('truncated')
    expect(r.answer).toBe('Opening')
    expect(handler).not.toHaveBeenCalled()
    expect(requests).toHaveLength(1)
  })

  it('refusal → status refused', async () => {
    const { client } = fakeClient([msg([], 'refusal')])
    const r = await runSupportAgent({ client, model: 'm', tools: [checkLine], history: [user('x')], pricing })
    expect(r.status).toBe('refused')
  })

  it('потолок ходов: maxTurns=2, модель всё время зовёт инструмент → ровно 2 вызова, status turn_limit', async () => {
    const again = () => msg([toolUse('check_line', { contract: 'C-000123' })])
    const { client, requests } = fakeClient([again, again, again])
    const r = await runSupportAgent({ client, model: 'm', tools: [checkLine], history: [user('x')], pricing, maxTurns: 2 })
    expect(r.status).toBe('turn_limit')
    expect(requests).toHaveLength(2)
  })

  it('бюджет: ход стоит $0.5, budgetUsd=1.2 → третий ход ещё делается, четвёртый нет, status over_budget', async () => {
    // 40k входных * $10/M + 2k выходных * $50/M = $0.4 + $0.1 = $0.5 за ход
    const pricey = () => msg([toolUse('check_line', { contract: 'C-000123' })], 'tool_use', { input: 40_000, output: 2_000 })
    const { client, requests } = fakeClient([pricey, pricey, pricey, pricey])
    const r = await runSupportAgent({ client, model: 'm', tools: [checkLine], history: [user('x')], pricing, budgetUsd: 1.2 })
    expect(r.status).toBe('over_budget')
    expect(requests).toHaveLength(3)
    expect(r.spentUsd).toBeCloseTo(1.5, 6)
  })

  it('onStep вызывается после каждого хода: номер, stop_reason, исполненные вызовы с флагом ошибки, траты нарастающим итогом', async () => {
    const onStep = vi.fn()
    const { client } = fakeClient([
      msg([toolUse('check_line', { contract: 'C-000123' }), toolUse('reboot_router', {})], 'tool_use', { input: 40_000, output: 2_000 }),
      msg([text('Technician is on the way.')], 'end_turn', { input: 50_000, output: 1_000 }),
    ])
    await runSupportAgent({ client, model: 'm', tools: [checkLine], history: [user('x')], pricing, onStep })
    expect(onStep).toHaveBeenCalledTimes(2)
    const [first] = onStep.mock.calls[0]!
    expect(first).toMatchObject({
      turn: 1,
      stopReason: 'tool_use',
      calls: [{ name: 'check_line', isError: false }, { name: 'reboot_router', isError: true }],
    })
    expect(first.spentUsd).toBeCloseTo(0.5, 6)
    const [second] = onStep.mock.calls[1]!
    expect(second).toMatchObject({ turn: 2, stopReason: 'end_turn', calls: [] })
    expect(second.spentUsd).toBeCloseTo(1.05, 6)
  })
})
