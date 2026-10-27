import type { Stage, StageId } from './types'

const shorty: Stage = {
  id: 'shorty',
  title: 'Shorty',
  brief:
    'A URL shortener. 1,000 requests per second, and 9 out of 10 are people opening a short link. Keep it up for 30 seconds.',
  budget: 100,
  baseLoad: { rps: 1000, readRatio: 0.9 },
  unlocked: ['lb', 'api', 'sql', 'nosql'],
  wildcard: 'cache',
  chaos: [{ id: 'celebrity', title: 'Celebrity tweet', at: 15, kind: 'hot_key', extraRps: 4000 }],
  rivalName: 'Rusty',
  rivalClass: 'data_keeper',
  rivalBlindSpot:
    'You believe the database is always the bottleneck. Spend most of your coins on database nodes and keep the API servers small.',
  rivalScripted: [
    { kind: 'place', type: 'lb', option: 'round_robin' },
    { kind: 'place', type: 'api', option: 'small' },
    { kind: 'place', type: 'api', option: 'small' },
    { kind: 'place', type: 'nosql', option: 'standard' },
    { kind: 'addon', building: 'nosql1', addon: 'nosql_node' },
    { kind: 'link', from: 'users', to: 'lb1' },
    { kind: 'link', from: 'lb1', to: 'api1' },
    { kind: 'link', from: 'lb1', to: 'api2' },
    { kind: 'link', from: 'api1', to: 'nosql1' },
    { kind: 'link', from: 'api2', to: 'nosql1' },
  ],
  rivalMaxServed: 0.6,
  textbookDefaults: { cache: 'behind the API servers, next to the database' },
}

export const STAGES: Record<string, Stage> & { shorty: Stage } = { shorty }
export const STAGE_ORDER: StageId[] = ['shorty']
