import { describe, expect, it } from 'vitest'
import { applyAction, autoWire, newCity, STAGES, type Action, type City } from '@uptime/core'
import { localCommand, parseLocal } from './localParser'

function cityWith(stageId: string, actions: Action[]): City {
  const stage = STAGES[stageId]
  let city = newCity(stage, 'generalist')
  for (const a of actions) {
    const r = applyAction(city, a, { stage, heroClass: 'generalist' })
    if (r.ok) city = r.city
  }
  return autoWire(city)
}

describe('parseLocal', () => {
  it('handles the fun-test sentence', () => {
    expect(parseLocal('Round robin balancer, two large servers, SQL with an index and a replica', 'shorty', newCity(STAGES.shorty, 'generalist'))).toEqual([
      { kind: 'place', type: 'lb', option: 'round_robin' },
      { kind: 'place', type: 'api', option: 'large' },
      { kind: 'place', type: 'api', option: 'large' },
      { kind: 'place', type: 'sql', option: 'standard' },
      { kind: 'addon', building: 'sql1', addon: 'index' },
      { kind: 'addon', building: 'sql1', addon: 'read_replica' },
    ])
  })

  it('handles NoSQL with extra nodes and a least connections balancer', () => {
    expect(parseLocal('least connections balancer, 3 small servers, nosql with an extra node', 'shorty', newCity(STAGES.shorty, 'generalist'))).toEqual([
      { kind: 'place', type: 'lb', option: 'least_conn' },
      { kind: 'place', type: 'api', option: 'small' },
      { kind: 'place', type: 'api', option: 'small' },
      { kind: 'place', type: 'api', option: 'small' },
      { kind: 'place', type: 'nosql', option: 'standard' },
      { kind: 'addon', building: 'nosql1', addon: 'nosql_node' },
    ])
  })

  it('handles a queue with two workers in stage 2', () => {
    const actions = parseLocal('a queue with two workers', 'chatter', newCity(STAGES.chatter, 'generalist'))
    expect(actions).toEqual([
      { kind: 'place', type: 'queue', option: 'standard' },
      { kind: 'place', type: 'worker', option: 'standard' },
      { kind: 'place', type: 'worker', option: 'standard' },
    ])
  })

  it('a cache in front goes after the load balancer, using the wildcard', () => {
    const city = cityWith('shorty', [{ kind: 'place', type: 'lb', option: 'round_robin' }, { kind: 'place', type: 'api', option: 'large' }])
    expect(parseLocal('put the cache in front of the servers', 'shorty', city)).toEqual([
      { kind: 'insert', type: 'cache', option: 'standard', after: 'lb1', wildcard: true },
    ])
  })

  it('a cache behind goes after the first API server', () => {
    const city = cityWith('shorty', [{ kind: 'place', type: 'lb', option: 'round_robin' }, { kind: 'place', type: 'api', option: 'large' }, { kind: 'place', type: 'sql', option: 'standard' }])
    expect(parseLocal('cache behind the API', 'shorty', city)).toEqual([
      { kind: 'insert', type: 'cache', option: 'standard', after: 'api1', wildcard: true },
    ])
  })

  it('understands nothing it should not', () => {
    expect(parseLocal('hello there', 'shorty', newCity(STAGES.shorty, 'generalist'))).toEqual([])
  })
})

describe('localCommand', () => {
  it('applies actions, wires the city, and reports refusals', () => {
    const res = localCommand('two large servers and SQL', 'shorty', 'generalist', newCity(STAGES.shorty, 'generalist'), 'build')
    expect(res.city.buildings.map((b) => b.id)).toEqual(['api1', 'api2', 'sql1'])
    expect(res.city.links).toContainEqual({ from: 'api1', to: 'sql1' })
    expect(res.heroLine).toBe('Built it.')
  })

  it('says "submit" starts the test', () => {
    expect(localCommand('submit', 'shorty', 'generalist', newCity(STAGES.shorty, 'generalist'), 'build').submit).toBe(true)
  })

  it('an order it cannot understand asks the player to rephrase', () => {
    expect(localCommand('make it web scale', 'shorty', 'generalist', newCity(STAGES.shorty, 'generalist'), 'build').heroLine).toMatch(/simpler words/)
  })
})
