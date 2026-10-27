import { describe, expect, it } from 'vitest'
import { applyAction, autoWire, compare, newCity, simulate, STAGES, STAGE_ORDER, type Action, type City, type HeroClass } from '../src'

function build(stageId: string, actions: Action[], heroClass: HeroClass = 'generalist'): City {
  const stage = STAGES[stageId]
  let city = newCity(stage, heroClass)
  for (const a of actions) {
    const r = applyAction(city, a, { stage, heroClass })
    if (!r.ok) throw new Error(`${a.kind} ${'type' in a ? a.type : ''}: ${r.reason}`)
    city = r.city
  }
  return autoWire(city)
}
const at = (r: ReturnType<typeof simulate>, s: number) => r.ticks.find((t) => Math.abs(t.t - s) < 1e-6)!

const feedReference: Action[] = [
  { kind: 'place', type: 'cdn', option: 'standard' },
  { kind: 'place', type: 'lb', option: 'round_robin' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'sql', option: 'standard' },
  { kind: 'addon', building: 'sql1', addon: 'index' },
  { kind: 'place', type: 'storage', option: 'standard' },
]

describe('stage 3 - Feed', () => {
  const stage = STAGES.feed

  it('unlocks the CDN and object storage', () => {
    expect(stage.unlocked).toEqual(expect.arrayContaining(['cdn', 'storage']))
  })

  it('wires users -> CDN -> load balancer, and API servers -> storage for photos', () => {
    const links = build('feed', feedReference).links
    expect(links).toEqual(expect.arrayContaining([
      { from: 'users', to: 'cdn1' }, { from: 'cdn1', to: 'lb1' }, { from: 'api1', to: 'storage1' }, { from: 'api1', to: 'sql1' },
    ]))
  })

  it('the CDN absorbs most photo traffic before it reaches the servers', () => {
    const r = simulate(build('feed', feedReference), stage, 'generalist')
    const tick = at(r, 5)
    expect(tick.load.api1).toBeLessThan(0.5)
    expect(tick.dropped).toBeCloseTo(0, 5)
  })

  it('without object storage, photos crush the database once the surge hits', () => {
    const noStorage = build('feed', feedReference.filter((a) => !(a.kind === 'place' && a.type === 'storage')))
    const r = simulate(noStorage, stage, 'generalist')
    expect(at(r, 16).load.sql1).toBeGreaterThan(1)
    expect(simulate(build('feed', feedReference), stage, 'generalist').ticks[160].load.sql1).toBeLessThan(1)
  })

  it('the surge chaos multiplies the traffic', () => {
    const r = simulate(build('feed', feedReference), stage, 'generalist')
    expect(at(r, 16).offered).toBeGreaterThan(at(r, 5).offered * 5)
  })

  it('the reference build beats the scripted rival, which stays under its limit', () => {
    const ref = simulate(build('feed', feedReference), stage, 'generalist')
    const rival = simulate(build('feed', stage.rivalScripted, stage.rivalClass), stage, stage.rivalClass)
    expect(rival.servedPct).toBeLessThanOrEqual(stage.rivalMaxServed)
    expect(compare(ref, rival)).toBe(1)
  })
})

const bossReference: Action[] = [
  { kind: 'place', type: 'lb', option: 'rate_limit' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'sql', option: 'standard' },
  { kind: 'addon', building: 'sql1', addon: 'index' },
  { kind: 'addon', building: 'sql1', addon: 'read_replica' },
  { kind: 'place', type: 'queue', option: 'standard' },
  { kind: 'place', type: 'worker', option: 'standard' },
  { kind: 'place', type: 'worker', option: 'standard' },
  { kind: 'place', type: 'worker', option: 'standard' },
]

describe('boss - Ticket Rush', () => {
  const stage = STAGES.ticket_rush

  it('is the last campaign stage and has two chaos cards', () => {
    expect(STAGE_ORDER.filter((id) => STAGES[id].track === 'campaign').at(-1)).toBe('ticket_rush')
    expect(stage.chaos).toHaveLength(2)
  })

  it('a bot army is mostly stopped by a rate-limiting load balancer', () => {
    const limited = simulate(build('ticket_rush', bossReference), stage, 'generalist')
    const open = simulate(build('ticket_rush', bossReference.map((a) => (a.kind === 'place' && a.type === 'lb' ? { ...a, option: 'round_robin' } : a))), stage, 'generalist')
    expect(at(limited, 12).load.api1).toBeLessThan(at(open, 12).load.api1)
    expect(limited.servedPct).toBeGreaterThan(open.servedPct)
  })

  it('bot requests never count as served or offered', () => {
    const r = simulate(build('ticket_rush', bossReference), stage, 'generalist')
    expect(at(r, 12).offered).toBe(at(r, 5).offered)
  })

  it('when payments go down, orders without a queue are lost and with a queue are kept', () => {
    const withQueue = simulate(build('ticket_rush', bossReference), stage, 'generalist')
    const noQueue = simulate(build('ticket_rush', bossReference.filter((a) => !(a.kind === 'place' && (a.type === 'queue' || a.type === 'worker')))), stage, 'generalist')
    expect(at(withQueue, 22).dropped).toBeLessThan(at(noQueue, 22).dropped)
    expect(at(noQueue, 22).dropped).toBeGreaterThan(0)
  })

  it('the reference build beats the scripted rival, which stays under its limit', () => {
    const ref = simulate(build('ticket_rush', bossReference), stage, 'generalist')
    const rival = simulate(build('ticket_rush', stage.rivalScripted, stage.rivalClass), stage, stage.rivalClass)
    expect(rival.servedPct).toBeLessThanOrEqual(stage.rivalMaxServed)
    expect(compare(ref, rival)).toBe(1)
  })
})
