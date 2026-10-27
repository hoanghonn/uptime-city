import type { BuildingType, City } from '@uptime/core'

export const CELL = 2.6
export type XZ = [number, number]
export type Road = { from: string; to: string; points: [XZ, XZ] }

const COLUMN: Record<BuildingType | 'users', number> = {
  users: 0, lb: 1, cdn: 1, cache: 2, api: 3, queue: 4, worker: 5, sql: 6, nosql: 6, storage: 6,
}

/** Deterministic columns by role (users -> edge -> compute -> data), rows by order of placement. */
export function layoutCity(city: City): { positions: Record<string, XZ>; roads: Road[] } {
  const incomingFrom = (id: string) => city.links.filter((l) => l.to === id).map((l) => l.from)
  const typeOf = (id: string) => city.buildings.find((b) => b.id === id)?.type
  const column = (id: string): number => {
    const type = typeOf(id)
    if (!type) return COLUMN.users
    // A cache fed by API servers sits behind them, next to the data.
    if (type === 'cache' && incomingFrom(id).some((f) => typeOf(f) === 'api')) return 5
    return COLUMN[type]
  }
  const ids = ['users', ...city.buildings.map((b) => b.id)]
  const byColumn = new Map<number, string[]>()
  for (const id of ids) byColumn.set(column(id), [...(byColumn.get(column(id)) ?? []), id])

  const positions: Record<string, XZ> = {}
  for (const [col, members] of byColumn) {
    members.forEach((id, row) => {
      positions[id] = [(col - 3) * CELL, (row - (members.length - 1) / 2) * CELL * 1.25]
    })
  }
  const roads = city.links
    .filter((l) => positions[l.from] && positions[l.to])
    .map((l) => ({ from: l.from, to: l.to, points: [positions[l.from], positions[l.to]] as [XZ, XZ] }))
  return { positions, roads }
}

/** Every path from the users to a building with nothing after it (at most 16), for the orbs to travel. */
export function routesFor(city: City, limit = 16): string[][] {
  const out: string[][] = []
  const walk = (path: string[]) => {
    if (out.length >= limit) return
    const here = path[path.length - 1]
    const next = city.links.filter((l) => l.from === here && !path.includes(l.to)).map((l) => l.to)
    if (next.length === 0) {
      if (path.length > 1) out.push(path)
      return
    }
    for (const n of next) walk([...path, n])
  }
  walk(['users'])
  return out
}
