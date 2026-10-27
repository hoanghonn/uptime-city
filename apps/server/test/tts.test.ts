import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { LINES, VOICES } from '../src/voices'
import type { ChatClient } from '../src/command'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const noop: ChatClient = { chat: { completions: { create: async () => ({ choices: [] }) } } }
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3])

function app(status = 200) {
  const calls: { url: string; body: any; headers: any }[] = []
  const fetchImpl = (async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers })
    return new Response(status === 200 ? mp3 : 'nope', { status })
  }) as typeof fetch
  return { app: buildApp({ meta: noop, bot: noop, tts: { apiKey: 'el-key', fetch: fetchImpl } }), calls }
}

describe('POST /api/tts', () => {
  it('returns mp3 audio for a known voice', async () => {
    const { app: a, calls } = app()
    const res = await a.inject({ method: 'POST', url: '/api/tts', payload: { voice: 'hero', text: 'On it!' } })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('audio/mpeg')
    expect(calls[0].url).toContain(VOICES.hero.id)
    expect(calls[0].body).toEqual({ text: 'On it!', model_id: 'eleven_flash_v2_5' })
  })

  it('rejects text over 200 characters', async () => {
    const { app: a, calls } = app()
    const res = await a.inject({ method: 'POST', url: '/api/tts', payload: { voice: 'hero', text: 'x'.repeat(201) } })
    expect(res.statusCode).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('rejects an unknown voice', async () => {
    const { app: a } = app()
    const res = await a.inject({ method: 'POST', url: '/api/tts', payload: { voice: 'narrator', text: 'hi' } })
    expect(res.statusCode).toBe(400)
  })

  it('a provider 401 becomes 503 so the browser falls back to its own voice', async () => {
    const { app: a } = app(401)
    const res = await a.inject({ method: 'POST', url: '/api/tts', payload: { voice: 'rival', text: 'hi' } })
    expect(res.statusCode).toBe(503)
  })
})

describe('pre-generated lines', () => {
  it('every LINES key has an mp3 in the web app', () => {
    const dir = fileURLToPath(new URL('../../web/public/lines/', import.meta.url))
    const missing = Object.keys(LINES).filter((k) => !existsSync(`${dir}${k}.mp3`))
    expect(missing).toEqual([])
  })

  it('every line fits the 200 character limit and uses a known voice', () => {
    for (const line of Object.values(LINES)) {
      expect(line.text.length).toBeLessThanOrEqual(200)
      expect(Object.keys(VOICES)).toContain(line.voice)
    }
  })
})
