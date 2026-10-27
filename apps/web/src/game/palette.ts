import { applyAction, CATALOG, CLASSES, STAGES, type Action, type BuildingType, type City, type HeroClass } from '@uptime/core'
import type { Phase } from './flow'

export type PaletteItem = { label: string; cost: number; note: string; action: Action | null; disabled: boolean; reason?: string }
export type PaletteGroup = { title: string; type: BuildingType; items: PaletteItem[] }

const NOTES: Record<string, string> = {
  'lb.round_robin': 'Takes turns sending requests to each server.',
  'lb.least_conn': 'Sends each request to the least busy server, and skips dead ones.',
  'lb.rate_limit': 'Turns away floods of bot traffic at the door.',
  'api.small': 'Runs your app: 300 requests a second.',
  'api.large': 'Runs your app: 900 requests a second.',
  'sql.standard': '1,500 reads and 500 writes a second. Never loses data.',
  'nosql.standard': '3,000 reads a second over 2 nodes, fast writes. One very popular key stays on one node.',
  'queue.standard': 'Holds messages safely until the workers catch up.',
  'worker.standard': 'Moves 400 messages a second from the queue into the database.',
  'cdn.standard': 'Serves photos from the edge, close to the users.',
  'storage.standard': 'Holds photos and big files, and never runs out.',
  'addon.index': 'Reads twice as fast.',
  'addon.read_replica': 'A copy for reading: +1,500 reads a second.',
  'addon.nosql_node': 'One more node: +1,500 reads a second.',
  'cache.front': 'Answers repeated reads before they reach your servers.',
  'cache.behind': 'Answers repeated reads before they reach your database.',
}

/** Everything the player can build right now, for the clickable list beside the city. */
export function paletteItems(stageId: string, city: City, heroClass: HeroClass, phase: Phase): PaletteGroup[] {
  const stage = STAGES[stageId]
  const ctx = { stage, heroClass }
  const live = phase === 'build' || phase === 'firefight'

  const item = (label: string, note: string, action: Action | null, baseCost: number, missing?: string): PaletteItem => {
    if (!live) return { label, cost: baseCost, note, action, disabled: true, reason: 'only while building' }
    if (!action) return { label, cost: baseCost, note, action, disabled: true, reason: missing }
    const r = applyAction(city, action, ctx)
    if (!r.ok) return { label, cost: baseCost, note, action, disabled: true, reason: r.reason }
    return { label, cost: city.coins - r.city.coins, note, action, disabled: false }
  }
  const costOf = (type: BuildingType, option: string) => CATALOG[type].options[option].cost + (CLASSES[heroClass].costDelta[type] ?? 0)

  const groups: PaletteGroup[] = []
  const types = stage.unlocked.filter((t) => t !== 'cache')
  for (const type of types) {
    const entry = CATALOG[type]
    const items = Object.entries(entry.options).map(([option, o]) =>
      item(o.label, NOTES[`${type}.${option}`] ?? '', { kind: 'place', type, option }, costOf(type, option)),
    )
    const first = city.buildings.find((b) => b.type === type)
    for (const [addon, a] of Object.entries(entry.addons)) {
      if (!a.on.includes(type)) continue
      items.push(item(a.label, NOTES[`addon.${addon}`] ?? '', first ? { kind: 'addon', building: first.id, addon } : null, a.cost, `build a ${entry.name} first`))
    }
    groups.push({ title: entry.name, type, items })
  }

  // The cache is placed in front of or behind the servers, so it gets two entries.
  const wildcard = stage.wildcard === 'cache'
  if (wildcard || stage.unlocked.includes('cache')) {
    const free = wildcard && !city.wildcardUsed
    const flag = wildcard ? { wildcard: true } : {}
    const lb = city.buildings.find((b) => b.type === 'lb')?.id
    const api = city.buildings.find((b) => b.type === 'api')?.id
    const base = free ? 0 : costOf('cache', 'standard')
    const front: Action = { kind: 'insert', type: 'cache', option: 'standard', after: lb ?? 'users', ...flag }
    const behind: Action | null = api ? { kind: 'insert', type: 'cache', option: 'standard', after: api, ...flag } : null
    groups.push({
      title: wildcard ? 'Cache (free wildcard)' : 'Cache',
      type: 'cache',
      items: [
        item('In front of the servers', NOTES['cache.front'], front, base),
        item('Behind the servers', NOTES['cache.behind'], behind, base, 'build an API server first'),
      ],
    })
  }
  return groups
}
