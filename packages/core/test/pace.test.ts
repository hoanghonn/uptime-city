import { describe, expect, it } from 'vitest'
import { rivalProgress, RIVAL_SECONDS_PER_BUILDING, scriptedRival, STAGES } from '../src'

describe('rival pace', () => {
  const stage = STAGES.shorty
  const rival = scriptedRival(stage)

  it('starts empty and adds one building every few seconds', () => {
    expect(rivalProgress(rival.actions, stage, 0).city.buildings).toHaveLength(0)
    expect(rivalProgress(rival.actions, stage, RIVAL_SECONDS_PER_BUILDING + 0.01).city.buildings).toHaveLength(1)
    expect(rivalProgress(rival.actions, stage, RIVAL_SECONDS_PER_BUILDING * 3 + 0.01).city.buildings).toHaveLength(3)
  })

  it('add-ons and roads come with their building, and progress reports the count', () => {
    const p = rivalProgress(rival.actions, stage, 999)
    expect(p.city.buildings.map((b) => b.id)).toEqual(rival.city.buildings.map((b) => b.id))
    expect(p.city.links.length).toBe(rival.city.links.length)
    expect(p).toMatchObject({ built: 4, total: 4, done: true })
  })

  it('takes a while: the stage 1 rival needs at least 12 seconds', () => {
    expect(rivalProgress(rival.actions, stage, 11.9).done).toBe(false)
  })
})
