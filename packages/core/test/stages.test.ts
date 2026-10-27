import { describe, expect, it } from 'vitest'
import { applyAction, autoWire, compare, newCity, simulate, STAGES, STAGE_ORDER, type Stage } from '../src'

function play(stage: Stage, actions = stage.reference ?? [], heroClass = 'generalist' as const) {
  let city = newCity(stage, heroClass)
  for (const a of actions) {
    const r = applyAction(city, a, { stage, heroClass })
    if (!r.ok) throw new Error(`${stage.id}: ${a.kind} ${'type' in a ? a.type : ''} refused: ${r.reason}`)
    city = autoWire(r.city)
  }
  return city
}

describe('every classic stage', () => {
  const classics = STAGE_ORDER.map((id) => STAGES[id]).filter((s) => s.track === 'classic')

  it('there are eleven, each with a reference build and guide entries', () => {
    expect(classics).toHaveLength(11)
    for (const s of classics) {
      expect(s.reference?.length, s.id).toBeGreaterThan(0)
      expect(s.guide?.length, s.id).toBeGreaterThan(0)
    }
  })

  for (const id of STAGE_ORDER.filter((x) => STAGES[x].track === 'classic')) {
    it(`${id}: the reference build fits the budget, clears 80%, and beats a rival that stays under its limit`, () => {
      const stage = STAGES[id]
      const ref = simulate(play(stage), stage, 'generalist')
      let rivalCity = newCity(stage, stage.rivalClass)
      for (const a of stage.rivalScripted) {
        const r = applyAction(rivalCity, a, { stage, heroClass: stage.rivalClass })
        expect(r.ok, `${id} rival ${a.kind}`).toBe(true)
        if (r.ok) rivalCity = r.city
      }
      const rival = simulate(autoWire(rivalCity), stage, stage.rivalClass)
      expect(ref.servedPct, `${id} reference`).toBeGreaterThanOrEqual(0.8)
      expect(rival.servedPct, `${id} rival`).toBeLessThanOrEqual(stage.rivalMaxServed)
      expect(compare(ref, rival), `${id} ref beats rival`).toBe(1)
    })
  }
})
