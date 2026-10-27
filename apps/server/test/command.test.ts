import { describe, expect, it } from 'vitest'
import { applyAction, newCity, STAGES, type Action, type City } from '@uptime/core'
import { runCommand, type ChatClient } from '../src/command'

const stage = STAGES.shorty

type ToolCall = { name: string; args: Record<string, unknown> }
function fakeClient(content: string, calls: ToolCall[]) {
  const requests: any[] = []
  const client: ChatClient = {
    chat: {
      completions: {
        create: async (req: any) => {
          requests.push(req)
          if (requests.length > 1) return { choices: [{ message: { content: '', tool_calls: [] } }] }
          return {
            choices: [
              {
                message: {
                  content,
                  tool_calls: calls.map((c, i) => ({
                    id: `c${i}`,
                    type: 'function',
                    function: { name: c.name, arguments: JSON.stringify(c.args) },
                  })),
                },
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 20 },
          } as any
        },
      },
    },
  }
  return { client, requests }
}

function cityWith(actions: Action[]): City {
  let city = newCity(stage, 'generalist')
  for (const a of actions) {
    const r = applyAction(city, a, { stage, heroClass: 'generalist' })
    if (!r.ok) throw new Error(r.reason)
    city = r.city
  }
  return city
}

const input = (city: City, transcript: string, phase: 'build' | 'firefight' = 'build') => ({
  stageId: 'shorty',
  heroClass: 'generalist' as const,
  city,
  transcript,
  phase,
})

describe('runCommand', () => {
  it('one sentence yields place, addon and link actions applied in order', async () => {
    const { client } = fakeClient('Building it now!', [
      { name: 'place', args: { type: 'lb', option: 'round_robin' } },
      { name: 'place', args: { type: 'sql', option: 'standard' } },
      { name: 'addon', args: { building: 'sql1', addon: 'index' } },
      { name: 'link', args: { from: 'users', to: 'lb1' } },
    ])
    const r = await runCommand(client, input(newCity(stage, 'generalist'), 'round robin balancer and an indexed SQL database'))
    expect(r.actions.map((a) => a.kind)).toEqual(['place', 'place', 'addon', 'link'])
    expect(r.city.buildings.map((b) => b.id)).toEqual(['lb1', 'sql1'])
    expect(r.city.coins).toBe(100 - 10 - 20 - 5)
    expect(r.heroLine).toBe('Building it now!')
    expect(r.rejected).toEqual([])
  })

  it('an over-budget call is rejected with a reason, and later calls still run', async () => {
    const start = cityWith([
      { kind: 'place', type: 'api', option: 'large' },
      { kind: 'place', type: 'api', option: 'large' },
      { kind: 'place', type: 'api', option: 'large' },
      { kind: 'place', type: 'api', option: 'small' },
    ])
    expect(start.coins).toBe(15)
    const { client } = fakeClient('On it.', [
      { name: 'place', args: { type: 'api', option: 'large' } },
      { name: 'place', args: { type: 'lb', option: 'round_robin' } },
    ])
    const r = await runCommand(client, input(start, 'another large server and a balancer'))
    expect(r.rejected).toEqual([{ action: { kind: 'place', type: 'api', option: 'large' }, reason: 'not enough coins' }])
    expect(r.city.buildings.at(-1)?.id).toBe('lb1')
    expect(r.city.coins).toBe(5)
  })

  it('an ambiguous order returns askBack with the stage textbook default', async () => {
    const { client } = fakeClient('Where do you want it?', [
      { name: 'ask_back', args: { question: 'In front of the servers, or behind them?', choices: ['in front of the API servers', 'behind the API servers, next to the database'], topic: 'cache' } },
    ])
    const r = await runCommand(client, input(newCity(stage, 'generalist'), 'cache'))
    expect(r.askBack).toEqual({
      question: 'In front of the servers, or behind them?',
      choices: ['in front of the API servers', 'behind the API servers, next to the database'],
      default: 'behind the API servers, next to the database',
    })
    expect(r.actions).toEqual([])
  })

  it('asks Muse Spark with minimal reasoning and never forces a tool choice', async () => {
    const { client, requests } = fakeClient('ok', [])
    await runCommand(client, input(newCity(stage, 'generalist'), 'hello'))
    expect(requests[0].model).toBe('muse-spark-1.3')
    expect(requests[0].reasoning_effort).toBe('minimal')
    expect(requests[0].tool_choice === undefined || requests[0].tool_choice === 'auto').toBe(true)
    expect(requests[0].tools.map((t: any) => t.function.name)).toContain('ask_back')
  })

  it('a client error returns the comms-down line and no actions', async () => {
    const client: ChatClient = { chat: { completions: { create: async () => { throw new Error('504') } } } }
    const start = newCity(stage, 'generalist')
    const r = await runCommand(client, input(start, 'build things'))
    expect(r.heroLine).toBe('Comms are down, type your orders.')
    expect(r.actions).toEqual([])
    expect(r.city).toEqual(start)
  })

  it('the firefight phase refuses link actions', async () => {
    const start = cityWith([{ kind: 'place', type: 'lb', option: 'round_robin' }])
    const { client, requests } = fakeClient('Go!', [{ name: 'link', args: { from: 'users', to: 'lb1' } }])
    const r = await runCommand(client, input(start, 'connect it', 'firefight'))
    expect(r.actions).toEqual([])
    expect(r.rejected[0].reason).toBe("there's no time to rewire roads mid-test")
    expect(requests[0].tools.map((t: any) => t.function.name)).not.toContain('link')
  })

  it('submit is reported, not applied as an action', async () => {
    const { client } = fakeClient('Here we go!', [{ name: 'submit', args: {} }])
    const r = await runCommand(client, input(newCity(stage, 'generalist'), 'submit'))
    expect(r.submit).toBe(true)
    expect(r.actions).toEqual([])
  })

  it('garbled tool arguments are rejected, not thrown', async () => {
    const client: ChatClient = {
      chat: {
        completions: {
          create: async () =>
            ({ choices: [{ message: { content: 'hm', tool_calls: [{ id: 'x', type: 'function', function: { name: 'place', arguments: '{nope' } }] } }] }) as any,
        },
      },
    }
    const r = await runCommand(client, input(newCity(stage, 'generalist'), 'x'))
    expect(r.rejected[0].reason).toBe('I could not make sense of that order')
  })
})

function seqClient(rounds: { content: string; calls: ToolCall[] }[]) {
  const requests: any[] = []
  const client: ChatClient = {
    chat: {
      completions: {
        create: async (req: any) => {
          requests.push(JSON.parse(JSON.stringify(req)))
          const r = rounds[Math.min(requests.length - 1, rounds.length - 1)]
          return {
            choices: [{ message: { content: r.content, tool_calls: r.calls.map((c, i) => ({ id: `r${requests.length}c${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }
        },
      },
    },
  }
  return { client, requests }
}

describe('runCommand - rounds and wiring', () => {
  it('a second round adds add-ons once the first round has built the database', async () => {
    const { client, requests } = seqClient([
      { content: 'Building.', calls: [{ name: 'place', args: { type: 'sql', option: 'standard' } }] },
      { content: 'Indexed!', calls: [{ name: 'addon', args: { building: 'sql1', addon: 'index' } }] },
      { content: '', calls: [] },
    ])
    const r = await runCommand(client, input(newCity(stage, 'generalist'), 'SQL with an index'))
    expect(r.actions.map((a) => a.kind)).toEqual(['place', 'addon'])
    expect(r.heroLine).toBe('Indexed!')
    expect(requests).toHaveLength(3)
    const toolMsg = requests[1].messages.find((m: any) => m.role === 'tool')
    expect(toolMsg.content).toMatch(/ok.*sql1/)
    expect(r.usage).toEqual({ prompt: 30, completion: 15 })
  })

  it('stops after 3 rounds even if the model keeps calling tools', async () => {
    const { client, requests } = seqClient([{ content: 'more', calls: [{ name: 'place', args: { type: 'api', option: 'small' } }] }])
    await runCommand(client, input(newCity(stage, 'generalist'), 'servers forever'))
    expect(requests).toHaveLength(3)
  })

  it('the build phase auto-wires the obvious connections', async () => {
    const { client } = seqClient([
      { content: 'Done.', calls: [
        { name: 'place', args: { type: 'lb', option: 'round_robin' } },
        { name: 'place', args: { type: 'api', option: 'large' } },
        { name: 'place', args: { type: 'sql', option: 'standard' } },
      ] },
      { content: '', calls: [] },
    ])
    const r = await runCommand(client, input(newCity(stage, 'generalist'), 'balancer, a server and SQL'))
    expect(r.city.links).toEqual([
      { from: 'users', to: 'lb1' },
      { from: 'lb1', to: 'api1' },
      { from: 'api1', to: 'sql1' },
    ])
  })
})
