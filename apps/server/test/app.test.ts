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
