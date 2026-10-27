import fs from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app'
import { HeroLimits, makeHero, makePortrait } from '../src/hero'
import type { ChatClient } from '../src/command'

const CV = 'Jane Placeholder. Backend engineer, 6 years. Postgres, Kafka, on-call lead for payments. Hobbies: bouldering.'

function chat(content: string) {
  const requests: any[] = []
  const client: ChatClient = { chat: { completions: { create: async (req: any) => { requests.push(req); return { choices: [{ message: { content } }] } } } } }
  return { client, requests }
}
const card = { nickname: 'Kafka Climber', heroClass: 'data_keeper', quirk: 'Clips a carabiner to every queue', catchphrase: 'Commit log or it did not happen!', voiceStyle: 'calm', seniority: 'senior', score: 9 }

afterEach(() => vi.restoreAllMocks())

describe('makeHero', () => {
  it('returns only the hero card fields, never anything that rates the person', async () => {
    const { client } = chat(JSON.stringify(card))
    const hero = await makeHero(client, { text: CV })
    expect(Object.keys(hero).sort()).toEqual(['catchphrase', 'heroClass', 'nickname', 'quirk'])
    expect(hero.heroClass).toBe('data_keeper')
  })

  it('an invalid class from the model falls back to generalist', async () => {
    const { client } = chat(JSON.stringify({ ...card, heroClass: 'archmage' }))
    expect((await makeHero(client, { text: CV })).heroClass).toBe('generalist')
  })

  it('sends a PDF inline as a file part and tells the model not to judge the person', async () => {
    const { client, requests } = chat(JSON.stringify(card))
    await makeHero(client, { pdfBase64: Buffer.from('%PDF-1.4 fake').toString('base64') })
    const user = requests[0].messages[1].content
    expect(user.find((p: any) => p.type === 'file').file.file_data).toMatch(/^data:application\/pdf;base64,/)
    expect(requests[0].messages[0].content).toMatch(/never judge, rate or rank the person/i)
  })

  it('the CV is never written to disk or to the logs', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info')]
    const writes = [vi.spyOn(fs, 'writeFileSync'), vi.spyOn(fs, 'appendFileSync')]
    const { client } = chat(JSON.stringify(card))
    await makeHero(client, { text: CV })
    const failing: ChatClient = { chat: { completions: { create: async () => { throw new Error('boom') } } } }
    await makeHero(failing, { text: CV }).catch(() => {})
    for (const spy of [...logs, ...writes]) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('Placeholder')
    }
    for (const spy of writes) expect(spy).not.toHaveBeenCalled()
  })

  it('model output that is not JSON falls back to a stock card', async () => {
    const { client } = chat('I would rather not.')
    const hero = await makeHero(client, { text: CV })
    expect(hero).toEqual({ nickname: 'Nova', heroClass: 'generalist', quirk: 'Builds first, asks questions later', catchphrase: 'Let us build something that holds!' })
  })
})

describe('makePortrait', () => {
  it('asks Muse Image for a portrait from the quirk and class only', async () => {
    const calls: any[] = []
    const images = { generate: async (req: any) => { calls.push(req); return { data: [{ b64_json: 'UklGRg==' }] } } }
    const url = await makePortrait(images, { heroClass: 'data_keeper', quirk: 'Clips a carabiner to every queue' })
    expect(url).toBe('data:image/webp;base64,UklGRg==')
    expect(calls[0].model).toBe('muse-image-1.0')
    expect(calls[0].prompt).toContain('Clips a carabiner')
    expect(calls[0].prompt).toMatch(/no text/i)
  })
})

describe('POST /api/hero', () => {
  it('the 6th hero in a day from one player is refused', async () => {
    const { client } = chat(JSON.stringify(card))
    const app = buildApp({ meta: client, bot: client, heroLimits: new HeroLimits({ perDay: 5 }) })
    const post = () => app.inject({ method: 'POST', url: '/api/hero', headers: { 'x-player-id': 'p1' }, payload: { text: CV } })
    for (let i = 0; i < 5; i++) expect((await post()).statusCode).toBe(200)
    expect((await post()).statusCode).toBe(429)
  })

  it('rejects an empty request and an oversized CV', async () => {
    const { client } = chat(JSON.stringify(card))
    const app = buildApp({ meta: client, bot: client })
    expect((await app.inject({ method: 'POST', url: '/api/hero', payload: {} })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/hero', payload: { text: 'x'.repeat(20001) } })).statusCode).toBe(400)
  })
})
