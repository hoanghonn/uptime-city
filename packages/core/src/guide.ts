import type { BuildingType } from './types'

/** The field guide: short, original explanations of the ideas the game teaches. */
export type GuideEntry = { id: string; title: string; body: string; buildings: BuildingType[] }

export const GUIDE: GuideEntry[] = [
  {
    id: 'approach',
    title: 'How to approach a design',
    buildings: [],
    body:
      'Start with the numbers: how many requests a second, how many are reads, how big each one is. Then sketch the path a request takes, from the user to the data and back. Find the slowest stop on that path, because that is where the city will burn first. Only then add the clever parts: caches, replicas, queues. Every extra building costs coins, so each one should fix a problem you can name.',
  },
  {
    id: 'qualities',
    title: 'What makes a system good',
    buildings: [],
    body:
      'Scalable: it keeps working when traffic grows, ideally by adding more of the same building. Available: users get an answer even when a part is broken. Reliable: it does not lose what it promised to keep, such as a message or an order. Fast: the slowest few requests matter more than the average, which is why the result screen shows how long the slowest 5% took.',
  },
  {
    id: 'load-balancing',
    title: 'Load balancing',
    buildings: ['lb'],
    body:
      'A load balancer stands at the door and spreads requests over several servers, so no single one carries everything. Round robin simply takes turns. Least connections sends each request to the least busy server and stops sending to servers that do not answer, which is what saves you when one dies. A rate limiter at the door can turn away floods of bot traffic before they cost anything.',
  },
  {
    id: 'caching',
    title: 'Caching',
    buildings: ['cache'],
    body:
      'A cache remembers recent answers, so the same question does not travel all the way to the database again. It shines when many people ask for the same thing, like one viral link. Where you put it matters: in front of the servers it protects the servers and everything behind them; behind the servers it only protects the database. A new cache starts cold and needs a moment to fill up.',
  },
  {
    id: 'cdn',
    title: 'Content delivery networks',
    buildings: ['cdn'],
    body:
      'A CDN keeps copies of photos, videos and other big files in many places around the world, close to the people who want them. Most requests for big files are answered at the edge and never reach your city at all. It does nothing for requests that change data, or for answers that are different for every user.',
  },
  {
    id: 'partitioning',
    title: 'Splitting data across machines',
    buildings: ['nosql'],
    body:
      'When one database machine cannot hold or serve everything, the data is split into pieces, each on its own node. Requests spread out, and adding nodes adds capacity. The catch is a very popular key: all its requests land on the one node that owns it, and extra nodes do not help. That one needs a cache.',
  },
  {
    id: 'consistent-hashing',
    title: 'Consistent hashing',
    buildings: ['nosql', 'cache'],
    body:
      'To split data across nodes you need a rule for which node owns which key. A naive rule reshuffles almost every key when a node is added or removed. Consistent hashing places nodes and keys on a ring, so adding a node only moves the keys next to it. That is what makes it cheap to grow a cluster of database nodes or cache servers.',
  },
  {
    id: 'indexes',
    title: 'Indexes',
    buildings: ['sql', 'nosql'],
    body:
      'Without an index, a database finds a row by looking at every row. An index is a sorted lookup table that jumps straight to the answer, like the index at the back of a book. Reads get much faster, and in this game they double. The price is a little extra work on every write, because the index has to be kept up to date.',
  },
  {
    id: 'replication',
    title: 'Redundancy and replication',
    buildings: ['sql'],
    body:
      'A replica is a live copy of a database. Reads can be spread over the copies, so more reads fit, and if one copy fails another can take over. Writes still go to the main copy first and are passed on to the replicas, so replicas help reads far more than writes. Keeping spare copies of anything important, servers included, is called redundancy.',
  },
  {
    id: 'sql-nosql',
    title: 'SQL or NoSQL',
    buildings: ['sql', 'nosql'],
    body:
      'A SQL database keeps data in tables with strict rules, and is very good at never losing or corrupting anything, at the cost of slower writes. A NoSQL key-value store spreads data over nodes and takes writes very fast, but leaves more of the rules to you. Orders and payments usually want SQL; huge streams of simple writes, like location pings, often want NoSQL.',
  },
  {
    id: 'cap',
    title: 'The CAP trade-off',
    buildings: ['nosql', 'sql'],
    body:
      'When the network between two parts of a system breaks, the system has to choose. Either it keeps answering, accepting that some answers may be slightly out of date, or it refuses to answer until it is sure everything agrees. You cannot have both during the break. Feeds and likes usually choose to keep answering; bank balances and ticket sales usually choose to be correct.',
  },
  {
    id: 'queues',
    title: 'Queues and background workers',
    buildings: ['queue', 'worker'],
    body:
      'A queue accepts work right away and holds it safely; workers take it off the queue at their own pace. Users get a quick answer even when the database is busy, and nothing is lost during a spike or an outage, as long as the queue has room. The work is finished a little later, which is fine for messages, emails and orders, but not for reading your own balance.',
  },
  {
    id: 'storage',
    title: 'Object storage',
    buildings: ['storage'],
    body:
      'Photos, videos and file uploads do not belong in a database: they are big, and every read costs as much as many small ones. Object storage is built to hold huge numbers of big files cheaply and hand them out; the database keeps only small facts about each file, such as its name and owner.',
  },
  {
    id: 'proxies',
    title: 'Proxies',
    buildings: ['lb', 'cdn'],
    body:
      'A proxy is a middleman that answers on behalf of the servers behind it. Load balancers, rate limiters and CDNs are all proxies of different kinds. Because every request passes through them, they are a good place to filter, cache, or combine requests, and a bad place to be slow.',
  },
  {
    id: 'push',
    title: 'Polling, long polling, WebSockets and server-sent events',
    buildings: ['api'],
    body:
      'Polling asks the server again and again whether anything is new, which wastes requests. Long polling asks once and waits until there is news. WebSockets keep one connection open in both directions, which suits chat and games. Server-sent events keep a one-way stream from server to user, which suits live scores and notifications. The voice in this game uses a WebSocket.',
  },
]

export const guideFor = (type: BuildingType) => GUIDE.filter((g) => g.buildings.includes(type))
export const guideEntry = (id: string) => GUIDE.find((g) => g.id === id)
