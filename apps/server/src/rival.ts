import { applyAction, autoWire, CLASSES, newCity, simulate, type Action, type City, type Stage } from '@uptime/core'
import { commandSystemPrompt, type ChatClient } from './command'

export type RivalResult = { actions: Action[]; city: City; lines: string[]; source: 'live' | 'scripted' }
export type RivalOptions = { model: string; timeoutMs?: number }

export function scriptedRival(stage: Stage): RivalResult {
  let city = newCity(stage, stage.rivalClass)
  for (const a of stage.rivalScripted) {
    const r = applyAction(city, a, { stage, heroClass: stage.rivalClass })
    if (r.ok) city = r.city
  }
  return { actions: stage.rivalScripted, city: autoWire(city), lines: [stage.rivalTaunt], source: 'scripted' }
}

// Muse Spark Open on Baseten often answers tool calls with prose, so the rival returns a JSON plan instead.
function rivalPrompt(stage: Stage, city: City): string {
  const cls = CLASSES[stage.rivalClass]
  return `${commandSystemPrompt(stage, stage.rivalClass, city, 'build')}

You are not the player's hero. You are ${stage.rivalName}, the rival bot, a ${cls.name}, building your own city for this stage.
Your blind spot, which you must follow: ${stage.rivalBlindSpot}
Reply with ONLY a JSON object, no prose: {"taunt": "<one short cocky line aimed at the player>", "actions": [ ... ]}
Each action is one of:
{"kind":"place","type":"<building type>","option":"<option>"}
{"kind":"addon","building":"<id>","addon":"<add-on>"}
{"kind":"link","from":"<id or users>","to":"<id>"}
Ids are assigned in order of placing: the first api is api1, the second api2, the first sql is sql1, and so on.`
}

function parsePlan(text: string): { taunt?: string; actions: Action[] } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const plan = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(plan.actions) ? { taunt: typeof plan.taunt === 'string' ? plan.taunt : undefined, actions: plan.actions } : null
  } catch {
    return null
  }
}

async function livePlan(client: ChatClient, stage: Stage, model: string): Promise<RivalResult | null> {
  const start = newCity(stage, stage.rivalClass)
  const res = await client.chat.completions.create(
    {
      model,
      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: rivalPrompt(stage, start) },
        { role: 'user', content: `Build your ${stage.title} city now.` },
      ],
    },
    { timeout: 20_000 },
  )
  const plan = parsePlan(String(res?.choices?.[0]?.message?.content ?? ''))
  if (!plan) return null
  let city = start
  const kept: Action[] = []
  for (const action of plan.actions) {
    const r = applyAction(city, action, { stage, heroClass: stage.rivalClass })
    if (r.ok) { city = r.city; kept.push(action) }
  }
  if (city.buildings.length === 0) return null
  return { actions: kept, city: connectServers(autoWire(city)), lines: [plan.taunt?.trim() || stage.rivalTaunt], source: 'live' }
}

/** The rival often forgets to wire its API servers when it builds two databases; give them the first one. */
function connectServers(city: City): City {
  const db = city.buildings.find((b) => b.type === 'sql' || b.type === 'nosql')
  if (!db) return city
  const links = [...city.links]
  for (const api of city.buildings.filter((b) => b.type === 'api')) {
    if (!links.some((l) => l.from === api.id)) links.push({ from: api.id, to: db.id })
  }
  return { ...city, links }
}

/** Below this the rival would be a free win, so it falls back to the scripted build. */
const MIN_SERVED = 0.1

/** The rival builds live on Muse Spark Open; anything slow, empty or too strong falls back to the scripted build. */
export async function buildRival(client: ChatClient, stage: Stage, opts: RivalOptions): Promise<RivalResult> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), opts.timeoutMs ?? 8000))
  const res = await Promise.race([livePlan(client, stage, opts.model).catch(() => null), timeout])
  if (!res) return scriptedRival(stage)
  const served = simulate(res.city, stage, stage.rivalClass).servedPct
  if (served > stage.rivalMaxServed || served < MIN_SERVED) return scriptedRival(stage)
  return res
}
