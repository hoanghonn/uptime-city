import { ACADEMY } from './academy'
import { CLASSICS } from './classics'
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

const feed: Stage = {
  id: 'feed',
  title: 'Feed',
  brief:
    'A photo feed. 800 requests per second, nearly all of them people scrolling, and most of those are photos. Keep it up for 30 seconds.',
  budget: 140,
  baseLoad: { rps: 800, readRatio: 0.95, mediaShare: 0.7 },
  unlocked: ['lb', 'api', 'cache', 'sql', 'nosql', 'cdn', 'storage'],
  chaos: [{ id: 'continent', title: 'A whole continent woke up', at: 15, kind: 'surge', multiplier: 6 }],
  rivalName: 'Blaze',
  rivalTaunt: 'More servers. The answer is always more servers.',
  rivalClass: 'generalist',
  rivalBlindSpot:
    'You think more servers fix everything. Use a round robin load balancer, four large API servers and a SQL database with an index. Never build a CDN or object storage: photos go in the database.',
  rivalScripted: [
    { kind: 'place', type: 'lb', option: 'round_robin' },
    { kind: 'place', type: 'api', option: 'large' },
    { kind: 'place', type: 'api', option: 'large' },
    { kind: 'place', type: 'api', option: 'large' },
    { kind: 'place', type: 'api', option: 'large' },
    { kind: 'place', type: 'sql', option: 'standard' },
    { kind: 'addon', building: 'sql1', addon: 'index' },
  ],
  rivalMaxServed: 0.7,
  textbookDefaults: { cache: 'behind the API servers, next to the database' },
}

const ticketRush: Stage = {
  id: 'ticket_rush',
  title: 'Ticket Rush',
  brief:
    'The boss. A million fans, one concert, tickets on sale now: 3,000 requests per second and a stream of orders that must not be lost. Two chaos cards.',
  budget: 210,
  baseLoad: { rps: 3000, readRatio: 0.6 },
  unlocked: ['lb', 'api', 'cache', 'sql', 'nosql', 'queue', 'worker'],
  chaos: [
    { id: 'bots', title: 'A bot army is scalping tickets', at: 10, kind: 'bots', extraRps: 6000 },
    { id: 'payments', title: 'The payment provider is down', at: 20, kind: 'payments_down', duration: 8 },
  ],
  rivalName: 'The Scalper',
  rivalTaunt: 'Bots are just customers you have not met yet.',
  rivalClass: 'firefighter',
  rivalBlindSpot:
    'You think bots are just more customers and queues are a waste. Use a round robin load balancer, six large API servers and a SQL database with an index. Never build a queue or a rate limiter.',
  rivalScripted: [
    { kind: 'place', type: 'lb', option: 'round_robin' },
    { kind: 'place', type: 'api', option: 'large' },
    { kind: 'place', type: 'api', option: 'large' },
    { kind: 'place', type: 'api', option: 'large' },
    { kind: 'place', type: 'api', option: 'large' },
    { kind: 'place', type: 'api', option: 'large' },
    { kind: 'place', type: 'api', option: 'large' },
    { kind: 'place', type: 'sql', option: 'standard' },
    { kind: 'addon', building: 'sql1', addon: 'index' },
  ],
  rivalMaxServed: 0.65,
  textbookDefaults: { cache: 'behind the API servers, next to the database' },
}

const campaign = [shorty, chatter, feed, ticketRush]
for (const s of campaign) s.track = 'campaign'

export const STAGES: Record<string, Stage> & { shorty: Stage; chatter: Stage; feed: Stage; ticket_rush: Stage } = {
  shorty, chatter, feed, ticket_rush: ticketRush,
  ...Object.fromEntries([...ACADEMY, ...CLASSICS].map((s) => [s.id, s])),
}
export const STAGE_ORDER: StageId[] = [...ACADEMY, ...campaign, ...CLASSICS].map((s) => s.id)
