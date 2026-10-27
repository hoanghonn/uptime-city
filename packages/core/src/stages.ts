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
  rivalTaunt: 'Databases are all you need, kid.',
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

const chatter: Stage = {
  id: 'chatter',
  title: 'Chatter',
  brief:
    'A chat app. 1,200 requests per second and half of them are new messages, which must never be lost. Keep it up for 30 seconds.',
  budget: 130,
  baseLoad: { rps: 1200, readRatio: 0.5 },
  unlocked: ['lb', 'api', 'sql', 'nosql', 'queue', 'worker'],
  chaos: [{ id: 'api_dies', title: 'A server just died', at: 12, kind: 'kill', target: 'api' }],
  rivalName: 'Sync',
  rivalTaunt: 'Queues are for people who cannot write fast enough.',
  rivalClass: 'edge_runner',
  rivalBlindSpot:
    'You think queues are pointless: every message goes straight into the database. Use a round robin load balancer, exactly three small API servers, and a SQL database with replicas. Never build a queue.',
  rivalScripted: [
    { kind: 'place', type: 'lb', option: 'round_robin' },
    { kind: 'place', type: 'api', option: 'small' },
    { kind: 'place', type: 'api', option: 'small' },
    { kind: 'place', type: 'api', option: 'small' },
    { kind: 'place', type: 'sql', option: 'standard' },
    { kind: 'addon', building: 'sql1', addon: 'read_replica' },
  ],
  rivalMaxServed: 0.75,
  textbookDefaults: {},
}

export const STAGES: Record<string, Stage> & { shorty: Stage; chatter: Stage } = { shorty, chatter }
export const STAGE_ORDER: StageId[] = ['shorty', 'chatter']
