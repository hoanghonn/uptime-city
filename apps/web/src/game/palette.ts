import { applyAction, CATALOG, CLASSES, STAGES, type Action, type BuildingType, type City, type HeroClass } from '@uptime/core'
import type { Phase } from './flow'

export type PaletteItem = { label: string; cost: number; pro: string; con: string; action: Action | null; disabled: boolean; reason?: string }
export type PaletteGroup = { title: string; type: BuildingType; items: PaletteItem[] }

/** One plus and one minus for every choice: the trade-off is the lesson. */
const TRADEOFFS: Record<string, [string, string]> = {
  'lb.round_robin': ['Cheapest balancer: takes turns between servers.', 'Keeps sending traffic to a server that has died.'],
  'lb.least_conn': ['Sends work to the least busy server and skips dead ones.', 'Costs 5 more coins than round robin.'],
  'lb.rate_limit': ['Turns away floods of bot traffic at the door.', 'Costs twice as much as round robin, and does nothing for real users.'],
  'api.small': ['Cheap, and many small servers survive one dying.', 'Only 300 requests a second each.'],
  'api.large': ['900 requests a second: more power per coin.', 'Expensive, and losing one hurts a lot.'],
  'sql.standard': ['Never loses or corrupts data; 1,500 reads a second.', 'Slow writes: only 500 a second.'],
  'nosql.standard': ['Very fast writes: 3,000 a second, and grows by adding nodes.', 'One very popular key is stuck on a single node.'],
  'queue.standard': ['Accepts every write right away, even during a spike.', 'The work finishes later, and needs workers to drain it.'],
  'worker.standard': ['Moves 400 messages a second from the queue into the database.', 'Does nothing without a queue in front of it.'],
  'cdn.standard': ['Serves 80% of photos and videos at the edge, before they reach you.', 'Does nothing for writes or for answers unique to each user.'],
  'storage.standard': ['Holds photos and files cheaply, and never runs out.', 'Only for big files; it cannot answer normal reads.'],
  'addon.index': ['Reads twice as fast.', 'Only helps reads, not writes.'],
  'addon.read_replica': ['+1,500 reads a second, and a spare copy if one fails.', 'Does not help writes at all.'],
  'addon.nosql_node': ['+1,500 reads a second.', 'Cannot help with one very popular key.'],
  'cache.front': ['Stops repeated reads before they reach your servers.', 'Starts cold, and answers can be a little out of date.'],
  'cache.behind': ['Stops repeated reads before they reach your database.', 'Your servers still have to handle every request.'],
}

/** Everything the player can build right now, for the clickable list beside the city. */
export function paletteItems(stageId: string, city: City, heroClass: HeroClass, phase: Phase): PaletteGroup[] {
  const stage = STAGES[stageId]
  const ctx = { stage, heroClass }
  const live = phase === 'build' || phase === 'firefight'

  const item = (label: string, key: string, action: Action | null, baseCost: number, missing?: string): PaletteItem => {
    const [pro, con] = TRADEOFFS[key] ?? ['', '']
    if (!live) return { label, cost: baseCost, pro, con, action, disabled: true, reason: 'only while building' }
    if (!action) return { label, cost: baseCost, pro, con, action, disabled: true, reason: missing }
    const r = applyAction(city, action, ctx)
    if (!r.ok) return { label, cost: baseCost, pro, con, action, disabled: true, reason: r.reason }
    return { label, cost: city.coins - r.city.coins, pro, con, action, disabled: false }
  }
  const costOf = (type: BuildingType, option: string) => CATALOG[type].options[option].cost + (CLASSES[heroClass].costDelta[type] ?? 0)

  const groups: PaletteGroup[] = []
  const types = stage.unlocked.filter((t) => t !== 'cache')
  for (const type of types) {
    const entry = CATALOG[type]
    const items = Object.entries(entry.options).map(([option, o]) =>
      item(o.label, `${type}.${option}`, { kind: 'place', type, option }, costOf(type, option)),
    )
    const first = city.buildings.find((b) => b.type === type)
    for (const [addon, a] of Object.entries(entry.addons)) {
      if (!a.on.includes(type)) continue
      items.push(item(a.label, `addon.${addon}`, first ? { kind: 'addon', building: first.id, addon } : null, a.cost, `build a ${entry.name} first`))
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
        item('In front of the servers', 'cache.front', front, base),
        item('Behind the servers', 'cache.behind', behind, base, 'build an API server first'),
      ],
    })
  }
  return groups
}
