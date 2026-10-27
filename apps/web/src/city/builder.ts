import type { XZ } from './layout'

export const BUILD_SECONDS = 0.5
const SPEED = 10 // world units a second
const STAND_OFF: XZ = [-1.0, 1.0] // the builder stands at the front-left corner of the site

/** The little builder hero: walks to each new building's site, builds it, moves on. Mutable for useFrame. */
export type Crew = {
  pos: XZ
  queue: string[]
  /** when each building's construction started; -Infinity for buildings that were already standing */
  started: Map<string, number>
  mode: 'idle' | 'walking' | 'building'
  heading: number
}

export function createCrew(at: XZ, standing: string[] = []): Crew {
  return { pos: [...at] as XZ, queue: [], started: new Map(standing.map((id) => [id, -Infinity])), mode: 'idle', heading: 0 }
}

/** Keeps the queue in step with the city: new buildings join the end, demolished ones leave. */
export function syncCrew(crew: Crew, ids: string[]): void {
  const live = new Set(ids)
  crew.queue = crew.queue.filter((id) => live.has(id))
  for (const id of [...crew.started.keys()]) if (!live.has(id)) crew.started.delete(id)
  for (const id of ids) if (!crew.started.has(id) && !crew.queue.includes(id)) crew.queue.push(id)
}

export function crewStep(crew: Crew, positions: Record<string, XZ>, now: number, dt: number): void {
  const job = crew.queue[0]
  if (!job) { crew.mode = 'idle'; return }
  const site = positions[job]
  if (!site) { crew.queue.shift(); return }
  const start = crew.started.get(job)
  if (start !== undefined) {
    crew.mode = 'building'
    if (now - start >= BUILD_SECONDS) crew.queue.shift()
    return
  }
  const target: XZ = [site[0] + STAND_OFF[0], site[1] + STAND_OFF[1]]
  const dx = target[0] - crew.pos[0]
  const dz = target[1] - crew.pos[1]
  const dist = Math.hypot(dx, dz)
  const stride = SPEED * dt
  if (dist <= stride) {
    crew.pos = target
    crew.started.set(job, now)
    crew.mode = 'building'
    return
  }
  crew.mode = 'walking'
  crew.heading = Math.atan2(dx, dz)
  crew.pos = [crew.pos[0] + (dx / dist) * stride, crew.pos[1] + (dz / dist) * stride]
}
