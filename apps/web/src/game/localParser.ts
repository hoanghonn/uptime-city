import { applyAction, autoWire, STAGES, type Action, type BuildingType, type City, type HeroClass } from '@uptime/core'
import type { CommandResponse } from './flow'

// Low-power mode: when the day's AI budget is used up, orders are parsed here with plain keyword rules.

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, another: 1, two: 2, three: 3, four: 4, five: 5 }
const count = (w: string | undefined) => (w ? NUM[w] ?? (Number(w) || 1) : 1)
const COUNT = '(\\d+|a|an|one|another|two|three|four|five)'

function nextId(city: City, type: BuildingType, taken: Set<string>): string {
  let n = 1
  while (city.buildings.some((b) => b.id === `${type}${n}`) || taken.has(`${type}${n}`)) n++
  return `${type}${n}`
}

export function parseLocal(input: string, stageId: string, city: City): Action[] {
  const stage = STAGES[stageId]
  let text = ` ${input.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `
  const found: { at: number; actions: (ids: Set<string>) => Action[] }[] = []
  const take = (re: RegExp, make: (m: RegExpExecArray) => (ids: Set<string>) => Action[]) => {
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      found.push({ at: m.index, actions: make(m) })
      text = text.slice(0, m.index) + ' '.repeat(m[0].length) + text.slice(m.index + m[0].length) // so later rules don't match it again
      re.lastIndex = 0
    }
  }

  // The cache first, so "in front of the servers" isn't read as more servers.
  take(/ (?:put |add |use )?(?:the |a |free )*cache(?: (in front|before|behind|after|next to)(?: of)?(?: the)?(?: api)?(?: servers?| database| db)?)?/, (m) => () => {
    const wildcard = stage.wildcard === 'cache' && !city.wildcardUsed
    if (!wildcard && !stage.unlocked.includes('cache')) return []
    const where = m[1] ?? (stage.textbookDefaults.cache?.startsWith('behind') ? 'behind' : 'in front')
    const lb = city.buildings.find((b) => b.type === 'lb')?.id
    const api = city.buildings.find((b) => b.type === 'api')?.id
    const after = where === 'in front' || where === 'before' ? lb ?? 'users' : api ?? lb ?? 'users'
    return [{ kind: 'insert', type: 'cache', option: 'standard', after, ...(wildcard ? { wildcard: true } : {}) }]
  })
  take(/ (?:a |an )?cdn/, () => () => [{ kind: 'place', type: 'cdn', option: 'standard' }])
  take(/ (?:an? )?(?:object |blob |photo )storage/, () => () => [{ kind: 'place', type: 'storage', option: 'standard' }])
  take(/ (least connections?|round robin|rate limit(?:ing|ed)?)(?: load)?(?: balancer)?| (?:load )?balancer/, (m) => () => [
    { kind: 'place', type: 'lb', option: m[1]?.startsWith('least') ? 'least_conn' : m[1]?.startsWith('rate') ? 'rate_limit' : 'round_robin' },
  ])
  take(new RegExp(` (?:${COUNT} )?(?:more )?(large|big|small|tiny)? ?(?:api )?servers?`), (m) => () =>
    Array.from({ length: count(m[1]) }, () => ({ kind: 'place' as const, type: 'api' as const, option: m[2] === 'small' || m[2] === 'tiny' ? 'small' : 'large' })),
  )
  const db = (type: 'sql' | 'nosql') => (m: RegExpExecArray) => (ids: Set<string>) => {
    const id = nextId(city, type, ids)
    ids.add(id)
    const tail = m[0]
    const out: Action[] = [{ kind: 'place', type, option: 'standard' }]
    if (/index/.test(tail)) out.push({ kind: 'addon', building: id, addon: 'index' })
    const rep = new RegExp(`(?:${COUNT} )?(?:read )?replicas?`).exec(tail)
    if (rep && type === 'sql') for (let i = 0; i < count(rep[1]); i++) out.push({ kind: 'addon', building: id, addon: 'read_replica' })
    const node = new RegExp(`(?:${COUNT} )?(?:extra |more )?nodes?`).exec(tail)
    if (node && type === 'nosql') for (let i = 0; i < count(node[1]); i++) out.push({ kind: 'addon', building: id, addon: 'nosql_node' })
    return out
  }
  take(/ no ?sql(?: database| db)?(?: with)?(?: (?:an |a |and |two |three |\d |extra |more |read )*(?:index|nodes?|replicas?))*/, db('nosql'))
  take(/ sql(?: database| db)?(?: with)?(?: (?:an |a |and |two |three |\d |extra |more |read )*(?:index|nodes?|replicas?))*/, db('sql'))
  take(/ queue/, () => () => [{ kind: 'place', type: 'queue', option: 'standard' }])
  take(new RegExp(` (?:${COUNT} )?workers?`), (m) => () =>
    Array.from({ length: count(m[1]) }, () => ({ kind: 'place' as const, type: 'worker' as const, option: 'standard' })),
  )

  const ids = new Set<string>()
  return found.sort((a, b) => a.at - b.at).flatMap((f) => f.actions(ids))
}

/** A whole order handled locally, shaped like the server's answer. */
export function localCommand(text: string, stageId: string, heroClass: HeroClass, city: City, phase: 'build' | 'firefight'): CommandResponse {
  if (phase === 'build' && /\bsubmit\b|\bgo live\b|\bstart the test\b/i.test(text)) {
    return { city, heroLine: 'Here we go!', actions: [], rejected: [], submit: true }
  }
  const stage = STAGES[stageId]
  const actions = parseLocal(text, stageId, city)
  if (actions.length === 0) {
    return { city, heroLine: "I didn't catch that. Try simpler words, like: two large servers and SQL.", actions: [], rejected: [] }
  }
  let next = city
  const done: Action[] = []
  const rejected: CommandResponse['rejected'] = []
  for (const a of phase === 'firefight' ? actions.slice(0, 1) : actions) {
    const r = applyAction(next, a, { stage, heroClass })
    if (r.ok) { next = r.city; done.push(a) } else rejected.push({ action: a, reason: r.reason })
  }
  if (phase === 'build') next = autoWire(next)
  const heroLine = done.length ? 'Built it.' : `I can't do that: ${rejected[0]?.reason ?? 'no idea how'}.`
  return { city: next, heroLine, actions: done, rejected }
}
