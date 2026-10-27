import { describe, expect, it } from 'vitest'
import { ACADEMY, applyAction, autoWire, newCity, simulate, STAGES, STAGE_ORDER, windowServed, type Action, type Stage } from '../src'

function run(stage: Stage, build: Action[]) {
  let city = newCity(stage, 'generalist')
  for (const a of build) {
    const r = applyAction(city, a, { stage, heroClass: 'generalist' })
    if (!r.ok) throw new Error(`${stage.id}: ${a.kind} refused: ${r.reason}`)
    city = autoWire(r.city)
  }
  return { city, sim: simulate(city, stage, 'generalist') }
}

describe('academy', () => {
  it('has six lessons, first on the stage map, each a question with two choices', () => {
    expect(ACADEMY).toHaveLength(6)
    expect(STAGES[STAGE_ORDER[0]].track).toBe('academy')
    for (const s of ACADEMY) {
      expect(s.experiment?.choices).toHaveLength(2)
      expect(s.experiment?.question).toMatch(/\?$/)
      expect(s.firefight).toBe(false)
    }
  })

  for (const s of ACADEMY) {
    it(`${s.id}: both choices fit the budget`, () => {
      for (const c of s.experiment!.choices) expect(run(s, c.build).city.coins).toBeGreaterThanOrEqual(0)
    })
  }

  for (const s of ACADEMY.filter((x) => x.experiment!.twoSided)) {
    it(`${s.id}: a real trade-off - each choice wins at least one moment`, () => {
      const [a, b] = s.experiment!.choices.map((c) => run(s, c.build).sim)
      const windows = s.experiment!.moments.map((m) => [windowServed(a, m.from, m.to), windowServed(b, m.from, m.to)])
      expect(windows.some(([x, y]) => x > y + 0.05), `${s.id}: A never wins`).toBe(true)
      expect(windows.some(([x, y]) => y > x + 0.05), `${s.id}: B never wins`).toBe(true)
    })
  }

  it('windowServed is the share served between two seconds', () => {
    const s = ACADEMY[0]
    const { sim } = run(s, s.experiment!.choices[0].build)
    expect(windowServed(sim, 0, 30)).toBeCloseTo(sim.servedPct, 5)
  })
})
