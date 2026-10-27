import type { BuildingType, HeroClass } from './types'

export type ClassInfo = {
  name: string
  perk: string
  weakness: string
  budgetDelta: number
  /** extra coins on every building of these types */
  costDelta: Partial<Record<BuildingType, number>>
  /** capacity multiplier per building type, '*' for all */
  capacity: Partial<Record<BuildingType | '*', number>>
  /** cache and CDN hit-rate multiplier */
  hitRate: number
  freeFirstReplica: boolean
  autoRecoveries: number
}

const DB_TYPES: BuildingType[] = ['sql', 'nosql']

export const CLASSES: Record<HeroClass, ClassInfo> = {
  data_keeper: {
    name: 'Data Keeper',
    perk: 'Databases are 25% stronger and the first replica is free.',
    weakness: 'Caches hit 25% less often.',
    budgetDelta: 0,
    costDelta: {},
    capacity: { sql: 1.25, nosql: 1.25 },
    hitRate: 0.75,
    freeFirstReplica: true,
    autoRecoveries: 0,
  },
  edge_runner: {
    name: 'Edge Runner',
    perk: 'Caches and CDNs are 25% stronger.',
    weakness: 'Databases cost 5 more coins.',
    budgetDelta: 0,
    costDelta: Object.fromEntries(DB_TYPES.map((t) => [t, 5])),
    capacity: { cache: 1.25, cdn: 1.25 },
    hitRate: 1.25,
    freeFirstReplica: false,
    autoRecoveries: 0,
  },
  firefighter: {
    name: 'Firefighter',
    perk: 'One free automatic recovery when a building dies.',
    weakness: 'Starts with 10 fewer coins.',
    budgetDelta: -10,
    costDelta: {},
    capacity: {},
    hitRate: 1,
    freeFirstReplica: false,
    autoRecoveries: 1,
  },
  generalist: {
    name: 'Generalist',
    perk: 'Everything is 10% stronger.',
    weakness: 'No perk above 10%.',
    budgetDelta: 0,
    costDelta: {},
    capacity: { '*': 1.1 },
    hitRate: 1,
    freeFirstReplica: false,
    autoRecoveries: 0,
  },
}

export function capacityMultiplier(heroClass: HeroClass, type: BuildingType): number {
  const c = CLASSES[heroClass].capacity
  return c[type] ?? c['*'] ?? 1
}
