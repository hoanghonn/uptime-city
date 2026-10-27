import { describe, expect, it } from 'vitest'
import { newCity, STAGES } from '@uptime/core'
import { buildApp } from '../src/app'
import { Budget, metered, PRICES } from '../src/usage'
import { RunLimits } from '../src/caps'
import type { ChatClient } from '../src/command'

const ok: ChatClient = {
  chat: { completions: { create: async () => ({ choices: [{ message: { content: 'Done!', tool_calls: [] } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } }) } },
}
const cmd = (runId: string) => ({
  method: 'POST' as const,
  url: '/api/command',
  headers: { 'x-run-id': runId },
  payload: { stageId: 'shorty', heroClass: 'generalist', city: newCity(STAGES.shorty, 'generalist'), transcript: 'hi', phase: 'build' },
})

describe('run limits', () => {
  it('the 11th concurrent run is turned away with a friendly message', async () => {
    const app = buildApp({ meta: ok, bot: ok, limits: new RunLimits({ maxRuns: 10 }) })
    for (let i = 0; i < 10; i++) expect((await app.inject(cmd(`run-${i}`))).statusCode).toBe(200)
    const res = await app.inject(cmd('run-10'))
    expect(res.statusCode).toBe(429)
    expect(res.json()).toEqual({ error: 'city_full', message: 'The city is full, try again in a minute.' })
  })

  it('the 21st command in one run is refused', async () => {
    const app = buildApp({ meta: ok, bot: ok, limits: new RunLimits({ maxCommands: 20 }) })
    for (let i = 0; i < 20; i++) expect((await app.inject(cmd('one'))).statusCode).toBe(200)
    expect((await app.inject(cmd('one'))).statusCode).toBe(429)
  })

  it('runs go quiet after 5 minutes and free their slot', () => {
    let now = 0
    const limits = new RunLimits({ maxRuns: 1, now: () => now })
    expect(limits.take('a', 'command')).toBe('ok')
    expect(limits.take('b', 'command')).toBe('city_full')
    now = 5 * 60_000 + 1
    expect(limits.take('b', 'command')).toBe('ok')
  })

  it('a request without a run id is refused', async () => {
    const app = buildApp({ meta: ok, bot: ok, limits: new RunLimits({}) })
    const res = await app.inject({ ...cmd('x'), headers: {} })
    expect(res.statusCode).toBe(400)
  })
})

describe('daily budget and low-power mode', () => {
  it('metered clients add the token cost to the budget', async () => {
    const budget = new Budget({ dailyUsd: 6 })
    await metered(ok, budget, PRICES.museSpark).chat.completions.create({})
    expect(budget.spentUsd()).toBeCloseTo((1000 * 1.25 + 100 * 4.25) / 1e6, 9)
  })

  it('spending past the daily cap flips the status to low-power', async () => {
    const budget = new Budget({ dailyUsd: 0.000001 })
    const app = buildApp({ meta: metered(ok, budget, PRICES.museSpark), bot: ok, budget })
    expect((await app.inject({ method: 'GET', url: '/api/status' })).json()).toEqual({ mode: 'full' })
    await app.inject(cmd('r'))
    expect((await app.inject({ method: 'GET', url: '/api/status' })).json()).toEqual({ mode: 'low-power', reason: 'budget' })
  })

  it('in low-power mode, commands return 503 and the rival is scripted', async () => {
    const budget = new Budget({ dailyUsd: 6 })
    budget.add(7)
    const app = buildApp({ meta: ok, bot: ok, budget })
    expect((await app.inject(cmd('r'))).json()).toEqual({ error: 'low_power' })
    const rival = await app.inject({ method: 'POST', url: '/api/rival', headers: { 'x-run-id': 'r' }, payload: { stageId: 'shorty' } })
    expect(rival.json().source).toBe('scripted')
  })

  it('the budget resets on a new day (UTC)', () => {
    let now = Date.UTC(2026, 10, 1, 23, 0)
    const budget = new Budget({ dailyUsd: 6, now: () => now })
    budget.add(7)
    expect(budget.exhausted()).toBe(true)
    now = Date.UTC(2026, 10, 2, 0, 1)
    expect(budget.exhausted()).toBe(false)
  })
})
