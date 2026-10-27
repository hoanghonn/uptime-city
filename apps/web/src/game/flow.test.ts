import { describe, expect, it } from 'vitest'
import { applyAction, autoWire, newCity, STAGES, type Action, type City } from '@uptime/core'
import {
  ASK_BACK_MS, FIREFIGHT_MS, advance, checklist, chooseSide, clickBuild, replayWindow, startReplay, applyCommand, applyFirefight, beginBuild, initialGame, retry, setRival, setThinking,
  startStage, startTest, tickClock, type Game,
} from './flow'

const stage = STAGES.shorty
function cityOf(actions: Action[], heroClass = 'generalist' as const): City {
  let city = newCity(stage, heroClass)
  for (const a of actions) {
    const r = applyAction(city, a, { stage, heroClass })
    if (r.ok) city = r.city
  }
  return autoWire(city)
}
const NOVA = cityOf([
  { kind: 'place', type: 'lb', option: 'round_robin' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'sql', option: 'standard' },
])
const RUSTY = cityOf(stage.rivalScripted, 'data_keeper' as any)

function building(): Game {
  let g = beginBuild(startStage(initialGame(), 'shorty', 'generalist'))
  g = setRival(g, { city: RUSTY, lines: ['hi'], source: 'scripted', actions: [] })
  return applyCommand(g, { city: NOVA, heroLine: 'Built!', actions: [], rejected: [] }, 'build it').game
}

describe('game flow', () => {
  it('starting a stage shows the briefing with a fresh city', () => {
    const g = startStage(initialGame(), 'shorty', 'firefighter')
    expect(g.phase).toBe('briefing')
    expect(g.city.coins).toBe(90)
  })

  it('an ask-back timeout answers with the textbook default', () => {
    let g = building()
    g = applyCommand(g, { city: g.city, heroLine: 'Where?', actions: [], rejected: [], askBack: { question: 'Front or behind?', choices: ['front', 'behind'], default: 'behind' } }, 'cache').game
    expect(g.askBack?.remainingMs).toBe(ASK_BACK_MS)
    const step = tickClock(g, ASK_BACK_MS + 1)
    expect(step.effect).toEqual({ type: 'answer', text: 'cache - behind' })
    expect(step.game.askBack).toBeNull()
  })

  it('the clock pauses while the hero is thinking', () => {
    let g = building()
    g = applyCommand(g, { city: g.city, heroLine: 'Where?', actions: [], rejected: [], askBack: { question: 'q', choices: ['a', 'b'], default: 'b' } }, 'cache').game
    g = setThinking(g, true)
    const step = tickClock(g, 10_000)
    expect(step.effect).toBeNull()
    expect(step.game.askBack?.remainingMs).toBe(ASK_BACK_MS)
  })

  it('the clock pauses while the player is talking or typing', () => {
    let g = advance(startTest(building()), 16)
    const step = tickClock(g, 10_000, { holding: true })
    expect(step.game.phase).toBe('firefight')
    expect(step.game.firefight?.remainingMs).toBe(FIREFIGHT_MS)
    expect(FIREFIGHT_MS).toBe(8000)
  })

  it('the test pauses at the chaos card for a firefight, then resumes at the same second', () => {
    let g = startTest(building())
    expect(g.phase).toBe('test')
    g = advance(g, 15.3)
    expect(g.phase).toBe('firefight')
    expect(g.t).toBe(15)
    expect(g.firefight?.remainingMs).toBe(FIREFIGHT_MS)
    g = applyFirefight(g, { kind: 'insert', type: 'cache', option: 'standard', after: 'lb1', wildcard: true })
    expect(g.phase).toBe('test')
    expect(g.t).toBe(15)
    expect(g.nova!.servedPct).toBeGreaterThan(0.85)
    g = advance(g, 20)
    expect(g.phase).toBe('result')
  })

  it('a firefight timeout resumes the test with no action', () => {
    let g = advance(startTest(building()), 16)
    const step = tickClock(g, FIREFIGHT_MS + 1)
    expect(step.game.phase).toBe('test')
    expect(step.game.firefightUsed).toBe(true)
  })

  it('a win marks the stage cleared and every stage stays selectable', () => {
    let g = advance(startTest(building()), 16)
    g = applyFirefight(g, { kind: 'insert', type: 'cache', option: 'standard', after: 'lb1', wildcard: true })
    g = advance(g, 30)
    expect(g.outcome).toBe('win')
    expect(g.cleared.shorty).toBe(true)
    expect(startStage(g, 'shorty', 'generalist').phase).toBe('briefing')
  })

  it('a loss offers a retry of the same stage with a fresh city', () => {
    let g = beginBuild(startStage(initialGame(), 'shorty', 'generalist'))
    g = setRival(g, { city: RUSTY, lines: [], source: 'scripted', actions: [] })
    g = advance(startTest(g), 16)
    g = applyFirefight(g, null)
    g = advance(g, 30)
    expect(g.outcome).toBe('lose')
    const again = retry(g)
    expect(again.phase).toBe('briefing')
    expect(again.stageId).toBe('shorty')
    expect(again.city.buildings).toEqual([])
  })

  it('cannot start the test before the rival has built', () => {
    const g = beginBuild(startStage(initialGame(), 'shorty', 'generalist'))
    expect(startTest(g).phase).toBe('build')
  })

  it('logs hero lines and rejected orders', () => {
    const g = applyCommand(building(), { city: NOVA, heroLine: 'Nope.', actions: [], rejected: [{ action: { kind: 'place' }, reason: 'not enough coins' }] }, 'more').game
    expect(g.log.slice(-2)).toEqual([
      { who: 'hero', text: 'Nope.' },
      { who: 'system', text: "Couldn't do that: not enough coins" },
    ])
  })
})

describe('replay of the worst moment', () => {
  it('the window is centred on the worst moment and clamped to the test', () => {
    expect(replayWindow(16)).toEqual([13, 19])
    expect(replayWindow(1)).toEqual([0, 6])
    expect(replayWindow(29.5)).toEqual([24, 30])
  })

  it('a replay plays the window and returns to the result screen', () => {
    let g = beginBuild(startStage(initialGame(), 'shorty', 'generalist'))
    g = setRival(g, { city: RUSTY, lines: [], source: 'scripted', actions: [] })
    g = advance(startTest(g), 16)
    g = applyFirefight(g, null)
    g = advance(g, 30)
    const worst = g.nova!.worstMoment.second
    let r = startReplay(g)
    expect(r.phase).toBe('replay')
    expect(r.t).toBe(replayWindow(worst)[0])
    r = advance(r, 3)
    expect(r.phase).toBe('replay')
    r = advance(r, 3.1)
    expect(r.phase).toBe('result')
    expect(r.outcome).toBe(g.outcome)
  })
})

describe('click to build', () => {
  it('in the build phase it applies the action and wires the city', () => {
    let g = beginBuild(startStage(initialGame(), 'shorty', 'generalist'))
    g = clickBuild(g, { kind: 'place', type: 'lb', option: 'round_robin' })
    g = clickBuild(g, { kind: 'place', type: 'api', option: 'large' })
    expect(g.city.links).toEqual([{ from: 'users', to: 'lb1' }, { from: 'lb1', to: 'api1' }])
    expect(g.city.coins).toBe(65)
    expect(g.log.at(-1)).toEqual({ who: 'you', text: 'Built: API server, large' })
  })

  it('a refused click explains why and changes nothing', () => {
    const g = beginBuild(startStage(initialGame(), 'shorty', 'generalist'))
    const after = clickBuild(g, { kind: 'addon', building: 'sql1', addon: 'index' })
    expect(after.city).toEqual(g.city)
    expect(after.log.at(-1)).toEqual({ who: 'system', text: "Couldn't do that: no building called sql1" })
  })

  it('during the firefight it is the one firefight command', () => {
    let g = advance(startTest(building()), 16)
    g = clickBuild(g, { kind: 'insert', type: 'cache', option: 'standard', after: 'lb1', wildcard: true })
    expect(g.phase).toBe('test')
    expect(g.firefightUsed).toBe(true)
    expect(g.nova!.servedPct).toBeGreaterThan(0.85)
  })
})

describe('academy experiments', () => {
  it('picking a side builds the other choice on the right and remembers your pick', () => {
    let g = startStage(initialGame(), 'bigger_or_more', 'generalist')
    g = chooseSide(g, 0)
    expect(g.phase).toBe('build')
    expect(g.side).toBe(0)
    expect(g.rival?.source).toBe('scripted')
    expect(g.rival?.city.buildings.filter((b) => b.type === 'api')).toHaveLength(5)
  })

  it('there is no firefight pause in an experiment, and the test runs to the end', () => {
    let g = chooseSide(startStage(initialGame(), 'bigger_or_more', 'generalist'), 0)
    g = startTest(g)
    g = advance(g, 25)
    expect(g.phase).toBe('test')
    g = advance(g, 10)
    expect(g.phase).toBe('result')
  })

  it('a stage with no chaos card never pauses for a firefight', () => {
    let g = chooseSide(startStage(initialGame(), 'path', 'generalist'), 0)
    g = advance(startTest(g), 31)
    expect(g.phase).toBe('result')
  })

  it('the checklist ticks off what you have built', () => {
    const g = chooseSide(startStage(initialGame(), 'bigger_or_more', 'generalist'), 0)
    const before = checklist(g)
    expect(before.map((i) => i.label)).toEqual(['Load balancer: least connections', '2 x API server: large', 'SQL database', 'Index on the SQL database'])
    expect(before.every((i) => !i.done)).toBe(true)
    let h = clickBuild(g, { kind: 'place', type: 'lb', option: 'least_conn' })
    h = clickBuild(h, { kind: 'place', type: 'api', option: 'large' })
    expect(checklist(h).map((i) => i.done)).toEqual([true, false, false, false])
  })
})
