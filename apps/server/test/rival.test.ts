import { describe, expect, it } from 'vitest'
import { STAGES } from '@uptime/core'
import { buildRival } from '../src/rival'
import type { ChatClient } from '../src/command'

const stage = STAGES.shorty

function scripted(calls: { name: string; args: object }[], content = 'Databases are all you need, kid.') {
  const requests: any[] = []
  const plan = JSON.stringify({ taunt: content, actions: calls.map((c) => ({ kind: c.name, ...c.args })) })
  const client: ChatClient = {
    chat: {
      completions: {
        create: async (req: any) => {
          requests.push(req)
          return { choices: [{ message: { content: '```json\n' + plan + '\n```' } }] }
        },
      },
    },
  }
  return { client, requests }
}

const weak = [
  { name: 'place', args: { type: 'lb', option: 'round_robin' } },
  { name: 'place', args: { type: 'api', option: 'small' } },
  { name: 'place', args: { type: 'nosql', option: 'standard' } },
]
const strong = [
  { name: 'place', args: { type: 'lb', option: 'round_robin' } },
  { name: 'place', args: { type: 'api', option: 'large' } },
  { name: 'place', args: { type: 'api', option: 'large' } },
  { name: 'place', args: { type: 'sql', option: 'standard' } },
  { name: 'link', args: { from: 'users', to: 'lb1' } },
  { name: 'insert', args: { type: 'cache', option: 'standard', after: 'lb1', wildcard: true } },
]

describe('buildRival', () => {
  it('a valid weak build is kept and marked live', async () => {
    const { client } = scripted(weak)
    const r = await buildRival(client, stage, { model: 'meta-models/muse-spark-open' })
    expect(r.source).toBe('live')
    expect(r.city.buildings.map((b) => b.id)).toEqual(['lb1', 'api1', 'nosql1'])
    expect(r.city.links.length).toBeGreaterThan(0)
    expect(r.lines).toEqual(['Databases are all you need, kid.'])
  })

  it('a build that would beat the stage limit is replaced by the scripted build', async () => {
    const { client } = scripted(strong)
    const r = await buildRival(client, stage, { model: 'm' })
    expect(r.source).toBe('scripted')
    expect(r.actions).toEqual(stage.rivalScripted)
  })

  it('a timeout falls back to the scripted build', async () => {
    const client: ChatClient = { chat: { completions: { create: () => new Promise(() => {}) } } }
    const r = await buildRival(client, stage, { model: 'm', timeoutMs: 50 })
    expect(r.source).toBe('scripted')
    expect(r.lines).toEqual([stage.rivalTaunt])
  })

  it('an empty build falls back to the scripted build', async () => {
    const { client } = scripted([])
    const r = await buildRival(client, stage, { model: 'm' })
    expect(r.source).toBe('scripted')
  })

  it('prose instead of a JSON plan falls back to the scripted build', async () => {
    const client: ChatClient = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'Watch me win!' } }] }) } } }
    const r = await buildRival(client, stage, { model: 'm' })
    expect(r.source).toBe('scripted')
  })

  it('invalid actions in the plan are skipped, valid ones kept', async () => {
    const { client } = scripted([...weak, { name: 'place', args: { type: 'queue', option: 'standard' } }])
    const r = await buildRival(client, stage, { model: 'm' })
    expect(r.source).toBe('live')
    expect(r.city.buildings.map((b) => b.id)).toEqual(['lb1', 'api1', 'nosql1'])
  })

  it('API servers left unconnected are linked to the first database', async () => {
    const { client } = scripted([
      { name: 'place', args: { type: 'lb', option: 'round_robin' } },
      { name: 'place', args: { type: 'api', option: 'small' } },
      { name: 'place', args: { type: 'sql', option: 'standard' } },
      { name: 'place', args: { type: 'nosql', option: 'standard' } },
    ])
    const r = await buildRival(client, stage, { model: 'm' })
    expect(r.source).toBe('live')
    expect(r.city.links).toContainEqual({ from: 'api1', to: 'sql1' })
  })

  it('a rival city that serves almost nothing falls back to the scripted build', async () => {
    const { client } = scripted([{ name: 'place', args: { type: 'api', option: 'small' } }])
    const r = await buildRival(client, stage, { model: 'm' })
    expect(r.source).toBe('scripted')
  })

  it('asks the given model, in character, with the stage blind spot', async () => {
    const { client, requests } = scripted(weak)
    await buildRival(client, stage, { model: 'meta-models/muse-spark-open' })
    expect(requests[0].model).toBe('meta-models/muse-spark-open')
    expect(requests[0].messages[0].content).toContain(stage.rivalBlindSpot)
    expect(requests[0].messages[0].content).toContain('Rusty')
  })
})
