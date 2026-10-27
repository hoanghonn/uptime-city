import { applyAction } from './actions'
import { autoWire } from './wire'
import { BOT_LEAK, CACHE_HIT, CATALOG, CDN_HIT, MEDIA_DB_COST } from './catalog'
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
  /** the field guide entry that explains the lesson */
  lessonGuide?: string
}
export type SimOptions = { firefight?: { atSecond: number; action: Action } }

/**
 * Traffic in requests per second: n normal reads, h reads of the one hot key, w writes, m photo reads,
 * j bot requests (they use capacity but never count as offered or served); lat = mean ms so far.
 */
type Flow = { n: number; h: number; w: number; m: number; j: number; lat: number }
const NONE: Flow = { n: 0, h: 0, w: 0, m: 0, j: 0, lat: 0 }
const total = (f: Flow) => f.n + f.h + f.w + f.m + f.j
const real = (f: Flow) => f.n + f.h + f.w + f.m
const scale = (f: Flow, k: number): Flow => ({ n: f.n * k, h: f.h * k, w: f.w * k, m: f.m * k, j: f.j * k, lat: f.lat })
function merge(a: Flow | undefined, b: Flow): Flow {
  if (!a) return b
  const ta = total(a), tb = total(b)
  const lat = ta + tb > 0 ? (a.lat * ta + b.lat * tb) / (ta + tb) : 0
  return { n: a.n + b.n, h: a.h + b.h, w: a.w + b.w, m: a.m + b.m, j: a.j + b.j, lat }
}

function nodeLatency(type: BuildingType, load: number): number {
  return (BASE_MS[type] ?? 1) / (1 - Math.min(load, 0.95))
}

function offeredAt(stage: Stage, t: number): Flow {
  let rps = stage.baseLoad.rps
  let hot = 0
  let extraWrites = 0
  let bots = 0
  for (const c of stage.chaos) {
    if (t < c.at) continue
    if (c.kind === 'surge') rps *= c.multiplier
    if (c.kind === 'hot_key') hot += c.extraRps
    if (c.kind === 'write_spike') extraWrites += c.extraWrites
    if (c.kind === 'bots') bots += c.extraRps
  }
  const reads = rps * stage.baseLoad.readRatio
  const media = reads * (stage.baseLoad.mediaShare ?? 0)
  return { n: reads - media, h: hot, w: rps * (1 - stage.baseLoad.readRatio) + extraWrites, m: media, j: bots, lat: 0 }
}

const paymentsDown = (stage: Stage, t: number) =>
  stage.chaos.some((c) => c.kind === 'payments_down' && t >= c.at && t < c.at + c.duration)

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

type Cause = 'writes' | 'media' | 'reads'
type TickState = { served: number; dropped: number; load: Record<string, number>; samples: [number, number][]; cause: Record<string, Cause> }

const DT = 1 / TICKS_PER_SECOND

function step(
  city: City, heroClass: HeroClass, offered: Flow, t: number, builtAt: Map<string, number>, down: Set<string>, backlog: Map<string, number>,
  noWrites: boolean,
): TickState {
  const byId = new Map(city.buildings.map((b) => [b.id, b]))
  const incoming = new Map<string, Flow>([['users', offered]])
  const st: TickState = { served: 0, dropped: 0, load: {}, samples: [], cause: {} }
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
  const forward = (from: string, flow: Flow, weights?: (b: Building) => number, only?: (b: Building) => boolean) => {
    const outs = city.links.filter((l) => l.from === from && byId.has(l.to) && (!only || only(byId.get(l.to)!)))
    if (outs.length === 0 || total(flow) <= 0) return drop(real(flow))
    const w = outs.map((l) => (weights ? weights(byId.get(l.to)!) : 1))
    const sum = w.reduce((a, b) => a + b, 0) || 1
    outs.forEach((l, i) => incoming.set(l.to, merge(incoming.get(l.to), scale(flow, w[i] / sum))))
  }

  for (const id of topoOrder(city)) {
    const flow = incoming.get(id)
    if (!flow) continue
    if (id === 'users') { forward(id, flow); continue }
    const b = byId.get(id)!
    if (down.has(id)) { st.load[id] = 0; drop(real(flow)); continue }
    const mult = capacityMultiplier(heroClass, b.type)
    const opt = CATALOG[b.type].options[b.option]
    const t0 = total(flow)

    switch (b.type) {
      case 'lb':
      case 'api':
      case 'cdn': {
        let f = flow
        // a rate-limiting load balancer turns most bots away before they cost anything
        if (b.type === 'lb' && b.option === 'rate_limit') f = { ...f, j: f.j * BOT_LEAK }
        if (b.type === 'cdn') {
          const hits = f.m * Math.min(1, CDN_HIT * CLASSES[heroClass].hitRate)
          serve(hits, f.lat + nodeLatency('cdn', 0))
          f = { ...f, m: f.m - hits }
        }
        const t1 = total(f)
        const cap = (opt.rps ?? Infinity) * mult
        const load = t1 / cap
        st.load[id] = load
        const kept = t1 > 0 ? Math.min(1, cap / t1) : 1
        drop(real(f) * (1 - kept))
        const out = { ...scale(f, kept), lat: f.lat + nodeLatency(b.type, load) }
        // least connections health-checks its servers: dead ones get no traffic
        const leastConn = b.type === 'lb' && b.option === 'least_conn'
        const weight = leastConn ? (x: Building) => (down.has(x.id) ? 0 : (CATALOG[x.type].options[x.option].rps ?? 1) * capacityMultiplier(heroClass, x.type)) : undefined
        if (b.type === 'api') {
          // writes go to a queue, photos to object storage, everything else to the data behind
          const has = (type: BuildingType) => city.links.some((l) => l.from === id && byId.get(l.to)?.type === type)
          const toQueue = has('queue')
          const toStorage = has('storage')
          if (toQueue) forward(id, { ...NONE, w: out.w, lat: out.lat }, undefined, (x) => x.type === 'queue')
          if (toStorage) forward(id, { ...NONE, m: out.m, lat: out.lat }, undefined, (x) => x.type === 'storage')
          const rest = { ...out, w: toQueue ? 0 : out.w, m: toStorage ? 0 : out.m }
          if (total(rest) > 0) forward(id, rest, undefined, (x) => x.type !== 'queue' && x.type !== 'storage')
        } else {
          forward(id, out, weight)
        }
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
        serve((flow.n + flow.m) * hn + flow.h * hh, lat)
        forward(id, { n: flow.n * (1 - hn), h: flow.h * (1 - hh), w: flow.w, m: flow.m * (1 - hn), j: flow.j * (1 - hn), lat })
        break
      }
      case 'sql':
      case 'nosql': {
        const index = b.addons.includes('index') ? 2 : 1
        const writeCap = noWrites ? 0 : (opt.writes ?? 0) * mult
        // demand in normal-read units: photos are heavy, bots read like anyone else
        const demand = flow.n + flow.h + flow.j + MEDIA_DB_COST * flow.m
        let readShare: number
        let hotShare: number
        let load: number
        if (b.type === 'sql') {
          const replicas = b.addons.filter((a) => a === 'read_replica').length
          const readCap = (opt.reads ?? 0) * (1 + replicas) * index * mult
          readShare = demand > 0 ? Math.min(1, readCap / demand) : 1
          hotShare = readShare
          load = Math.max(demand / readCap, writeCap > 0 ? flow.w / writeCap : flow.w > 0 ? Infinity : 0)
        } else {
          const nodes = (opt.nodes ?? 1) + b.addons.filter((a) => a === 'nosql_node').length
          const perNode = (opt.nodeReads ?? 0) * index * mult
          const hotOk = Math.min(flow.h, perNode)
          hotShare = flow.h > 0 ? hotOk / flow.h : 1
          const rest = demand - flow.h
          readShare = rest > 0 ? Math.min(1, (nodes * perNode - hotOk) / rest) : 1
          load = Math.max(flow.h / perNode, demand / (nodes * perNode), writeCap > 0 ? flow.w / writeCap : flow.w > 0 ? Infinity : 0)
        }
        st.load[id] = Number.isFinite(load) ? load : 9.99
        // why it is busy: writes past capacity, heavy photo reads, or plain reads
        const writeLoad = writeCap > 0 ? flow.w / writeCap : flow.w > 0 ? Infinity : 0
        st.cause[id] = writeLoad >= 1 && writeLoad >= load - 1e-9 ? 'writes' : MEDIA_DB_COST * flow.m > flow.n + flow.h ? 'media' : 'reads'
        const lat = flow.lat + nodeLatency(b.type, st.load[id])
        const ok = (flow.n + flow.m) * readShare + flow.h * hotShare + Math.min(flow.w, writeCap)
        serve(ok, lat)
        drop(real(flow) - ok)
        break
      }
      case 'storage': {
        st.load[id] = 0
        serve(flow.m, flow.lat + nodeLatency('storage', 0))
        drop(real(flow) - flow.m)
        break
      }
      case 'queue': {
        // Messages are accepted while there is room; workers drain them into the database in the background.
        const cap = (opt.capacity ?? 0) * mult
        let held = backlog.get(id) ?? 0
        const space = Math.max(0, cap - held)
        const accepted = Math.min(flow.w, space / DT)
        serve(accepted, flow.lat + (BASE_MS.queue ?? 2))
        drop(real(flow) - accepted)
        held += accepted * DT
        const workers = city.links
          .filter((l) => l.from === id)
          .map((l) => byId.get(l.to))
          .filter((w): w is Building => !!w && w.type === 'worker' && !down.has(w.id) && city.links.some((x) => x.from === w.id && (byId.get(x.to)?.type === 'sql' || byId.get(x.to)?.type === 'nosql')))
        // while payments are down nothing can be written, so the backlog waits
        const drainCap = noWrites ? 0 : workers.reduce((s, w) => s + (CATALOG.worker.options[w.option].rps ?? 0) * capacityMultiplier(heroClass, 'worker'), 0)
        const drained = Math.min(held, drainCap * DT)
        held -= drained
        backlog.set(id, held)
        st.load[id] = cap > 0 ? held / cap : 1
        for (const w of workers) st.load[w.id] = drainCap > 0 ? drained / DT / drainCap : 0
        break
      }
      case 'worker':
        break // fed by its queue above
    }
  }
  return st
}

const LESSONS: Partial<Record<BuildingType, string>> = {
  api: 'The bottleneck was the API servers, not the database. A cache in front of them, or more servers, keeps the traffic flowing.',
  sql: 'The database was the bottleneck. Read replicas, an index, or a cache in front of it take the pressure off.',
  nosql: 'The database was the bottleneck. With one very popular key, extra nodes do not help; a cache in front does.',
  lb: 'Even the load balancer gave up. That much traffic needs to be stopped earlier.',
  storage: 'Object storage never runs out, but everything else around it did.',
  cdn: 'Even the CDN was overwhelmed.',
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
  const backlog = new Map<string, number>()
  const causes: Record<string, Cause>[] = []

  for (let i = 0; i < TEST_SECONDS * TICKS_PER_SECOND; i++) {
    const t = i / TICKS_PER_SECOND
    if (opts.firefight && !firefightDone && t >= opts.firefight.atSecond) {
      firefightDone = true
      const before = new Set(city.buildings.map((b) => b.id))
      const r = applyAction(city, opts.firefight.action, { stage, heroClass })
      if (r.ok) {
        city = autoWire(r.city)
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
    const st = step(city, heroClass, offered, t, builtAt, down, backlog, paymentsDown(stage, t))
    ticks.push({ t, offered: real(offered), served: st.served, dropped: st.dropped, load: st.load })
    causes.push(st.cause)
    for (const s of st.samples) samples.push(s)
  }

  const offeredSum = ticks.reduce((s, x) => s + x.offered, 0)
  const servedSum = ticks.reduce((s, x) => s + x.served, 0)
  const worst = ticks.reduce((a, b) => (b.dropped > a.dropped ? b : a), ticks[0])
  const worstBuilding = worst.dropped > 0 ? Object.entries(worst.load).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '' : ''
  const worstType = city.buildings.find((b) => b.id === worstBuilding)?.type
  const killAt = kills[0]?.at
  const deadServerHurt = killAt !== undefined && worst.dropped > 0 && worst.t >= killAt
    && city.buildings.some((b) => b.type === 'lb' && b.option === 'round_robin')
  const cause = causes[ticks.indexOf(worst)]?.[worstBuilding]
  const [lesson, lessonGuide] = deadServerHurt
    ? [DEAD_SERVER, 'load-balancing']
    : worstType === 'sql' || worstType === 'nosql'
      ? DB_LESSONS[cause ?? 'reads']
      : worstType
        ? [LESSONS[worstType] ?? 'Something gave way under pressure.', LESSON_GUIDE[worstType]]
        : worst.dropped > 0
          ? ['Traffic never reached your city. Connect the users to a load balancer, and the API servers to a database.', 'approach']
          : ['Your city held everything. Nicely done.', undefined]
  return {
    ticks,
    servedPct: offeredSum > 0 ? servedSum / offeredSum : 0,
    p95Ms: percentile(samples, 0.95),
    coinsLeft: city.coins,
    worstMoment: { second: worst.dropped > 0 ? worst.t : 0, building: worstBuilding },
    lesson,
    ...(lessonGuide ? { lessonGuide } : {}),
  }
}

const DEAD_SERVER = 'When a server died, round robin kept sending it its share of the traffic. A least connections balancer routes around dead servers, and a spare server soaks up the rest.'
const DB_LESSONS: Record<Cause, [string, string]> = {
  writes: ['The database could not keep up with the writes. A queue takes them in safely and lets workers catch up; NoSQL takes writes much faster than SQL.', 'queues'],
  media: ['Big files were going through the database, and each one costs as much as many small reads. Object storage holds them, and a CDN serves them close to the users.', 'storage'],
  reads: ['The database ran out of reads. An index makes each read cheaper, read replicas add more, and a cache in front stops repeats from reaching it at all.', 'indexes'],
}
const LESSON_GUIDE: Partial<Record<BuildingType, string>> = { api: 'caching', lb: 'load-balancing', cache: 'caching', cdn: 'cdn', storage: 'storage' }

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
