import { describe, expect, it } from 'vitest'
import { applyAction, compare, newCity, simulate, STAGES, type Action, type City, type HeroClass, type Tick } from '../src'

const stage = STAGES.shorty

function build(actions: Action[], heroClass: HeroClass = 'generalist'): City {
  let city = newCity(stage, heroClass)
  for (const a of actions) {
    const r = applyAction(city, a, { stage, heroClass })
    if (!r.ok) throw new Error(r.reason)
    city = r.city
  }
  return city
}

const nova: Action[] = [
  { kind: 'place', type: 'lb', option: 'round_robin' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'sql', option: 'standard' },
  { kind: 'addon', building: 'sql1', addon: 'index' },
  { kind: 'addon', building: 'sql1', addon: 'read_replica' },
  { kind: 'link', from: 'users', to: 'lb1' },
  { kind: 'link', from: 'lb1', to: 'api1' },
  { kind: 'link', from: 'lb1', to: 'api2' },
  { kind: 'link', from: 'api1', to: 'sql1' },
  { kind: 'link', from: 'api2', to: 'sql1' },
]

const at = (ticks: Tick[], second: number) => ticks.find((t) => Math.abs(t.t - second) < 1e-6)!
const fraction = (tick: Tick) => tick.served / tick.offered
// Generalist: everything x1.1, so two large API servers pass 2 x 900 x 1.1 = 1,980 per second.
const NOVA_API = 1980

describe('simulate - stage 1', () => {
  it('nova baseline serves everything and the API sits near half load', () => {
    const r = simulate(build(nova), stage, 'generalist')
    for (const tick of r.ticks.filter((t) => t.t < 15)) expect(fraction(tick)).toBeCloseTo(1, 5)
    expect(at(r.ticks, 5).load.api1).toBeCloseTo(1000 / NOVA_API, 2)
  })

  it('celebrity tweet without a cache: the API servers cap what gets through', () => {
    const r = simulate(build(nova), stage, 'generalist')
    expect(fraction(at(r.ticks, 16))).toBeCloseTo(NOVA_API / 5000, 2)
    expect(at(r.ticks, 16).load.api1).toBeGreaterThan(2.5)
    expect(at(r.ticks, 16).load.sql1).toBeLessThan(1)
  })

  it('wildcard cache in front at t=15 saves it by t=17', () => {
    const r = simulate(build(nova), stage, 'generalist', {
      firefight: { atSecond: 15, action: { kind: 'insert', type: 'cache', option: 'standard', after: 'lb1', wildcard: true } },
    })
    expect(fraction(at(r.ticks, 17))).toBeGreaterThanOrEqual(0.98)
    expect(r.servedPct).toBeGreaterThan(0.85)
  })

  it('a cache behind the API servers does not relieve them during the tweet', () => {
    const city = build([
      ...nova,
      { kind: 'insert', type: 'cache', option: 'standard', after: 'api1', wildcard: true },
      { kind: 'unlink', from: 'api2', to: 'sql1' },
      { kind: 'link', from: 'api2', to: 'cache1' },
    ])
    const r = simulate(city, stage, 'generalist')
    expect(fraction(at(r.ticks, 20))).toBeCloseTo(NOVA_API / 5000, 2)
  })

  it('rusty (2 small API + NoSQL with 3 nodes) serves 60% at baseline', () => {
    const rusty = build(stage.rivalScripted, 'data_keeper')
    const r = simulate(rusty, stage, 'data_keeper')
    expect(fraction(at(r.ticks, 5))).toBeCloseTo(0.6, 2)
    expect(r.servedPct).toBeLessThanOrEqual(stage.rivalMaxServed)
  })

  it('a hot key on NoSQL is capped at one node', () => {
    const city: City = {
      buildings: [
        { id: 'lb1', type: 'lb', option: 'round_robin', addons: [] },
        ...Array.from({ length: 8 }, (_, i) => ({ id: `api${i + 1}`, type: 'api' as const, option: 'large', addons: [] })),
        { id: 'nosql1', type: 'nosql', option: 'standard', addons: [] },
      ],
      links: [
        { from: 'users', to: 'lb1' },
        ...Array.from({ length: 8 }, (_, i) => [
          { from: 'lb1', to: `api${i + 1}` },
          { from: `api${i + 1}`, to: 'nosql1' },
        ]).flat(),
      ],
      coins: 0,
      wildcardUsed: false,
      freeReplicaUsed: false,
    }
    const r = simulate(city, stage, 'generalist')
    // normal reads 900 + writes 100 + one node's worth of the hot link (1,500 x 1.1)
    expect(at(r.ticks, 16).served).toBeCloseTo(900 + 100 + 1650, 0)
  })

  it('an API server with no database behind it serves nothing', () => {
    const city = build(nova.filter((a) => !(a.kind === 'link' && a.to === 'sql1')))
    const r = simulate(city, stage, 'generalist')
    expect(at(r.ticks, 5).served).toBe(0)
  })

  it('simulate is deterministic', () => {
    expect(simulate(build(nova), stage, 'generalist')).toEqual(simulate(build(nova), stage, 'generalist'))
  })

  it('reports the worst moment and a lesson about it', () => {
    const r = simulate(build(nova), stage, 'generalist')
    expect(r.worstMoment.building).toMatch(/^api/)
    expect(r.worstMoment.second).toBeGreaterThanOrEqual(15)
    expect(r.lesson).toMatch(/API servers/)
  })
})

describe('compare', () => {
  const base = { ticks: [], worstMoment: { second: 0, building: '' }, lesson: '' }
  it('prefers higher served, then lower p95, then more coins', () => {
    expect(compare({ ...base, servedPct: 0.9, p95Ms: 500, coinsLeft: 0 }, { ...base, servedPct: 0.8, p95Ms: 10, coinsLeft: 50 })).toBe(1)
    expect(compare({ ...base, servedPct: 0.9, p95Ms: 500, coinsLeft: 0 }, { ...base, servedPct: 0.9, p95Ms: 100, coinsLeft: 0 })).toBe(-1)
    expect(compare({ ...base, servedPct: 0.9, p95Ms: 100, coinsLeft: 5 }, { ...base, servedPct: 0.9, p95Ms: 100, coinsLeft: 0 })).toBe(1)
    expect(compare({ ...base, servedPct: 0.9, p95Ms: 100, coinsLeft: 0 }, { ...base, servedPct: 0.9, p95Ms: 100, coinsLeft: 0 })).toBe(0)
  })
})
