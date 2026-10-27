import type { Action, BuildingType, Stage } from './types'

// The classic system design interview problems, as stages. Briefs, numbers and lessons are our own.

const place = (type: BuildingType, option = 'standard', n = 1): Action[] => Array.from({ length: n }, () => ({ kind: 'place', type, option }))
const addon = (building: string, a: string, n = 1): Action[] => Array.from({ length: n }, () => ({ kind: 'addon', building, addon: a }))
const cacheFront: Action = { kind: 'insert', type: 'cache', option: 'standard', after: 'lb1' }
const CACHE_DEFAULT = { cache: 'behind the API servers, next to the database' }

const pastebox: Stage = {
  id: 'pastebox', track: 'classic', title: 'Pastebox',
  brief: 'A paste-sharing site, like Pastebin. 600 requests a second, mostly people reading pastes, and pastes can be big. One is about to go viral.',
  budget: 110, baseLoad: { rps: 600, readRatio: 0.85, mediaShare: 0.6 },
  unlocked: ['lb', 'api', 'cache', 'sql', 'nosql', 'storage'],
  chaos: [{ id: 'viral_paste', title: 'A paste goes viral', at: 15, kind: 'hot_key', extraRps: 2500 }],
  rivalName: 'Clip', rivalTaunt: 'Text is tiny. Just put it all in the database.', rivalClass: 'data_keeper',
  rivalBlindSpot: 'You think everything belongs in the database. Use a round robin balancer, two large API servers and a SQL database with two read replicas and an index. Never build a cache or object storage.',
  rivalScripted: [...place('lb', 'round_robin'), ...place('api', 'large', 2), ...place('sql'), ...addon('sql1', 'read_replica', 2), ...addon('sql1', 'index')],
  rivalMaxServed: 0.85, textbookDefaults: CACHE_DEFAULT,
  reference: [...place('lb', 'round_robin'), ...place('api', 'large', 2), ...place('sql'), ...addon('sql1', 'index'), ...place('storage'), cacheFront],
  guide: ['storage', 'caching'],
}

const gatekeeper: Stage = {
  id: 'gatekeeper', track: 'classic', title: 'Gatekeeper',
  brief: 'A public API, and the job is a rate limiter. 1,500 honest requests a second. Something less honest is on its way.',
  budget: 120, baseLoad: { rps: 1500, readRatio: 0.7 },
  unlocked: ['lb', 'api', 'cache', 'sql'],
  chaos: [{ id: 'bot_flood', title: 'Bots are hammering the API', at: 10, kind: 'bots', extraRps: 9000 }],
  rivalName: 'Doorman', rivalTaunt: 'Every request deserves an answer.', rivalClass: 'generalist',
  rivalBlindSpot: 'You believe every request deserves an answer. Use a round robin balancer, three large API servers and a SQL database with an index. Never use rate limiting.',
  rivalScripted: [...place('lb', 'round_robin'), ...place('api', 'large', 3), ...place('sql'), ...addon('sql1', 'index')],
  rivalMaxServed: 0.6, textbookDefaults: CACHE_DEFAULT,
  reference: [...place('lb', 'rate_limit'), ...place('api', 'large', 2), ...place('sql'), ...addon('sql1', 'index'), ...addon('sql1', 'read_replica')],
  guide: ['load-balancing', 'proxies'],
}

const chirp: Stage = {
  id: 'chirp', track: 'classic', title: 'Chirp',
  brief: 'A Twitter-style timeline. 2,000 requests a second, almost all of them people scrolling. Then the most-followed person on the site posts.',
  budget: 150, baseLoad: { rps: 2000, readRatio: 0.9 },
  unlocked: ['lb', 'api', 'cache', 'sql', 'nosql', 'queue', 'worker'],
  chaos: [{ id: 'celebrity_post', title: 'A celebrity just posted', at: 12, kind: 'hot_key', extraRps: 6000 }],
  rivalName: 'Flock', rivalTaunt: 'Four servers and a NoSQL cluster. What could go wrong?', rivalClass: 'generalist',
  rivalBlindSpot: 'You trust raw power. Use a round robin balancer, four large API servers and a NoSQL database with one extra node. Never build a cache.',
  rivalScripted: [...place('lb', 'round_robin'), ...place('api', 'large', 4), ...place('nosql'), ...addon('nosql1', 'nosql_node')],
  rivalMaxServed: 0.7, textbookDefaults: CACHE_DEFAULT,
  reference: [...place('lb', 'round_robin'), ...place('api', 'large', 3), ...place('nosql'), ...addon('nosql1', 'index'), cacheFront],
  guide: ['caching', 'partitioning', 'cap'],
}

const suggest: Stage = {
  id: 'suggest', track: 'classic', title: 'Suggest',
  brief: 'Search suggestions as you type. Every keystroke is a request: 4,000 a second. Then a name starts trending and everyone types it at once.',
  budget: 130, baseLoad: { rps: 4000, readRatio: 0.98 },
  unlocked: ['lb', 'api', 'cache', 'sql', 'nosql'],
  chaos: [{ id: 'trending', title: 'Everyone is typing the same name', at: 15, kind: 'hot_key', extraRps: 10000 }],
  rivalName: 'Keystroke', rivalTaunt: 'Caches are for people who cannot type fast.', rivalClass: 'edge_runner',
  rivalBlindSpot: 'You never cache: every keystroke deserves a fresh answer. Use a round robin balancer, three large API servers and a SQL database with an index.',
  rivalScripted: [...place('lb', 'round_robin'), ...place('api', 'large', 3), ...place('sql'), ...addon('sql1', 'index')],
  rivalMaxServed: 0.6, textbookDefaults: CACHE_DEFAULT,
  reference: [...place('lb', 'round_robin'), ...place('api', 'large', 3), ...place('nosql'), ...addon('nosql1', 'index'), cacheFront],
  guide: ['caching', 'consistent-hashing'],
}

const seek: Stage = {
  id: 'seek', track: 'classic', title: 'Seek',
  brief: 'Search over millions of posts. 2,500 searches a second, and every search has to find matches fast. Breaking news is coming.',
  budget: 140, baseLoad: { rps: 2500, readRatio: 0.95 },
  unlocked: ['lb', 'api', 'cache', 'sql', 'nosql'],
  chaos: [{ id: 'breaking_news', title: 'Breaking news', at: 15, kind: 'surge', multiplier: 2 }],
  rivalName: 'Grep', rivalTaunt: 'Who needs an index? Just look at every row.', rivalClass: 'firefighter',
  rivalBlindSpot: 'You think indexes are a waste of coins. Use a round robin balancer, four large API servers and a SQL database with no add-ons.',
  rivalScripted: [...place('lb', 'round_robin'), ...place('api', 'large', 4), ...place('sql')],
  rivalMaxServed: 0.6, textbookDefaults: CACHE_DEFAULT,
  reference: [...place('lb', 'round_robin'), ...place('api', 'large', 3), ...place('sql'), ...addon('sql1', 'index'), ...addon('sql1', 'read_replica'), cacheFront],
  guide: ['indexes', 'replication'],
}

const nearby: Stage = {
  id: 'nearby', track: 'classic', title: 'Nearby',
  brief: 'Find places near you, like Yelp. 2,000 requests a second, nearly all of them searches. At lunchtime everyone gets hungry at once.',
  budget: 150, baseLoad: { rps: 2000, readRatio: 0.97 },
  unlocked: ['lb', 'api', 'cache', 'sql', 'nosql'],
  chaos: [{ id: 'lunchtime', title: 'Lunchtime', at: 15, kind: 'surge', multiplier: 3 }],
  rivalName: 'Wanderer', rivalTaunt: 'Just add more servers until it stops hurting.', rivalClass: 'generalist',
  rivalBlindSpot: 'You think servers fix everything. Use a round robin balancer, four large API servers and a SQL database with one read replica. No cache, no index.',
  rivalScripted: [...place('lb', 'round_robin'), ...place('api', 'large', 4), ...place('sql'), ...addon('sql1', 'read_replica')],
  rivalMaxServed: 0.8, textbookDefaults: CACHE_DEFAULT,
  reference: [...place('lb', 'round_robin'), ...place('api', 'large', 3), ...place('sql'), ...addon('sql1', 'index'), ...addon('sql1', 'read_replica'), cacheFront],
  guide: ['indexes', 'caching', 'partitioning'],
}

const streamtube: Stage = {
  id: 'streamtube', track: 'classic', title: 'StreamTube',
  brief: 'Video streaming, like YouTube or Netflix. 1,500 requests a second and nearly all of them are video. Then a video goes viral worldwide.',
  budget: 140, baseLoad: { rps: 1500, readRatio: 0.97, mediaShare: 0.9 },
  unlocked: ['lb', 'api', 'cache', 'sql', 'nosql', 'cdn', 'storage'],
  chaos: [{ id: 'viral_video', title: 'A video went viral worldwide', at: 15, kind: 'surge', multiplier: 4 }],
  rivalName: 'Buffer', rivalTaunt: 'Big servers, big database, big win.', rivalClass: 'data_keeper',
  rivalBlindSpot: 'You keep videos in the database and serve them yourself. Use a round robin balancer, four large API servers and a SQL database with a read replica and an index. Never build a CDN or object storage.',
  rivalScripted: [...place('lb', 'round_robin'), ...place('api', 'large', 4), ...place('sql'), ...addon('sql1', 'read_replica'), ...addon('sql1', 'index')],
  rivalMaxServed: 0.7, textbookDefaults: CACHE_DEFAULT,
  reference: [...place('cdn'), ...place('lb', 'round_robin'), ...place('api', 'large', 2), ...place('sql'), ...addon('sql1', 'index'), ...place('storage')],
  guide: ['cdn', 'storage'],
}

const driftbox: Stage = {
  id: 'driftbox', track: 'classic', title: 'Driftbox',
  brief: 'File sync, like Dropbox. 800 requests a second: half are files being saved, half are files being opened. Then a deadline hits and everyone saves at once.',
  budget: 150, baseLoad: { rps: 800, readRatio: 0.5, mediaShare: 0.8 },
  unlocked: ['lb', 'api', 'sql', 'nosql', 'queue', 'worker', 'storage'],
  chaos: [{ id: 'deadline', title: 'Everyone saves before the deadline', at: 15, kind: 'write_spike', extraWrites: 1500 }],
  rivalName: 'Hoarder', rivalTaunt: 'One big database holds everything. Files too.', rivalClass: 'data_keeper',
  rivalBlindSpot: 'You keep files in the database and write everything straight in. Use a round robin balancer, three large API servers and a SQL database with a read replica and an index. Never build a queue or object storage.',
  rivalScripted: [...place('lb', 'round_robin'), ...place('api', 'large', 3), ...place('sql'), ...addon('sql1', 'read_replica'), ...addon('sql1', 'index')],
  rivalMaxServed: 0.75, textbookDefaults: {},
  reference: [...place('lb', 'round_robin'), ...place('api', 'large', 3), ...place('sql'), ...place('queue'), ...place('worker', 'standard', 2), ...place('storage')],
  guide: ['queues', 'storage', 'sql-nosql'],
}

const crawlbot: Stage = {
  id: 'crawlbot', track: 'classic', title: 'Crawlbot',
  brief: 'A web crawler. 1,200 requests a second, and nine in ten are newly found pages to store. Then it stumbles into a link farm.',
  budget: 140, baseLoad: { rps: 1200, readRatio: 0.1 },
  unlocked: ['lb', 'api', 'sql', 'nosql', 'queue', 'worker', 'storage'],
  chaos: [{ id: 'link_farm', title: 'Found a link farm', at: 15, kind: 'write_spike', extraWrites: 2000 }],
  rivalName: 'Spider', rivalTaunt: 'SQL never loses a page. Slow is fine.', rivalClass: 'data_keeper',
  rivalBlindSpot: 'You store every page in SQL, one at a time. Use a round robin balancer, four large API servers and a SQL database with an index. Never build NoSQL or a queue.',
  rivalScripted: [...place('lb', 'round_robin'), ...place('api', 'large', 4), ...place('sql'), ...addon('sql1', 'index')],
  rivalMaxServed: 0.6, textbookDefaults: {},
  reference: [...place('lb', 'round_robin'), ...place('api', 'large', 4), ...place('nosql')],
  guide: ['sql-nosql', 'partitioning'],
}

const ridewave: Stage = {
  id: 'ridewave', track: 'classic', title: 'Ridewave',
  brief: 'Ride hailing, like Uber. 3,000 requests a second, and most are drivers sending their location. Then a server rack fails.',
  budget: 160, baseLoad: { rps: 3000, readRatio: 0.3 },
  unlocked: ['lb', 'api', 'cache', 'sql', 'nosql', 'queue', 'worker'],
  chaos: [{ id: 'rack_fails', title: 'A server rack failed', at: 12, kind: 'kill', target: 'api' }],
  rivalName: 'Meter', rivalTaunt: 'Every location ping goes into SQL. Safety first.', rivalClass: 'data_keeper',
  rivalBlindSpot: 'You write every location ping into SQL. Use a round robin balancer, four large API servers and a SQL database with an index. Never build NoSQL.',
  rivalScripted: [...place('lb', 'round_robin'), ...place('api', 'large', 4), ...place('sql'), ...addon('sql1', 'index')],
  rivalMaxServed: 0.6, textbookDefaults: CACHE_DEFAULT,
  reference: [...place('lb', 'least_conn'), ...place('api', 'large', 4), ...place('nosql')],
  guide: ['sql-nosql', 'load-balancing', 'replication'],
}

const feedline: Stage = {
  id: 'feedline', track: 'classic', title: 'Feedline',
  brief: "A Facebook-style news feed. 3,000 requests a second. A server will die, and later a friend's wedding photos will be everywhere. Two chaos cards.",
  budget: 170, baseLoad: { rps: 3000, readRatio: 0.9 },
  unlocked: ['lb', 'api', 'cache', 'sql', 'nosql', 'queue', 'worker'],
  chaos: [
    { id: 'server_dies', title: 'A server just died', at: 12, kind: 'kill', target: 'api' },
    { id: 'wedding', title: "A friend's wedding photos are everywhere", at: 18, kind: 'hot_key', extraRps: 4000 },
  ],
  rivalName: 'Scroll', rivalTaunt: 'Four servers and SQL. Feeds are easy.', rivalClass: 'edge_runner',
  rivalBlindSpot: 'You think feeds are easy. Use a round robin balancer, four large API servers and a SQL database with an index. Never build a cache.',
  rivalScripted: [...place('lb', 'round_robin'), ...place('api', 'large', 4), ...place('sql'), ...addon('sql1', 'index')],
  rivalMaxServed: 0.75, textbookDefaults: CACHE_DEFAULT,
  reference: [...place('lb', 'least_conn'), ...place('api', 'large', 3), ...place('nosql'), ...addon('nosql1', 'index'), cacheFront],
  guide: ['caching', 'load-balancing', 'cap'],
}

export const CLASSICS: Stage[] = [pastebox, gatekeeper, chirp, suggest, seek, nearby, streamtube, driftbox, crawlbot, ridewave, feedline]
