import { describe, expect, it } from 'vitest'
import { applyAction, autoWire, newCity, STAGES, type Action, type City } from '@uptime/core'
import { layoutCity, routesFor } from './layout'

const stage = STAGES.shorty
function build(actions: Action[]): City {
  let city = newCity(stage, 'generalist')
  for (const a of actions) {
    const r = applyAction(city, a, { stage, heroClass: 'generalist' })
    if (!r.ok) throw new Error(r.reason)
    city = r.city
  }
  return autoWire(city)
}
const fun = build([
  { kind: 'place', type: 'lb', option: 'round_robin' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'sql', option: 'standard' },
])
const withCache = build([
  { kind: 'place', type: 'lb', option: 'round_robin' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'sql', option: 'standard' },
  { kind: 'link', from: 'users', to: 'lb1' },
  { kind: 'insert', type: 'cache', option: 'standard', after: 'lb1', wildcard: true },
])

describe('layoutCity', () => {
  it('is deterministic', () => {
    expect(layoutCity(fun)).toEqual(layoutCity(fun))
  })

  it('puts users leftmost and the database rightmost', () => {
    const { positions } = layoutCity(fun)
    const xs = Object.values(positions).map((p) => p[0])
    expect(positions.users[0]).toBe(Math.min(...xs))
    expect(positions.sql1[0]).toBe(Math.max(...xs))
  })

  it('a cache in front sits between the load balancer and the API servers', () => {
    const { positions } = layoutCity(withCache)
    expect(positions.cache1[0]).toBeGreaterThan(positions.lb1[0])
    expect(positions.cache1[0]).toBeLessThan(positions.api1[0])
  })

  it('no two buildings share a cell', () => {
    const { positions } = layoutCity(withCache)
    const cells = Object.values(positions).map((p) => p.join(','))
    expect(new Set(cells).size).toBe(cells.length)
  })

  it('there is a road for every link', () => {
    const { roads } = layoutCity(fun)
    expect(roads.map((r) => `${r.from}>${r.to}`)).toEqual(fun.links.map((l) => `${l.from}>${l.to}`))
  })
})

describe('routesFor', () => {
  it('follows every path from the users to the end of the city', () => {
    const routes = routesFor(fun)
    expect(routes.map((r) => r.join('>'))).toEqual(['users>lb1>api1>sql1', 'users>lb1>api2>sql1'])
  })

  it('stops at loops instead of spinning forever', () => {
    const loop: City = { ...fun, links: [...fun.links, { from: 'sql1', to: 'lb1' }] }
    expect(routesFor(loop).length).toBeGreaterThan(0)
  })
})
