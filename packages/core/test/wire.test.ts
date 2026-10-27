import { describe, expect, it } from 'vitest'
import { applyAction, autoWire, newCity, simulate, STAGES, type Action, type City } from '../src'

const stage = STAGES.shorty
function build(actions: Action[]): City {
  let city = newCity(stage, 'generalist')
  for (const a of actions) {
    const r = applyAction(city, a, { stage, heroClass: 'generalist' })
    if (!r.ok) throw new Error(r.reason)
    city = r.city
  }
  return city
}

const places: Action[] = [
  { kind: 'place', type: 'lb', option: 'round_robin' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'sql', option: 'standard' },
]

describe('autoWire', () => {
  it('connects users -> load balancer -> every API server -> the only database', () => {
    const wired = autoWire(build(places))
    expect(wired.links).toEqual([
      { from: 'users', to: 'lb1' },
      { from: 'lb1', to: 'api1' },
      { from: 'lb1', to: 'api2' },
      { from: 'api1', to: 'sql1' },
      { from: 'api2', to: 'sql1' },
    ])
  })

  it('never removes or duplicates links the player made', () => {
    const city = build([...places, { kind: 'link', from: 'users', to: 'lb1' }, { kind: 'link', from: 'lb1', to: 'api1' }])
    const wired = autoWire(city)
    expect(wired.links.filter((l) => l.from === 'users')).toHaveLength(1)
    expect(wired.links.filter((l) => l.from === 'lb1' && l.to === 'api1')).toHaveLength(1)
  })

  it('leaves API servers alone when there are two databases to choose from', () => {
    const wired = autoWire(build([...places, { kind: 'place', type: 'nosql', option: 'standard' }]))
    expect(wired.links.some((l) => l.from === 'api1')).toBe(false)
  })

  it('a new API server joins behind a cache that sits after the load balancer', () => {
    const city = build([
      ...places,
      { kind: 'link', from: 'users', to: 'lb1' },
      { kind: 'insert', type: 'cache', option: 'standard', after: 'lb1', wildcard: true },
      { kind: 'place', type: 'api', option: 'small' },
    ])
    expect(autoWire(city).links).toContainEqual({ from: 'cache1', to: 'api3' })
  })
})

describe('autoWire with a queue', () => {
  it('an API server that only feeds a queue still gets the database for reads', () => {
    const chatter = STAGES.chatter
    let city = newCity(chatter, 'generalist')
    for (const a of [
      { kind: 'place', type: 'api', option: 'large' },
      { kind: 'place', type: 'sql', option: 'standard' },
      { kind: 'place', type: 'queue', option: 'standard' },
      { kind: 'link', from: 'api1', to: 'queue1' },
    ] as Action[]) {
      const r = applyAction(city, a, { stage: chatter, heroClass: 'generalist' })
      if (!r.ok) throw new Error(r.reason)
      city = r.city
    }
    expect(autoWire(city).links).toContainEqual({ from: 'api1', to: 'sql1' })
  })

  it('a new queue and workers are connected: API servers -> queue -> workers -> the only database', () => {
    const chatter = STAGES.chatter
    let city = newCity(chatter, 'generalist')
    for (const a of [
      { kind: 'place', type: 'lb', option: 'round_robin' },
      { kind: 'place', type: 'api', option: 'large' },
      { kind: 'place', type: 'sql', option: 'standard' },
      { kind: 'place', type: 'queue', option: 'standard' },
      { kind: 'place', type: 'worker', option: 'standard' },
      { kind: 'place', type: 'worker', option: 'standard' },
    ] as Action[]) {
      const r = applyAction(city, a, { stage: chatter, heroClass: 'generalist' })
      if (!r.ok) throw new Error(r.reason)
      city = r.city
    }
    const links = autoWire(city).links
    expect(links).toEqual(expect.arrayContaining([
      { from: 'api1', to: 'queue1' }, { from: 'api1', to: 'sql1' },
      { from: 'queue1', to: 'worker1' }, { from: 'queue1', to: 'worker2' },
      { from: 'worker1', to: 'sql1' }, { from: 'worker2', to: 'sql1' },
    ]))
  })
})

describe('lesson when nothing is connected', () => {
  it('says that traffic never reached the city', () => {
    const r = simulate(build(places), stage, 'generalist')
    expect(r.servedPct).toBe(0)
    expect(r.lesson).toMatch(/never reached/)
  })
})

describe('scriptedRival', () => {
  it('builds every stage rival from its script, wired and within budget', async () => {
    const { scriptedRival, STAGE_ORDER } = await import('../src')
    for (const id of STAGE_ORDER) {
      const r = scriptedRival(STAGES[id])
      expect(r.source).toBe('scripted')
      expect(r.city.buildings.length).toBeGreaterThan(0)
      expect(r.city.links.some((l) => l.from === 'users')).toBe(true)
      expect(r.city.coins).toBeGreaterThanOrEqual(0)
    }
  })
})
