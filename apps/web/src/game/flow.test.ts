import { describe, expect, it } from 'vitest'
import { applyAction, autoWire, newCity, STAGES, type Action, type City } from '@uptime/core'
import {
  ASK_BACK_MS, FIREFIGHT_MS, advance, applyCommand, applyFirefight, beginBuild, initialGame, retry, setRival, setThinking,
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
  g = setRival(g, { city: RUSTY, lines: ['hi'], source: 'scripted' })
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
    g = setRival(g, { city: RUSTY, lines: [], source: 'scripted' })
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
