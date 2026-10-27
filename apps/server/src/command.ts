import { applyAction, autoWire, CATALOG, CLASSES, STAGES, type Action, type BuildingType, type City, type HeroClass, type Stage } from '@uptime/core'

/** The slice of the OpenAI SDK we use, so tests can pass a fake. */
export type ChatClient = { chat: { completions: { create: (req: any, opts?: any) => Promise<any> } } }

export type CommandInput = { stageId: string; heroClass: HeroClass; city: City; transcript: string; phase: 'build' | 'firefight' }
export type AskBack = { question: string; choices: string[]; default: string }
export type CommandResult = {
  actions: Action[]
  city: City
  heroLine: string
  askBack?: AskBack
  submit?: boolean
  rejected: { action: Action | { kind: string }; reason: string }[]
  usage?: { prompt: number; completion: number }
}

export const COMMAND_MODEL = 'muse-spark-1.3'
const COMMS_DOWN = 'Comms are down, type your orders.'
const MAX_ROUNDS = 6
const FIREFIGHT_TOOLS = new Set(['place', 'insert', 'addon', 'remove', 'ask_back'])

const str = (description: string, values?: string[]) => ({ type: 'string', description, ...(values ? { enum: values } : {}) })
const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
})

export function commandTools(stage: Stage, phase: CommandInput['phase']) {
  const types = [...stage.unlocked, ...(stage.wildcard ? [stage.wildcard] : [])] as BuildingType[]
  const options = [...new Set(types.flatMap((t) => Object.keys(CATALOG[t].options)))]
  const addons = [...new Set(types.flatMap((t) => Object.keys(CATALOG[t].addons)))]
  const all = [
    fn('place', 'Build a new building. It gets an id like api1, api2, sql1.', { type: str('building type', types), option: str('option', options) }, ['type', 'option']),
    fn(
      'insert',
      'Build a new building directly after an existing one: it takes over everything the existing building was sending traffic to. Use this to put a cache in front of the API servers (after the load balancer).',
      { type: str('building type', types), option: str('option', options), after: str('id of the existing building, or "users"'), wildcard: { type: 'boolean', description: 'true to use the free one-time wildcard' } },
      ['type', 'option', 'after'],
    ),
    fn('addon', 'Add an add-on to an existing building.', { building: str('building id'), addon: str('add-on', addons) }, ['building', 'addon']),
    fn('link', 'Connect two buildings so traffic flows from one to the other. "users" is where traffic starts.', { from: str('id or "users"'), to: str('id') }, ['from', 'to']),
    fn('unlink', 'Remove a connection.', { from: str('id or "users"'), to: str('id') }, ['from', 'to']),
    fn('remove', 'Demolish a building and get its coins back.', { building: str('building id') }, ['building']),
    fn(
      'ask_back',
      'Ask the player a short question when the order is ambiguous (for example where a cache goes, or which of two databases). Never guess.',
      { question: str('one short spoken question'), choices: { type: 'array', items: { type: 'string' }, description: '2 or 3 short spoken answers' }, topic: str('what is ambiguous, e.g. "cache"') },
      ['question', 'choices', 'topic'],
    ),
    fn('submit', 'Start the stress test. Only when the player says so.', {}, []),
  ]
  return phase === 'firefight' ? all.filter((t) => FIREFIGHT_TOOLS.has(t.function.name)) : all
}

export function describeCity(city: City): string {
  if (city.buildings.length === 0) return 'Nothing built yet.'
  const b = city.buildings.map((x) => `${x.id}: ${CATALOG[x.type].name}, ${x.option}${x.addons.length ? ` + ${x.addons.join(', ')}` : ''}`)
  const l = city.links.length ? city.links.map((x) => `${x.from} -> ${x.to}`).join('; ') : 'no connections yet'
  return `${b.join('\n')}\nConnections: ${l}`
}

export function commandSystemPrompt(stage: Stage, heroClass: HeroClass, city: City, phase: CommandInput['phase']): string {
  const cls = CLASSES[heroClass]
  const catalog = [...stage.unlocked, ...(stage.wildcard ? [stage.wildcard] : [])]
    .map((t) => {
      const e = CATALOG[t]
      const opts = Object.entries(e.options).map(([k, o]) => `${k} (${o.cost} coins)`).join(', ')
      const adds = Object.entries(e.addons).map(([k, a]) => `${k} (${a.cost})`).join(', ')
      return `- ${t} = ${e.name}: ${opts}${adds ? `; add-ons: ${adds}` : ''}${t === stage.wildcard ? ' [free once as the wildcard, if not used yet]' : ''}`
    })
    .join('\n')
  return `You are the player's hero in Uptime City, a game where the player builds a backend system as a small city by talking to you.
You are a ${cls.name}. Perk: ${cls.perk} Weakness: ${cls.weakness}

Stage "${stage.title}": ${stage.brief}
Coins left: ${city.coins}. Wildcard ${city.wildcardUsed ? 'already used' : 'still available'}.
Buildings you can use:
${catalog}

Current city:
${describeCity(city)}

Rules:
- Turn the player's spoken order into tool calls, in order. One sentence can need several calls: build, then add-ons, then connect.
- Make every tool call for the whole order in a single reply. New ids are predictable: the first api is api1, the second api2, the first sql is sql1.
- Traffic starts at "users", which must connect to a load balancer first. API servers must connect to a database or nothing gets served.
- Connect new buildings sensibly unless told otherwise: users -> load balancer -> API servers -> database.
- If the order is ambiguous in a way that matters (where a cache goes, which of two buildings), call ask_back and nothing else. Never guess.
- Never spend coins the player did not ask you to spend.
${phase === 'firefight' ? '- The stress test is running. Only quick fixes: build, insert, add-on or demolish. No rewiring.\n' : ''}- Also reply with one short spoken line (at most 15 words), in character, upbeat. No markdown, no emoji.`
}

function toAction(name: string, args: any): Action | null {
  switch (name) {
    case 'place': return { kind: 'place', type: args.type, option: args.option, ...(args.wildcard ? { wildcard: true } : {}) }
    case 'insert': return { kind: 'insert', type: args.type, option: args.option, after: args.after, ...(args.wildcard ? { wildcard: true } : {}) }
    case 'addon': return { kind: 'addon', building: args.building, addon: args.addon }
    case 'link': return { kind: 'link', from: args.from, to: args.to }
    case 'unlink': return { kind: 'unlink', from: args.from, to: args.to }
    case 'remove': return { kind: 'remove', building: args.building }
    default: return null
  }
}

export type CommandOptions = { model?: string; systemPrompt?: string }

export async function runCommand(client: ChatClient, input: CommandInput, opts: CommandOptions = {}): Promise<CommandResult> {
  const stage = STAGES[input.stageId]
  if (!stage) throw new Error(`unknown stage ${input.stageId}`)
  const ctx = { stage, heroClass: input.heroClass }
  const result: CommandResult = { actions: [], city: input.city, heroLine: '', rejected: [] }
  const messages: any[] = [
    { role: 'system', content: opts.systemPrompt ?? commandSystemPrompt(stage, input.heroClass, input.city, input.phase) },
    { role: 'user', content: input.transcript },
  ]

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let res: any
    try {
      res = await client.chat.completions.create(
        { model: opts.model ?? COMMAND_MODEL, reasoning_effort: 'minimal', messages, tools: commandTools(stage, input.phase) },
        { timeout: 20_000 },
      )
    } catch {
      if (round === 0) return { ...result, heroLine: COMMS_DOWN }
      break
    }
    if (res?.usage) {
      result.usage = {
        prompt: (result.usage?.prompt ?? 0) + (res.usage.prompt_tokens ?? 0),
        completion: (result.usage?.completion ?? 0) + (res.usage.completion_tokens ?? 0),
      }
    }
    const msg = res?.choices?.[0]?.message ?? {}
    if ((msg.content ?? '').trim()) result.heroLine = msg.content.trim()
    const calls: any[] = msg.tool_calls ?? []
    if (calls.length === 0) break

    const toolResults = calls.map((call) => ({ role: 'tool', tool_call_id: call.id, content: handleCall(call, input, stage, ctx, result) }))
    if (result.askBack || result.submit) break
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls }, ...toolResults)
  }

  if (input.phase === 'build' && result.actions.length > 0) result.city = autoWire(result.city)
  if (result.actions.length === 0 && result.rejected.length > 0 && !result.askBack) {
    result.heroLine = `I can't do that: ${result.rejected[0].reason}.`
  }
  if (!result.heroLine) result.heroLine = 'On it.'
  return result
}

/** Applies one tool call to `result` and returns the text sent back to the model. */
function handleCall(call: any, input: CommandInput, stage: Stage, ctx: { stage: Stage; heroClass: HeroClass }, result: CommandResult): string {
  const name: string = call.function?.name
  let args: any
  try {
    args = JSON.parse(call.function?.arguments || '{}')
  } catch {
    result.rejected.push({ action: { kind: name }, reason: 'I could not make sense of that order' })
    return 'rejected: I could not make sense of that order'
  }
  if (name === 'ask_back') {
    const choices: string[] = Array.isArray(args.choices) ? args.choices.map(String).slice(0, 3) : []
    const textbook = stage.textbookDefaults[args.topic]
    result.askBack = {
      question: String(args.question ?? ''),
      choices,
      default: textbook && choices.includes(textbook) ? textbook : textbook ?? choices.at(-1) ?? '',
    }
    return 'asked the player'
  }
  if (name === 'submit') {
    if (input.phase === 'build') result.submit = true
    return 'stress test starting'
  }
  let action = toAction(name, args)
  // The wildcard is free and used first: models often forget the flag.
  if (action && (action.kind === 'place' || action.kind === 'insert') && action.type === stage.wildcard && !result.city.wildcardUsed) {
    action = { ...action, wildcard: true }
  }
  if (!action) {
    result.rejected.push({ action: { kind: name }, reason: 'I could not make sense of that order' })
    return 'rejected: I could not make sense of that order'
  }
  if (input.phase === 'firefight' && !FIREFIGHT_TOOLS.has(action.kind)) {
    const reason = "there's no time to rewire roads mid-test"
    result.rejected.push({ action, reason })
    return `rejected: ${reason}`
  }
  const before = new Set(result.city.buildings.map((b) => b.id))
  const applied = applyAction(result.city, action, ctx)
  if (!applied.ok) {
    result.rejected.push({ action, reason: applied.reason })
    return `rejected: ${applied.reason}`
  }
  result.city = applied.city
  result.actions.push(action)
  const added = applied.city.buildings.find((b) => !before.has(b.id))
  return `ok${added ? `: built ${added.id}` : ''}. Coins left: ${applied.city.coins}`
}
