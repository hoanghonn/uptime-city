import { describe, expect, it } from 'vitest'
import { applyAction, newCity, STAGES, type Action, type City, type HeroClass } from '../src'

const stage = STAGES.shorty

function run(actions: Action[], heroClass: HeroClass = 'generalist', start?: City) {
  let city = start ?? newCity(stage, heroClass)
  for (const action of actions) {
    const res = applyAction(city, action, { stage, heroClass })
    if (!res.ok) throw new Error(`${action.kind} rejected: ${res.reason}`)
    city = res.city
  }
  return city
}

const funTestBuild: Action[] = [
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

describe('applyAction', () => {
  it('fun-test build costs exactly 100', () => {
    const city = run(funTestBuild)
    expect(city.coins).toBe(0)
    expect(city.buildings.map((b) => b.id)).toEqual(['lb1', 'api1', 'api2', 'sql1'])
    expect(city.links).toHaveLength(5)
  })

  it('place over budget is rejected with "not enough coins"', () => {
    const city = run(funTestBuild)
    const res = applyAction(city, { kind: 'place', type: 'api', option: 'small' }, { stage, heroClass: 'generalist' })
    expect(res).toEqual({ ok: false, reason: 'not enough coins' })
  })

  it('locked building is rejected', () => {
    const res = applyAction(newCity(stage, 'generalist'), { kind: 'place', type: 'queue', option: 'standard' }, { stage, heroClass: 'generalist' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/locked/)
  })

  it('read_replica on nosql is rejected', () => {
    const city = run([{ kind: 'place', type: 'nosql', option: 'standard' }])
    const res = applyAction(city, { kind: 'addon', building: 'nosql1', addon: 'read_replica' }, { stage, heroClass: 'generalist' })
    expect(res.ok).toBe(false)
  })

  it('link from users to sql is rejected with a reason', () => {
    const city = run([{ kind: 'place', type: 'sql', option: 'standard' }])
    const res = applyAction(city, { kind: 'link', from: 'users', to: 'sql1' }, { stage, heroClass: 'generalist' })
    expect(res).toEqual({ ok: false, reason: 'users must reach a load balancer, cache or CDN first' })
  })

  it('link to a building that does not exist is rejected', () => {
    const res = applyAction(newCity(stage, 'generalist'), { kind: 'link', from: 'users', to: 'lb9' }, { stage, heroClass: 'generalist' })
    expect(res).toEqual({ ok: false, reason: 'no building called lb9' })
  })

  it('applyAction does not mutate input', () => {
    const city = run(funTestBuild.slice(0, 4))
    const snapshot = JSON.parse(JSON.stringify(city))
    applyAction(city, { kind: 'addon', building: 'sql1', addon: 'index' }, { stage, heroClass: 'generalist' })
    applyAction(city, { kind: 'remove', building: 'api1' }, { stage, heroClass: 'generalist' })
    expect(city).toEqual(snapshot)
  })

  it('remove refunds the building and its add-ons and drops its links', () => {
    const city = run([...funTestBuild, { kind: 'remove', building: 'sql1' }])
    expect(city.coins).toBe(40)
    expect(city.links.some((l) => l.to === 'sql1')).toBe(false)
  })

  it('wildcard cache costs 0, rewires after the load balancer, and only works once', () => {
    const city = run([...funTestBuild, { kind: 'insert', type: 'cache', option: 'standard', after: 'lb1', wildcard: true }])
    expect(city.coins).toBe(0)
    expect(city.wildcardUsed).toBe(true)
    expect(city.links).toContainEqual({ from: 'lb1', to: 'cache1' })
    expect(city.links).toContainEqual({ from: 'cache1', to: 'api1' })
    expect(city.links).toContainEqual({ from: 'cache1', to: 'api2' })
    expect(city.links).not.toContainEqual({ from: 'lb1', to: 'api1' })
    const again = applyAction(city, { kind: 'insert', type: 'cache', option: 'standard', after: 'api1', wildcard: true }, { stage, heroClass: 'generalist' })
    expect(again).toEqual({ ok: false, reason: 'wildcard already used' })
  })

  it('data keeper first replica is free, second is not', () => {
    const city = run(
      [
        { kind: 'place', type: 'sql', option: 'standard' },
        { kind: 'addon', building: 'sql1', addon: 'read_replica' },
      ],
      'data_keeper',
    )
    expect(city.coins).toBe(100 - 20)
    const second = applyAction(city, { kind: 'addon', building: 'sql1', addon: 'read_replica' }, { stage, heroClass: 'data_keeper' })
    expect(second.ok && second.city.coins).toBe(100 - 20 - 15)
  })

  it('firefighter starts with 10 fewer coins and edge runner pays 5 more for databases', () => {
    expect(newCity(stage, 'firefighter').coins).toBe(90)
    const city = run([{ kind: 'place', type: 'sql', option: 'standard' }], 'edge_runner')
    expect(city.coins).toBe(100 - 25)
  })
})
