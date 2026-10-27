import { describe, expect, it } from 'vitest'
import { newCity, STAGES } from '@uptime/core'
import { beginBuild, initialGame, startStage } from './flow'
import { nextStep, STEPS } from './guidance'

describe('what to do now', () => {
  it('has three steps', () => {
    expect(STEPS).toEqual(['Build', 'Stress test', 'Result'])
  })

  it('an empty city says where to start', () => {
    const g = beginBuild(startStage(initialGame(), 'shorty', 'generalist'))
    expect(nextStep(g, { rivalReady: true, voice: true })).toEqual({ step: 0, text: 'Your city is empty. Start with a load balancer: click it on the right, or hold Space and say it.' })
  })

  it('a city that cannot serve yet says what is missing', () => {
    let g = beginBuild(startStage(initialGame(), 'shorty', 'generalist'))
    g = { ...g, city: { ...g.city, buildings: [{ id: 'lb1', type: 'lb', option: 'round_robin', addons: [] }], links: [{ from: 'users', to: 'lb1' }] } }
    expect(nextStep(g, { rivalReady: true, voice: true }).text).toMatch(/API server/)
  })

  it('a working city says to submit', () => {
    let g = beginBuild(startStage(initialGame(), 'shorty', 'generalist'))
    g = {
      ...g,
      city: {
        ...g.city,
        buildings: [
          { id: 'lb1', type: 'lb', option: 'round_robin', addons: [] },
          { id: 'api1', type: 'api', option: 'large', addons: [] },
          { id: 'sql1', type: 'sql', option: 'standard', addons: [] },
        ],
        links: [{ from: 'users', to: 'lb1' }, { from: 'lb1', to: 'api1' }, { from: 'api1', to: 'sql1' }],
      },
    }
    expect(nextStep(g, { rivalReady: true, voice: true }).text).toMatch(/Submit/)
  })

  it('without a microphone it says to type', () => {
    const g = beginBuild(startStage(initialGame(), 'shorty', 'generalist'))
    expect(nextStep(g, { rivalReady: true, voice: false }).text).toMatch(/type it below/)
  })

  it('the test and result steps', () => {
    const g = startStage(initialGame(), 'shorty', 'generalist')
    expect(nextStep({ ...g, phase: 'test' }, { rivalReady: true, voice: true })).toMatchObject({ step: 1 })
    expect(nextStep({ ...g, phase: 'firefight' }, { rivalReady: true, voice: true }).text).toMatch(/one fix/)
    expect(nextStep({ ...g, phase: 'result' }, { rivalReady: true, voice: true })).toMatchObject({ step: 2 })
    expect(newCity(STAGES.shorty, 'generalist').buildings).toEqual([])
  })
})
