import { describe, expect, it } from 'vitest'
import { BUILD_SECONDS, createCrew, crewStep, syncCrew } from './builder'

const pos = { users: [-9, 0] as [number, number], lb1: [-4, 0] as [number, number], api1: [0, 0] as [number, number] }

describe('builder crew', () => {
  it('queues new buildings in the order they appear, and drops removed ones', () => {
    const crew = createCrew([-9, 0])
    syncCrew(crew, ['lb1', 'api1'])
    expect(crew.queue).toEqual(['lb1', 'api1'])
    syncCrew(crew, ['api1'])
    expect(crew.queue).toEqual(['api1'])
    syncCrew(crew, ['api1', 'sql1'])
    expect(crew.queue).toEqual(['api1', 'sql1'])
  })

  it('walks to the site, then builds for a moment, then moves on', () => {
    const crew = createCrew([-9, 0])
    syncCrew(crew, ['lb1', 'api1'])
    let t = 0
    const step = (dt: number) => { t += dt; crewStep(crew, pos, t, dt) }
    step(0.1)
    expect(crew.started.has('lb1')).toBe(false)
    for (let i = 0; i < 40 && !crew.started.has('lb1'); i++) step(0.05)
    expect(crew.started.has('lb1')).toBe(true)
    expect(crew.mode).toBe('building')
    for (let i = 0; i < Math.ceil(BUILD_SECONDS / 0.05) + 1; i++) step(0.05)
    expect(crew.queue).toEqual(['api1'])
    for (let i = 0; i < 40; i++) step(0.05)
    expect(crew.started.has('api1')).toBe(true)
  })

  it('a building already standing when the crew is created is not rebuilt', () => {
    const crew = createCrew([-9, 0], ['lb1'])
    expect(crew.started.get('lb1')).toBe(-Infinity)
    syncCrew(crew, ['lb1', 'api1'])
    expect(crew.queue).toEqual(['api1'])
  })

  it('idles when there is nothing to build', () => {
    const crew = createCrew([-9, 0])
    crewStep(crew, pos, 1, 0.1)
    expect(crew.mode).toBe('idle')
  })
})
