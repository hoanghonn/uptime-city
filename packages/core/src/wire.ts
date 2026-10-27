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

  // A queue nobody feeds takes the writes from every API server; workers drain it.
  const typeOf = (id: string) => city.buildings.find((b) => b.id === id)?.type
  const queues = of(['queue'])
  if (queues.length === 1) {
    const q = queues[0].id
    if (!links.some((l) => l.to === q)) for (const api of of(['api'])) add(api.id, q)
    for (const w of of(['worker'])) if (!links.some((l) => l.to === w.id)) add(q, w.id)
  }

  // API servers with nowhere to send reads (nothing, or only a queue), and workers, get the only database.
  const dbs = of(DATA)
  if (dbs.length === 1) {
    for (const w of of(['worker'])) if (!links.some((l) => l.from === w.id)) add(w.id, dbs[0].id)
    for (const api of of(['api'])) {
      if (!links.some((l) => l.from === api.id && typeOf(l.to) !== 'queue')) add(api.id, dbs[0].id)
    }
  }
  return { ...city, links }
}
