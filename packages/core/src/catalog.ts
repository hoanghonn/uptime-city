import type { BuildingType } from './types'

export type OptionStats = {
  cost: number
  label: string
  /** requests per second the building can pass on (api, lb, cache, cdn) */
  rps?: number
  /** database read and write capacity per second */
  reads?: number
  writes?: number
  /** nosql: nodes and per-node read capacity */
  nodes?: number
  nodeReads?: number
  /** queue: messages it can hold */
  capacity?: number
}

export type AddonStats = { cost: number; label: string; on: BuildingType[] }

export type CatalogEntry = {
  name: string
  options: Record<string, OptionStats>
  addons: Record<string, AddonStats>
}

export const CACHE_HIT = { hotKey: 0.99, normal: 0.6, warmupSeconds: 1 }
/** A CDN serves this share of photo requests at the edge. */
export const CDN_HIT = 0.8
/** A photo read from a database costs as much as this many normal reads. */
export const MEDIA_DB_COST = 5
/** A rate-limiting load balancer lets this share of bot traffic through. */
export const BOT_LEAK = 0.05

export const CATALOG: Record<BuildingType, CatalogEntry> = {
  lb: {
    name: 'Load balancer',
    options: {
      round_robin: { cost: 10, label: 'Round robin', rps: 20000 },
      least_conn: { cost: 15, label: 'Least connections', rps: 20000 },
      rate_limit: { cost: 20, label: 'Rate limiting', rps: 20000 },
    },
    addons: {},
  },
  api: {
    name: 'API server',
    options: {
      small: { cost: 10, label: 'Small', rps: 300 },
      large: { cost: 25, label: 'Large', rps: 900 },
    },
    addons: {},
  },
  cache: {
    name: 'Cache',
    options: { standard: { cost: 15, label: 'Cache', rps: 20000 } },
    addons: {},
  },
  sql: {
    name: 'SQL database',
    options: { standard: { cost: 20, label: 'SQL', reads: 1500, writes: 500 } },
    addons: {
      read_replica: { cost: 15, label: 'Read replica', on: ['sql'] },
      index: { cost: 5, label: 'Index', on: ['sql', 'nosql'] },
    },
  },
  nosql: {
    name: 'NoSQL database',
    options: { standard: { cost: 20, label: 'NoSQL', nodes: 2, nodeReads: 1500, writes: 3000 } },
    addons: {
      nosql_node: { cost: 15, label: 'Extra node', on: ['nosql'] },
      index: { cost: 5, label: 'Index', on: ['sql', 'nosql'] },
    },
  },
  queue: {
    name: 'Queue',
    options: { standard: { cost: 15, label: 'Queue', capacity: 20000 } },
    addons: {},
  },
  worker: {
    name: 'Worker',
    options: { standard: { cost: 10, label: 'Worker', rps: 400 } },
    addons: {},
  },
  cdn: {
    name: 'CDN',
    options: { standard: { cost: 20, label: 'CDN', rps: 20000 } },
    addons: {},
  },
  storage: {
    name: 'Object storage',
    options: { standard: { cost: 10, label: 'Object storage' } },
    addons: {},
  },
}

/** Which building types each type may send traffic to. */
export const ALLOWED_LINKS: Record<BuildingType | 'users', BuildingType[]> = {
  users: ['lb', 'cache', 'cdn'],
  lb: ['api', 'cache'],
  cache: ['api', 'lb', 'sql', 'nosql'],
  api: ['sql', 'nosql', 'cache', 'queue', 'storage'],
  queue: ['worker'],
  worker: ['sql', 'nosql'],
  cdn: ['lb', 'storage'],
  sql: [],
  nosql: [],
  storage: [],
}
