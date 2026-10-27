import { applyAction } from './actions'
import { CACHE_HIT, CATALOG } from './catalog'
import { CLASSES, capacityMultiplier } from './classes'
import type { Action, Building, BuildingType, City, HeroClass, Stage } from './types'

export const TICKS_PER_SECOND = 10
export const TEST_SECONDS = 30
const DROP_LATENCY_MS = 3000
const BASE_MS: Partial<Record<BuildingType, number>> = { lb: 1, cache: 1, api: 10, sql: 8, nosql: 5, queue: 2, worker: 15, cdn: 2, storage: 120 }

export type Tick = { t: number; offered: number; served: number; dropped: number; load: Record<string, number> }
export type SimResult = {
  ticks: Tick[]
  servedPct: number
  p95Ms: number
  coinsLeft: number
  worstMoment: { second: number; building: string }
  lesson: string
}
export type SimOptions = { firefight?: { atSecond: number; action: Action } }

/** Traffic in requests per second: normal reads, reads of the one hot key, writes; lat = mean ms so far. */
type Flow = { n: number; h: number; w: number; lat: number }
const total = (f: Flow) => f.n + f.h + f.w
const scale = (f: Flow, k: number): Flow => ({ n: f.n * k, h: f.h * k, w: f.w * k, lat: f.lat })
function merge(a: Flow | undefined, b: Flow): Flow {
  if (!a) return b
  const ta = total(a), tb = total(b)
  const lat = ta + tb > 0 ? (a.lat * ta + b.lat * tb) / (ta + tb) : 0
  return { n: a.n + b.n, h: a.h + b.h, w: a.w + b.w, lat }
}

function nodeLatency(type: BuildingType, load: number): number {
  return (BASE_MS[type] ?? 1) / (1 - Math.min(load, 0.95))
}

function offeredAt(stage: Stage, t: number): Flow {
  let rps = stage.baseLoad.rps
  let hot = 0
  let extraWrites = 0
  for (const c of stage.chaos) {
    if (t < c.at) continue
    if (c.kind === 'surge') rps *= c.multiplier
    if (c.kind === 'hot_key') hot += c.extraRps
    if (c.kind === 'write_spike') extraWrites += c.extraWrites
  }
  return { n: rps * stage.baseLoad.readRatio, h: hot, w: rps * (1 - stage.baseLoad.readRatio) + extraWrites, lat: 0 }
}

function topoOrder(city: City): string[] {
  const ids = ['users', ...city.buildings.map((b) => b.id)]
  const indeg = new Map(ids.map((id) => [id, 0]))
  for (const l of city.links) if (indeg.has(l.to)) indeg.set(l.to, indeg.get(l.to)! + 1)
  const queue = ids.filter((id) => indeg.get(id) === 0)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const l of city.links.filter((x) => x.from === id)) {
      indeg.set(l.to, indeg.get(l.to)! - 1)
      if (indeg.get(l.to) === 0) queue.push(l.to)
    }
  }
  return order // nodes caught in a loop never get processed, so their traffic is dropped
}

type TickState = { served: number; dropped: number; load: Record<string, number>; samples: [number, number][] }

function step(city: City, heroClass: HeroClass, offered: Flow, t: number, builtAt: Map<string, number>, down: Set<string>): TickState {
  const byId = new Map(city.buildings.map((b) => [b.id, b]))
  const incoming = new Map<string, Flow>([['users', offered]])
  const st: TickState = { served: 0, dropped: 0, load: {}, samples: [] }
  const drop = (count: number) => {
    if (count <= 1e-9) return
    st.dropped += count
    st.samples.push([DROP_LATENCY_MS, count])
  }
  const serve = (count: number, lat: number) => {
    if (count <= 1e-9) return
    st.served += count
    st.samples.push([lat, count])
  }
  const forward = (from: string, flow: Flow, weights?: (b: Building) => number) => {
    const outs = city.links.filter((l) => l.from === from && byId.has(l.to))
    if (outs.length === 0 || total(flow) <= 0) return drop(total(flow))
    const w = outs.map((l) => (weights ? weights(byId.get(l.to)!) : 1))
    const sum = w.reduce((a, b) => a + b, 0) || 1
    outs.forEach((l, i) => incoming.set(l.to, merge(incoming.get(l.to), scale(flow, w[i] / sum))))
  }

  for (const id of topoOrder(city)) {
    const flow = incoming.get(id)
    if (!flow) continue
    if (id === 'users') { forward(id, flow); continue }
    const b = byId.get(id)!
    if (down.has(id)) { st.load[id] = 0; drop(total(flow)); continue }
    const mult = capacityMultiplier(heroClass, b.type)
    const opt = CATALOG[b.type].options[b.option]
    const t0 = total(flow)

    switch (b.type) {
      case 'lb':
      case 'api':
      case 'cdn': {
        const cap = (opt.rps ?? Infinity) * mult
        const load = t0 / cap
        st.load[id] = load
        const kept = Math.min(1, cap / t0)
        drop(t0 * (1 - kept))
        const out = { ...scale(flow, kept), lat: flow.lat + nodeLatency(b.type, load) }
        const leastConn = b.type === 'lb' && b.option === 'least_conn'
        forward(id, out, leastConn ? (x) => (CATALOG[x.type].options[x.option].rps ?? 1) * capacityMultiplier(heroClass, x.type) : undefined)
        break
      }
      case 'cache': {
        const cap = (opt.rps ?? Infinity) * mult
        st.load[id] = t0 / cap
        const warm = Math.max(0, Math.min(1, (t - (builtAt.get(id) ?? -Infinity)) / CACHE_HIT.warmupSeconds))
        const hr = CLASSES[heroClass].hitRate
        const hn = Math.min(1, CACHE_HIT.normal * hr) * warm
        const hh = Math.min(1, CACHE_HIT.hotKey * hr) * warm
        const lat = flow.lat + nodeLatency('cache', st.load[id])
        serve(flow.n * hn + flow.h * hh, lat)
        forward(id, { n: flow.n * (1 - hn), h: flow.h * (1 - hh), w: flow.w, lat })
        break
      }
      case 'sql': {
        const replicas = b.addons.filter((a) => a === 'read_replica').length
        const index = b.addons.includes('index') ? 2 : 1
        const readCap = (opt.reads ?? 0) * (1 + replicas) * index * mult
        const writeCap = (opt.writes ?? 0) * mult
        const reads = flow.n + flow.h
        const load = Math.max(reads / readCap, flow.w / writeCap)
        st.load[id] = load
        const lat = flow.lat + nodeLatency('sql', load)
        const ok = Math.min(reads, readCap) + Math.min(flow.w, writeCap)
        serve(ok, lat)
        drop(t0 - ok)
        break
      }
      case 'nosql': {
        const nodes = (opt.nodes ?? 1) + b.addons.filter((a) => a === 'nosql_node').length
        const index = b.addons.includes('index') ? 2 : 1
        const perNode = (opt.nodeReads ?? 0) * index * mult
        const writeCap = (opt.writes ?? 0) * mult
        const hotOk = Math.min(flow.h, perNode)
        const normalOk = Math.min(flow.n, nodes * perNode - hotOk)
        const load = Math.max(flow.h / perNode, (flow.n + flow.h) / (nodes * perNode), flow.w / writeCap)
        st.load[id] = load
        const lat = flow.lat + nodeLatency('nosql', load)
        const ok = hotOk + normalOk + Math.min(flow.w, writeCap)
        serve(ok, lat)
        drop(t0 - ok)
        break
      }
      default:
        // queue, worker and storage arrive with stage 2 and 3; until then they pass traffic on untouched
        st.load[id] = 0
        forward(id, flow)
    }
  }
  return st
}

const LESSONS: Partial<Record<BuildingType, string>> = {
  api: 'The bottleneck was the API servers, not the database. A cache in front of them, or more servers, would have kept traffic flowing.',
  sql: 'The database was the bottleneck. Read replicas, an index, or a cache in front of it would have taken the pressure off.',
  nosql: 'The database was the bottleneck. With one very popular key, extra nodes do not help; a cache in front does.',
  lb: 'Even the load balancer gave up. That much traffic needs to be stopped earlier.',
  cache: 'The cache itself was overwhelmed.',
}

export function simulate(start: City, stage: Stage, heroClass: HeroClass, opts: SimOptions = {}): SimResult {
  let city = start
  const builtAt = new Map<string, number>()
  let firefightDone = false
  const kills = stage.chaos.filter((c) => c.kind === 'kill')
  const recoveries = CLASSES[heroClass].autoRecoveries
  const ticks: Tick[] = []
  const samples: [number, number][] = []

  for (let i = 0; i < TEST_SECONDS * TICKS_PER_SECOND; i++) {
    const t = i / TICKS_PER_SECOND
    if (opts.firefight && !firefightDone && t >= opts.firefight.atSecond) {
      firefightDone = true
      const before = new Set(city.buildings.map((b) => b.id))
      const r = applyAction(city, opts.firefight.action, { stage, heroClass })
      if (r.ok) {
        city = r.city
        for (const b of city.buildings) if (!before.has(b.id)) builtAt.set(b.id, opts.firefight.atSecond)
      }
    }
    const down = new Set<string>()
    for (const k of kills) {
      if (k.kind !== 'kill' || t < k.at) continue
      if (recoveries > 0 && t >= k.at + 2) continue // firefighter: automatic recovery after 2 seconds
      const victim = city.buildings.find((b) => b.type === k.target)
      if (victim) down.add(victim.id)
    }
    const offered = offeredAt(stage, t)
    const st = step(city, heroClass, offered, t, builtAt, down)
    ticks.push({ t, offered: total(offered), served: st.served, dropped: st.dropped, load: st.load })
    for (const s of st.samples) samples.push(s)
  }

  const offeredSum = ticks.reduce((s, x) => s + x.offered, 0)
  const servedSum = ticks.reduce((s, x) => s + x.served, 0)
  const worst = ticks.reduce((a, b) => (b.dropped > a.dropped ? b : a), ticks[0])
  const worstBuilding = worst.dropped > 0 ? Object.entries(worst.load).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '' : ''
  const worstType = city.buildings.find((b) => b.id === worstBuilding)?.type
  return {
    ticks,
    servedPct: offeredSum > 0 ? servedSum / offeredSum : 0,
    p95Ms: percentile(samples, 0.95),
    coinsLeft: city.coins,
    worstMoment: { second: worst.dropped > 0 ? worst.t : 0, building: worstBuilding },
    lesson: worstType
      ? LESSONS[worstType] ?? 'Something gave way under pressure.'
      : worst.dropped > 0
        ? 'Traffic never reached your city. Connect the users to a load balancer, and the API servers to a database.'
        : 'Your city held everything. Nicely done.',
  }
}

function percentile(samples: [number, number][], p: number): number {
  const sorted = [...samples].sort((a, b) => a[0] - b[0])
  const sum = sorted.reduce((s, x) => s + x[1], 0)
  let acc = 0
  for (const [lat, count] of sorted) {
    acc += count
    if (acc >= sum * p) return Math.round(lat)
  }
  return 0
}

/** 1 if a is better, -1 if b is better: served %, then lower p95, then more coins left. */
export function compare(a: SimResult, b: SimResult): -1 | 0 | 1 {
  const eps = 1e-9
  if (Math.abs(a.servedPct - b.servedPct) > eps) return a.servedPct > b.servedPct ? 1 : -1
  if (a.p95Ms !== b.p95Ms) return a.p95Ms < b.p95Ms ? 1 : -1
  if (a.coinsLeft !== b.coinsLeft) return a.coinsLeft > b.coinsLeft ? 1 : -1
  return 0
}
