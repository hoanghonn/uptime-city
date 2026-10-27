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

export const RIVAL_SECONDS_PER_BUILDING = 4

/** The rival's city as it stands `seconds` into the build: one new building every few seconds, with its add-ons. */
export function rivalProgress(actions: Action[], stage: Stage, seconds: number): { city: City; built: number; total: number; done: boolean } {
  const total = actions.filter((a) => a.kind === 'place' || a.kind === 'insert').length
  const allowed = Math.min(total, Math.floor(seconds / RIVAL_SECONDS_PER_BUILDING))
  let city = newCity(stage, stage.rivalClass)
  let built = 0
  for (const a of actions) {
    const isBuilding = a.kind === 'place' || a.kind === 'insert'
    if (isBuilding && built >= allowed) break
    const r = applyAction(city, a, { stage, heroClass: stage.rivalClass })
    if (r.ok) { city = r.city; if (isBuilding) built++ }
  }
  return { city: autoWire(city), built, total, done: built >= total }
}
