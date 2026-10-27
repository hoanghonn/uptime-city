import { describe, expect, it } from 'vitest'
import { applyAction, autoWire, newCity, STAGES, type Action, type City } from '@uptime/core'
import { paletteItems } from './palette'

function cityWith(stageId: string, actions: Action[], heroClass = 'generalist' as const): City {
  const stage = STAGES[stageId]
  let city = newCity(stage, heroClass)
  for (const a of actions) {
    const r = applyAction(city, a, { stage, heroClass })
    if (r.ok) city = r.city
  }
  return autoWire(city)
}

describe('paletteItems', () => {
  it('lists every unlocked building option with its cost and what it does', () => {
    const groups = paletteItems('shorty', newCity(STAGES.shorty, 'generalist'), 'generalist', 'build')
    const names = groups.map((g) => g.title)
    expect(names).toEqual(['Load balancer', 'API server', 'SQL database', 'NoSQL database', 'Cache (free wildcard)'])
    const api = groups.find((g) => g.title === 'API server')!
    expect(api.items.map((i) => [i.label, i.cost])).toEqual([['Small', 10], ['Large', 25]])
    expect(api.items[1].pro).toMatch(/900 requests a second/)
    expect(api.items[1].action).toEqual({ kind: 'place', type: 'api', option: 'large' })
  })

  it('greys out what you cannot afford, with the reason', () => {
    const rich = cityWith('shorty', [{ kind: 'place', type: 'api', option: 'large' }, { kind: 'place', type: 'api', option: 'large' }, { kind: 'place', type: 'api', option: 'large' }])
    const large = paletteItems('shorty', rich, 'generalist', 'build').find((g) => g.title === 'API server')!.items[1]
    expect(rich.coins).toBe(25)
    expect(large.disabled).toBe(false)
    const poor = cityWith('shorty', [{ kind: 'place', type: 'api', option: 'large' }, { kind: 'place', type: 'api', option: 'large' }, { kind: 'place', type: 'api', option: 'large' }, { kind: 'place', type: 'api', option: 'small' }])
    const large2 = paletteItems('shorty', poor, 'generalist', 'build').find((g) => g.title === 'API server')!.items[1]
    expect(large2).toMatchObject({ disabled: true, reason: 'not enough coins' })
  })

  it('shows class cost changes', () => {
    const sql = paletteItems('shorty', newCity(STAGES.shorty, 'edge_runner'), 'edge_runner', 'build').find((g) => g.title === 'SQL database')!
    expect(sql.items[0].cost).toBe(25)
  })

  it('database add-ons appear once there is a database to add them to', () => {
    const none = paletteItems('shorty', newCity(STAGES.shorty, 'generalist'), 'generalist', 'build').find((g) => g.title === 'SQL database')!
    expect(none.items.find((i) => i.label === 'Read replica')).toMatchObject({ disabled: true, reason: 'build a SQL database first' })
    const withDb = paletteItems('shorty', cityWith('shorty', [{ kind: 'place', type: 'sql', option: 'standard' }]), 'generalist', 'build').find((g) => g.title === 'SQL database')!
    expect(withDb.items.find((i) => i.label === 'Read replica')).toMatchObject({ disabled: false, action: { kind: 'addon', building: 'sql1', addon: 'read_replica' } })
  })

  it('the wildcard cache can go in front of or behind the servers, for free, once', () => {
    const city = cityWith('shorty', [{ kind: 'place', type: 'lb', option: 'round_robin' }, { kind: 'place', type: 'api', option: 'large' }])
    const cache = paletteItems('shorty', city, 'generalist', 'build').find((g) => g.title === 'Cache (free wildcard)')!
    expect(cache.items.map((i) => [i.label, i.cost, i.action])).toEqual([
      ['In front of the servers', 0, { kind: 'insert', type: 'cache', option: 'standard', after: 'lb1', wildcard: true }],
      ['Behind the servers', 0, { kind: 'insert', type: 'cache', option: 'standard', after: 'api1', wildcard: true }],
    ])
    const used = { ...city, wildcardUsed: true }
    expect(paletteItems('shorty', used, 'generalist', 'build').find((g) => g.title === 'Cache (free wildcard)')!.items[0]).toMatchObject({ disabled: true, reason: 'wildcard already used' })
  })

  it('outside the build and firefight phases everything is disabled', () => {
    const groups = paletteItems('shorty', newCity(STAGES.shorty, 'generalist'), 'generalist', 'test')
    expect(groups.flatMap((g) => g.items).every((i) => i.disabled)).toBe(true)
  })
})

describe('trade-offs', () => {
  it('every option in every stage shows one plus and one minus', async () => {
    const { STAGE_ORDER } = await import('@uptime/core')
    for (const id of STAGE_ORDER) {
      for (const g of paletteItems(id, newCity(STAGES[id], 'generalist'), 'generalist', 'build')) {
        for (const i of g.items) {
          expect(i.pro, `${id} ${g.title} ${i.label}`).toMatch(/\w/)
          expect(i.con, `${id} ${g.title} ${i.label}`).toMatch(/\w/)
        }
      }
    }
  })
})
