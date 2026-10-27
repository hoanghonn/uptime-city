import { compare, newCity, simulate, STAGES, TEST_SECONDS, type Action, type City, type HeroClass, type SimResult } from '@uptime/core'

export const ASK_BACK_MS = 3000
export const FIREFIGHT_MS = 8000

export type Phase = 'map' | 'briefing' | 'build' | 'test' | 'firefight' | 'result' | 'replay'
export type LogLine = { who: 'you' | 'hero' | 'rival' | 'system'; text: string }
export type Rival = { city: City; lines: string[]; source: 'live' | 'scripted' }
export type CommandResponse = {
  city: City
  heroLine: string
  actions: Action[]
  rejected: { action: { kind: string }; reason: string }[]
  askBack?: { question: string; choices: string[]; default: string }
  submit?: boolean
}

export type Game = {
  phase: Phase
  stageId: string
  heroClass: HeroClass
  city: City
  rival: Rival | null
  thinking: boolean
  askBack: { question: string; choices: string[]; default: string; original: string; remainingMs: number } | null
  /** seconds into the stress test */
  t: number
  nova: SimResult | null
  rivalSim: SimResult | null
  firefight: { atSecond: number; remainingMs: number } | null
  firefightUsed: boolean
  firefightAction: Action | null
  outcome: 'win' | 'lose' | 'draw' | null
  cleared: Record<string, boolean>
  log: LogLine[]
  /** end of the replay window, while replaying */
  replayEnd: number
}

export type Effect = { type: 'answer'; text: string } | null

export function initialGame(): Game {
  return {
    phase: 'map', stageId: 'shorty', heroClass: 'generalist', city: newCity(STAGES.shorty, 'generalist'), rival: null,
    thinking: false, askBack: null, t: 0, nova: null, rivalSim: null, firefight: null, firefightUsed: false,
    firefightAction: null, outcome: null, cleared: {}, log: [], replayEnd: 0,
  }
}

export function startStage(g: Game, stageId: string, heroClass: HeroClass): Game {
  const stage = STAGES[stageId]
  return { ...initialGame(), cleared: g.cleared, phase: 'briefing', stageId, heroClass, city: newCity(stage, heroClass) }
}

export const beginBuild = (g: Game): Game => ({ ...g, phase: 'build' })
export const setRival = (g: Game, rival: Rival): Game => ({
  ...g,
  rival,
  log: [...g.log, ...rival.lines.map((text) => ({ who: 'rival' as const, text }))],
})
export const setThinking = (g: Game, thinking: boolean): Game => ({ ...g, thinking })
export const say = (g: Game, line: LogLine): Game => ({ ...g, log: [...g.log, line] })

export function applyCommand(g: Game, res: CommandResponse, transcript: string): { game: Game; startTest: boolean } {
  const log = [...g.log, { who: 'hero' as const, text: res.heroLine }]
  for (const r of res.rejected) log.push({ who: 'system', text: `Couldn't do that: ${r.reason}` })
  const askBack = res.askBack ? { ...res.askBack, original: transcript, remainingMs: ASK_BACK_MS } : null
  return { game: { ...g, city: res.city, log, askBack, thinking: false }, startTest: !!res.submit }
}

/** Builds the answer transcript for an ask-back choice. */
export const answerText = (original: string, choice: string) => `${original} - ${choice}`

function chaosAt(stageId: string): number {
  return Math.min(...STAGES[stageId].chaos.map((c) => c.at), TEST_SECONDS)
}

export function startTest(g: Game): Game {
  if (!g.rival || g.phase !== 'build') return g
  const stage = STAGES[g.stageId]
  return {
    ...g,
    phase: 'test',
    t: 0,
    askBack: null,
    nova: simulate(g.city, stage, g.heroClass),
    rivalSim: simulate(g.rival.city, stage, stage.rivalClass),
    firefightUsed: false,
    firefightAction: null,
  }
}

function finish(g: Game): Game {
  if (!g.nova || !g.rivalSim) return g
  const c = compare(g.nova, g.rivalSim)
  const outcome = c > 0 ? 'win' : c < 0 ? 'lose' : 'draw'
  return { ...g, phase: 'result', t: TEST_SECONDS, outcome, cleared: outcome === 'win' ? { ...g.cleared, [g.stageId]: true } : g.cleared }
}

/** Six seconds around the worst moment, inside the 30-second test. */
export function replayWindow(worstSecond: number): [number, number] {
  const start = Math.min(Math.max(0, worstSecond - 3), TEST_SECONDS - 6)
  return [start, start + 6]
}

export function startReplay(g: Game): Game {
  if (g.phase !== 'result' || !g.nova) return g
  const [start, end] = replayWindow(g.nova.worstMoment.second)
  return { ...g, phase: 'replay', t: start, replayEnd: end }
}

/** Moves the stress test (or a replay) forward; the test stops at the chaos card for the one firefight command. */
export function advance(g: Game, seconds: number): Game {
  if (g.phase === 'replay') {
    const t = g.t + seconds
    return t >= g.replayEnd ? { ...g, phase: 'result', t: TEST_SECONDS } : { ...g, t }
  }
  if (g.phase !== 'test') return g
  const at = chaosAt(g.stageId)
  const t = g.t + seconds
  if (!g.firefightUsed && g.t < at && t >= at) {
    return { ...g, t: at, phase: 'firefight', firefight: { atSecond: at, remainingMs: FIREFIGHT_MS } }
  }
  if (t >= TEST_SECONDS) return finish({ ...g, t: TEST_SECONDS })
  return { ...g, t }
}

export function applyFirefight(g: Game, action: Action | null): Game {
  if (g.phase !== 'firefight' || !g.firefight) return g
  const stage = STAGES[g.stageId]
  const nova = action ? simulate(g.city, stage, g.heroClass, { firefight: { atSecond: g.firefight.atSecond, action } }) : g.nova
  return { ...g, phase: 'test', nova, firefight: null, firefightUsed: true, firefightAction: action, thinking: false }
}

/** Counts down the ask-back and firefight clocks, but never while the hero is thinking or the player is talking or typing. */
export function tickClock(g: Game, ms: number, opts: { holding?: boolean } = {}): { game: Game; effect: Effect } {
  if (g.thinking || opts.holding) return { game: g, effect: null }
  if (g.askBack) {
    const remainingMs = g.askBack.remainingMs - ms
    if (remainingMs <= 0) {
      return { game: { ...g, askBack: null }, effect: { type: 'answer', text: answerText(g.askBack.original, g.askBack.default) } }
    }
    return { game: { ...g, askBack: { ...g.askBack, remainingMs } }, effect: null }
  }
  if (g.phase === 'firefight' && g.firefight) {
    const remainingMs = g.firefight.remainingMs - ms
    if (remainingMs <= 0) return { game: applyFirefight(g, null), effect: null }
    return { game: { ...g, firefight: { ...g.firefight, remainingMs } }, effect: null }
  }
  return { game: g, effect: null }
}

export const retry = (g: Game): Game => startStage(g, g.stageId, g.heroClass)
export const toMap = (g: Game): Game => ({ ...initialGame(), cleared: g.cleared })
