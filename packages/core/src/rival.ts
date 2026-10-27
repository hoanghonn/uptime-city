import { applyAction, newCity } from './actions'
import type { Action, City, Stage } from './types'
import { autoWire } from './wire'

export type RivalResult = { actions: Action[]; city: City; lines: string[]; source: 'live' | 'scripted' }

/** The stage's hand-written rival build: used when the live rival is slow, broken or too strong. */
export function scriptedRival(stage: Stage): RivalResult {
  let city = newCity(stage, stage.rivalClass)
  for (const a of stage.rivalScripted) {
    const r = applyAction(city, a, { stage, heroClass: stage.rivalClass })
    if (r.ok) city = r.city
  }
  return { actions: stage.rivalScripted, city: autoWire(city), lines: [stage.rivalTaunt], source: 'scripted' }
}
