import { ALLOWED_LINKS, CATALOG } from './catalog'
import { CLASSES } from './classes'
import type { Action, ActionContext, ActionResult, Building, BuildingType, City, HeroClass, Stage } from './types'

export function newCity(stage: Stage, heroClass: HeroClass): City {
  return {
    buildings: [],
    links: [],
    coins: stage.budget + CLASSES[heroClass].budgetDelta,
    wildcardUsed: false,
    freeReplicaUsed: false,
  }
}

const fail = (reason: string): ActionResult => ({ ok: false, reason })

function nextId(city: City, type: BuildingType): string {
  let n = 1
  while (city.buildings.some((b) => b.id === `${type}${n}`)) n++
  return `${type}${n}`
}

function buildingCost(type: BuildingType, option: string, heroClass: HeroClass): number {
  return CATALOG[type].options[option].cost + (CLASSES[heroClass].costDelta[type] ?? 0)
}

function addonCost(city: City, addon: string, type: BuildingType, heroClass: HeroClass): { cost: number; usesFreeReplica: boolean } {
  const base = CATALOG[type].addons[addon].cost
  if (addon === 'read_replica' && CLASSES[heroClass].freeFirstReplica && !city.freeReplicaUsed) {
    return { cost: 0, usesFreeReplica: true }
  }
  return { cost: base, usesFreeReplica: false }
}

function typeOf(city: City, id: string): BuildingType | 'users' | undefined {
  if (id === 'users') return 'users'
  return city.buildings.find((b) => b.id === id)?.type
}

function checkNew(type: BuildingType, option: string, ctx: ActionContext, wildcard: boolean): string | null {
  const unlocked = ctx.stage.unlocked.includes(type) || (wildcard && ctx.stage.wildcard === type)
  if (!unlocked) return `${CATALOG[type].name} is locked in this stage`
  if (!CATALOG[type].options[option]) return `${CATALOG[type].name} has no option called ${option}`
  return null
}

/** Pure: returns a new city or a reason. Never mutates `city`. */
export function applyAction(city: City, action: Action, ctx: ActionContext): ActionResult {
  const { heroClass } = ctx
  switch (action.kind) {
    case 'place': {
      const problem = checkNew(action.type, action.option, ctx, false)
      if (problem) return fail(problem)
      const cost = buildingCost(action.type, action.option, heroClass)
      if (cost > city.coins) return fail('not enough coins')
      const b: Building = { id: nextId(city, action.type), type: action.type, option: action.option, addons: [] }
      return { ok: true, city: { ...city, buildings: [...city.buildings, b], coins: city.coins - cost } }
    }
    case 'insert': {
      const wildcard = action.wildcard === true
      if (wildcard && city.wildcardUsed) return fail('wildcard already used')
      if (wildcard && ctx.stage.wildcard !== action.type) return fail(`the wildcard is not a ${CATALOG[action.type].name}`)
      const problem = checkNew(action.type, action.option, ctx, wildcard)
      if (problem) return fail(problem)
      if (!typeOf(city, action.after)) return fail(`no building called ${action.after}`)
      const cost = wildcard ? 0 : buildingCost(action.type, action.option, heroClass)
      if (cost > city.coins) return fail('not enough coins')
      const id = nextId(city, action.type)
      const outgoing = city.links.filter((l) => l.from === action.after)
      const links = [
        ...city.links.filter((l) => l.from !== action.after),
        { from: action.after, to: id },
        ...outgoing.map((l) => ({ from: id, to: l.to })),
      ]
      const b: Building = { id, type: action.type, option: action.option, addons: [] }
      return {
        ok: true,
        city: { ...city, buildings: [...city.buildings, b], links, coins: city.coins - cost, wildcardUsed: city.wildcardUsed || wildcard },
      }
    }
    case 'addon': {
      const b = city.buildings.find((x) => x.id === action.building)
      if (!b) return fail(`no building called ${action.building}`)
      const spec = CATALOG[b.type].addons[action.addon]
      if (!spec || !spec.on.includes(b.type)) return fail(`a ${CATALOG[b.type].name} can't have ${action.addon.replace('_', ' ')}`)
      if (action.addon === 'index' && b.addons.includes('index')) return fail('it already has an index')
      const { cost, usesFreeReplica } = addonCost(city, action.addon, b.type, heroClass)
      if (cost > city.coins) return fail('not enough coins')
      const buildings = city.buildings.map((x) => (x.id === b.id ? { ...x, addons: [...x.addons, action.addon] } : x))
      return { ok: true, city: { ...city, buildings, coins: city.coins - cost, freeReplicaUsed: city.freeReplicaUsed || usesFreeReplica } }
    }
    case 'link': {
      const from = typeOf(city, action.from)
      const to = typeOf(city, action.to)
      if (!from) return fail(`no building called ${action.from}`)
      if (!to || to === 'users') return fail(`no building called ${action.to}`)
      if (!ALLOWED_LINKS[from].includes(to)) {
        if (from === 'users') return fail('users must reach a load balancer, cache or CDN first')
        return fail(`a ${CATALOG[from].name} can't send traffic to a ${CATALOG[to].name}`)
      }
      if (city.links.some((l) => l.from === action.from && l.to === action.to)) return fail('already connected')
      return { ok: true, city: { ...city, links: [...city.links, { from: action.from, to: action.to }] } }
    }
    case 'unlink': {
      if (!city.links.some((l) => l.from === action.from && l.to === action.to)) return fail('those two are not connected')
      return { ok: true, city: { ...city, links: city.links.filter((l) => !(l.from === action.from && l.to === action.to)) } }
    }
    case 'remove': {
      const b = city.buildings.find((x) => x.id === action.building)
      if (!b) return fail(`no building called ${action.building}`)
      const refund =
        buildingCost(b.type, b.option, heroClass) + b.addons.reduce((s, a) => s + CATALOG[b.type].addons[a].cost, 0)
      return {
        ok: true,
        city: {
          ...city,
          buildings: city.buildings.filter((x) => x.id !== b.id),
          links: city.links.filter((l) => l.from !== b.id && l.to !== b.id),
          coins: city.coins + refund,
        },
      }
    }
  }
}
