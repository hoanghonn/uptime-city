import type { Action, BuildingType, Stage } from './types'

// The Academy: short experiments, each about one trade-off. You pick a design, the other choice is built
// beside it, and the same traffic hits both.

const place = (type: BuildingType, option = 'standard', n = 1): Action[] => Array.from({ length: n }, () => ({ kind: 'place', type, option }))
const addon = (building: string, a: string): Action => ({ kind: 'addon', building, addon: a })
const insertCache = (after: string): Action => ({ kind: 'insert', type: 'cache', option: 'standard', after })

type Lesson = Omit<Stage, 'rivalScripted' | 'rivalMaxServed' | 'rivalName' | 'rivalTaunt' | 'rivalBlindSpot' | 'rivalClass' | 'textbookDefaults'>

function lesson(l: Lesson): Stage {
  return {
    ...l,
    track: 'academy',
    firefight: false,
    rivalName: 'The other choice',
    rivalTaunt: 'Same traffic, different design. Let us see.',
    rivalClass: 'generalist',
    rivalBlindSpot: '',
    rivalScripted: l.experiment!.choices[1].build,
    rivalMaxServed: 1,
    textbookDefaults: {},
  }
}

const path = lesson({
  id: 'path', title: 'The request path', budget: 60,
  brief: 'Every request travels from the users to your data and back. What happens if one stop on the way is missing?',
  baseLoad: { rps: 300, readRatio: 0.9 }, unlocked: ['lb', 'api', 'sql'], chaos: [],
  guide: ['approach'],
  experiment: {
    question: 'Do you need all three: a balancer, a server and a database?',
    twoSided: false,
    tradeoff: 'A request needs a door (the load balancer), someone to do the work (the API server) and somewhere the data lives (the database). Leave out the database and the server has nothing to answer with: every request fails, however strong the server is.',
    choices: [
      { label: 'Balancer, server and database', pitch: 'The full path, 40 coins.', build: [...place('lb', 'round_robin'), ...place('api', 'small'), ...place('sql')] },
      { label: 'A big server and a balancer', pitch: 'Skip the database and buy a bigger server, 35 coins.', build: [...place('lb', 'round_robin'), ...place('api', 'large')] },
    ],
    moments: [{ label: 'The whole test', from: 0, to: 30 }],
  },
})

const biggerOrMore = lesson({
  id: 'bigger_or_more', title: 'Bigger or more?', budget: 90,
  brief: 'Same coins, two ways to spend them: two big servers, or five small ones. A rush comes first, then a server dies.',
  baseLoad: { rps: 1500, readRatio: 0.9 }, unlocked: ['lb', 'api', 'sql'],
  chaos: [
    { id: 'rush', title: 'A rush: a quarter more traffic', at: 8, kind: 'surge', multiplier: 1.25 },
    { id: 'one_dies', title: 'One server dies', at: 20, kind: 'kill', target: 'api' },
  ],
  guide: ['qualities', 'replication'],
  experiment: {
    question: 'Should you buy two big servers or five small ones?',
    twoSided: true,
    tradeoff: 'Big servers give more power per coin, so they ride out the rush. Small servers win when one dies, because each one is a smaller share of the city. That is redundancy: spare capacity spread over many parts.',
    choices: [
      { label: 'Two big servers', pitch: '2 x 900 requests a second, 50 coins.', build: [...place('lb', 'least_conn'), ...place('api', 'large', 2), ...place('sql'), addon('sql1', 'index')] },
      { label: 'Five small servers', pitch: '5 x 300 requests a second, 50 coins.', build: [...place('lb', 'least_conn'), ...place('api', 'small', 5), ...place('sql'), addon('sql1', 'index')] },
    ],
    moments: [
      { label: 'During the rush', from: 8, to: 20 },
      { label: 'After a server died', from: 20, to: 30 },
    ],
  },
})

const cachePlacement = lesson({
  id: 'cache_placement', title: 'Cache in front or behind?', budget: 100,
  brief: 'One link goes viral. A cache can sit in front of your servers or behind them, next to the database.',
  baseLoad: { rps: 1000, readRatio: 0.9 }, unlocked: ['lb', 'api', 'sql', 'cache'],
  chaos: [{ id: 'viral_link', title: 'One link goes viral', at: 10, kind: 'hot_key', extraRps: 4000 }],
  guide: ['caching'],
  experiment: {
    question: 'Where should the cache go: in front of the servers or behind them?',
    twoSided: false,
    tradeoff: 'A cache only protects what is behind it. Behind the servers, it saves the database, but every request still has to pass through the servers, and they drown. In front, repeated reads never reach the servers at all.',
    choices: [
      { label: 'In front of the servers', pitch: 'Between the balancer and the servers.', build: [...place('lb', 'round_robin'), ...place('api', 'large', 2), ...place('sql'), addon('sql1', 'index'), insertCache('lb1')] },
      { label: 'Behind the servers', pitch: 'Between the servers and the database.', build: [...place('lb', 'round_robin'), ...place('api', 'large', 2), ...place('sql'), addon('sql1', 'index'), insertCache('api1'), { kind: 'unlink', from: 'api2', to: 'sql1' }, { kind: 'link', from: 'api2', to: 'cache1' }] },
    ],
    moments: [
      { label: 'Normal traffic', from: 0, to: 10 },
      { label: 'The viral link', from: 10, to: 30 },
    ],
  },
})

const sqlOrNosql = lesson({
  id: 'sql_or_nosql', title: 'SQL or NoSQL?', budget: 150,
  brief: 'An app with lots of writes. Later, one item gets very popular. Which database copes with which?',
  baseLoad: { rps: 1200, readRatio: 0.4 }, unlocked: ['lb', 'api', 'sql', 'nosql'],
  chaos: [{ id: 'popular_item', title: 'One item gets very popular', at: 15, kind: 'hot_key', extraRps: 2500 }],
  guide: ['sql-nosql', 'partitioning'],
  experiment: {
    question: 'Which database should hold the data: SQL or NoSQL?',
    twoSided: true,
    tradeoff: 'NoSQL takes writes far faster, so it wins while the app is busy writing. But it splits data across nodes, and one very popular item lives on a single node, so that node drowns. SQL writes slowly, but its read replicas all share the popular item.',
    choices: [
      { label: 'SQL with a read replica', pitch: 'Safe, slow writes, reads spread over copies.', build: [...place('lb', 'round_robin'), ...place('api', 'large', 4), ...place('sql'), addon('sql1', 'read_replica'), addon('sql1', 'index')] },
      { label: 'NoSQL', pitch: 'Fast writes, data split over nodes.', build: [...place('lb', 'round_robin'), ...place('api', 'large', 4), ...place('nosql')] },
    ],
    moments: [
      { label: 'Busy writing', from: 0, to: 15 },
      { label: 'One popular item', from: 15, to: 30 },
    ],
  },
})

const queueLater = lesson({
  id: 'queue_later', title: 'Queue now, finish later?', budget: 140,
  brief: 'Everyone saves at the same moment. You can write straight into the database, or put the writes in a queue first.',
  baseLoad: { rps: 800, readRatio: 0.5 }, unlocked: ['lb', 'api', 'sql', 'queue', 'worker'],
  chaos: [{ id: 'save_rush', title: 'Everyone saves at once', at: 10, kind: 'write_spike', extraWrites: 1200 }],
  guide: ['queues'],
  experiment: {
    question: 'Should writes go into a queue first, or straight into the database?',
    twoSided: false,
    tradeoff: 'Straight into the database is simple, but a database only takes so many writes a second; past that, saves are lost. A queue accepts every save at once and workers write them in later. Nothing is lost, but the work finishes a little later.',
    choices: [
      { label: 'A queue and two workers', pitch: 'Writes wait safely, then get written.', build: [...place('lb', 'round_robin'), ...place('api', 'large', 3), ...place('sql'), ...place('queue'), ...place('worker', 'standard', 2)] },
      { label: 'Straight into the database', pitch: 'Simple, with a replica and an index for reads.', build: [...place('lb', 'round_robin'), ...place('api', 'large', 3), ...place('sql'), addon('sql1', 'read_replica'), addon('sql1', 'index')] },
    ],
    moments: [
      { label: 'Normal saving', from: 0, to: 10 },
      { label: 'Everyone saves at once', from: 10, to: 30 },
    ],
  },
})

const balancers = lesson({
  id: 'balancers', title: 'Round robin or least connections?', budget: 115,
  brief: 'Three servers share the work. Halfway through, one dies. Does your balancer notice?',
  baseLoad: { rps: 1500, readRatio: 0.9 }, unlocked: ['lb', 'api', 'sql'],
  chaos: [{ id: 'one_server_dies', title: 'A server dies', at: 12, kind: 'kill', target: 'api' }],
  guide: ['load-balancing'],
  experiment: {
    question: 'Is the cheaper round robin balancer good enough?',
    twoSided: false,
    tradeoff: 'Round robin takes turns blindly, so it keeps sending a dead server its share and those requests fail. Least connections checks which servers answer and skips the dead one. It costs 5 coins more; here it buys you a third of your traffic back.',
    choices: [
      { label: 'Least connections', pitch: 'Skips dead servers, 15 coins.', build: [...place('lb', 'least_conn'), ...place('api', 'large', 3), ...place('sql'), addon('sql1', 'index')] },
      { label: 'Round robin', pitch: 'Takes turns, 10 coins.', build: [...place('lb', 'round_robin'), ...place('api', 'large', 3), ...place('sql'), addon('sql1', 'index')] },
    ],
    moments: [
      { label: 'All servers up', from: 0, to: 12 },
      { label: 'After a server died', from: 12, to: 30 },
    ],
  },
})

export const ACADEMY: Stage[] = [path, biggerOrMore, cachePlacement, sqlOrNosql, queueLater, balancers]
