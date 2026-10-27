import type { BuildingType, City, Link } from './types'

const ENTRY: BuildingType[] = ['lb', 'cdn', 'cache']
const DATA: BuildingType[] = ['sql', 'nosql']

/**
 * Adds the obvious connections the player didn't spell out: users -> load balancer -> API servers -> the only
 * database. Only adds links; never removes or duplicates the player's. Ambiguous cases are left alone.
 */
export function autoWire(city: City): City {
  const links: Link[] = [...city.links]
  const has = (from: string, to: string) => links.some((l) => l.from === from && l.to === to)
  const add = (from: string, to: string) => { if (!has(from, to)) links.push({ from, to }) }
  const of = (types: BuildingType[]) => city.buildings.filter((b) => types.includes(b.type))

  if (!links.some((l) => l.from === 'users')) {
    const entry = ENTRY.map((t) => of([t])[0]).find(Boolean)
    if (entry) add('users', entry.id)
  }

  // The front of the city: follow single links from the first load balancer through any caches.
  const lb = of(['lb'])[0]
  let front = lb?.id
  while (front) {
    const outs = links.filter((l) => l.from === front)
    const next = outs.length === 1 ? city.buildings.find((b) => b.id === outs[0].to) : undefined
    if (next?.type === 'cache') front = next.id
    else break
  }
  for (const api of of(['api'])) {
    if (front && !links.some((l) => l.to === api.id)) add(front, api.id)
  }

  const dbs = of(DATA)
  if (dbs.length === 1) {
    for (const api of of(['api'])) if (!links.some((l) => l.from === api.id)) add(api.id, dbs[0].id)
  }
  return { ...city, links }
}
