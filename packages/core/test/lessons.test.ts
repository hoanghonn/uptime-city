import { describe, expect, it } from 'vitest'
import { applyAction, autoWire, newCity, simulate, STAGES, type Stage } from '../src'

function rivalOf(stage: Stage) {
  let c = newCity(stage, stage.rivalClass)
  for (const a of stage.rivalScripted) { const r = applyAction(c, a, { stage, heroClass: stage.rivalClass }); if (r.ok) c = r.city }
  return simulate(autoWire(c), stage, stage.rivalClass)
}

describe('lessons say why the database broke, and point to the field guide', () => {
  it('too many writes: queues and NoSQL', () => {
    const r = rivalOf(STAGES.crawlbot)
    expect(r.lesson).toMatch(/writes/)
    expect(r.lessonGuide).toBe('queues')
  })

  it('photos in the database: object storage and a CDN', () => {
    const r = rivalOf(STAGES.streamtube)
    expect(r.lesson).toMatch(/photos|videos|big files/i)
    expect(r.lessonGuide).toBe('storage')
  })

  it('too many reads: replicas, an index or a cache', () => {
    const r = rivalOf(STAGES.seek)
    expect(r.lesson).toMatch(/reads/)
    expect(r.lessonGuide).toBe('indexes')
  })

  it('overloaded API servers point to caching', () => {
    expect(rivalOf(STAGES.shorty).lessonGuide).toBe('caching')
  })

  it('a dead server under round robin points to load balancing', () => {
    expect(rivalOf(STAGES.chatter).lessonGuide).toBe('load-balancing')
  })
})
