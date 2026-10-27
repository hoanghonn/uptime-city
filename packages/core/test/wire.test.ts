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

describe('lesson when nothing is connected', () => {
  it('says that traffic never reached the city', () => {
    const r = simulate(build(places), stage, 'generalist')
    expect(r.servedPct).toBe(0)
    expect(r.lesson).toMatch(/never reached/)
  })
})
