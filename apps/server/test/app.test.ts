import { describe, expect, it } from 'vitest'
import { newCity, STAGES } from '@uptime/core'
import { buildApp } from '../src/app'
import type { ChatClient } from '../src/command'

const okClient: ChatClient = {
  chat: { completions: { create: async () => ({ choices: [{ message: { content: 'Done!', tool_calls: [] } }] }) } },
}

describe('POST /api/command', () => {
  it('returns the command result as JSON', async () => {
    const app = buildApp({ meta: okClient, bot: okClient })
    const res = await app.inject({
      method: 'POST',
      url: '/api/command',
      payload: { stageId: 'shorty', heroClass: 'generalist', city: newCity(STAGES.shorty, 'generalist'), transcript: 'hi', phase: 'build' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().heroLine).toBe('Done!')
  })

  it('rejects an unknown stage with 400', async () => {
    const app = buildApp({ meta: okClient, bot: okClient })
    const res = await app.inject({
      method: 'POST',
      url: '/api/command',
      payload: { stageId: 'nope', heroClass: 'generalist', city: newCity(STAGES.shorty, 'generalist'), transcript: 'hi', phase: 'build' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/rival', () => {
  it('returns a rival build for a known stage', async () => {
    const never: ChatClient = { chat: { completions: { create: () => new Promise(() => {}) } } }
    const app = buildApp({ meta: okClient, bot: okClient })
    const res = await app.inject({ method: 'POST', url: '/api/rival', payload: { stageId: 'shorty' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().source).toBe('scripted')
    expect(never).toBeDefined()
  })
})

describe('with public-demo limits on', () => {
  it('a voice request carrying the run id is admitted', async () => {
    const { RunLimits } = await import('../src/caps')
    const fetchImpl = (async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as typeof fetch
    const app = buildApp({ meta: okClient, bot: okClient, limits: new RunLimits({}), tts: { apiKey: 'k', fetch: fetchImpl } })
    const res = await app.inject({ method: 'POST', url: '/api/tts', headers: { 'x-run-id': 'r1' }, payload: { voice: 'hero', text: 'hi' } })
    expect(res.statusCode).toBe(200)
  })
})
