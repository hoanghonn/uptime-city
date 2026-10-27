import { describe, expect, it } from 'vitest'
import { applyAction, autoWire, newCity, simulate, STAGES, type Action, type City, type HeroClass } from '../src'

const stage = STAGES.chatter
function build(actions: Action[], heroClass: HeroClass = 'generalist'): City {
  let city = newCity(stage, heroClass)
  for (const a of actions) {
    const r = applyAction(city, a, { stage, heroClass })
    if (!r.ok) throw new Error(`${a.kind}: ${r.reason}`)
    city = r.city
  }
  return autoWire(city)
}

const reference: Action[] = [
  { kind: 'place', type: 'lb', option: 'round_robin' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'api', option: 'large' },
  { kind: 'place', type: 'sql', option: 'standard' },
  { kind: 'addon', building: 'sql1', addon: 'index' },
  { kind: 'place', type: 'queue', option: 'standard' },
  { kind: 'place', type: 'worker', option: 'standard' },
  { kind: 'place', type: 'worker', option: 'standard' },
  { kind: 'link', from: 'api1', to: 'queue1' },
  { kind: 'link', from: 'api2', to: 'queue1' },
  { kind: 'link', from: 'queue1', to: 'worker1' },
  { kind: 'link', from: 'queue1', to: 'worker2' },
  { kind: 'link', from: 'worker1', to: 'sql1' },
  { kind: 'link', from: 'worker2', to: 'sql1' },
]
const at = (r: ReturnType<typeof simulate>, s: number) => r.ticks.find((t) => Math.abs(t.t - s) < 1e-6)!

describe('stage 2 - Chatter', () => {
  it('is a write-heavy stage that unlocks the queue and worker', () => {
    expect(stage.baseLoad.readRatio).toBeLessThanOrEqual(0.5)
    expect(stage.unlocked).toEqual(expect.arrayContaining(['queue', 'worker']))
  })

  it('writes through a queue are not lost while it has space', () => {
    const r = simulate(build(reference), stage, 'generalist')
    expect(at(r, 5).dropped).toBeCloseTo(0, 5)
    expect(at(r, 5).load.queue1).toBeLessThan(1)
  })

  it('without a queue, SQL alone drops writes', () => {
    const city = build(reference.filter((a) => !('type' in a && (a.type === 'queue' || a.type === 'worker')) && !(a.kind === 'link' && /queue|worker/.test(a.from + a.to))))
    const r = simulate(city, stage, 'generalist')
    expect(at(r, 5).dropped).toBeGreaterThan(0)
    expect(at(r, 5).load.sql1).toBeGreaterThan(1)
  })

  it('the chaos card kills one API server', () => {
    const r = simulate(build(reference), stage, 'generalist')
    expect(Object.keys(at(r, 11).load)).toContain('api1')
    expect(at(r, 13).load.api1).toBe(0)
    expect(at(r, 13).dropped).toBeGreaterThan(0)
  })

  it('a firefight that places another API server is wired in automatically and helps', () => {
    const plain = simulate(build(reference), stage, 'generalist')
    const fixed = simulate(build(reference), stage, 'generalist', { firefight: { atSecond: 12, action: { kind: 'place', type: 'api', option: 'small' } } })
    expect(fixed.servedPct).toBeGreaterThan(plain.servedPct)
  })

  it('the scripted rival is beatable by the reference build', () => {
    const rival = simulate(build(stage.rivalScripted, stage.rivalClass), stage, stage.rivalClass)
    const ref = simulate(build(reference), stage, 'generalist')
    expect(rival.servedPct).toBeLessThanOrEqual(stage.rivalMaxServed)
    expect(ref.servedPct).toBeGreaterThan(rival.servedPct)
  })

  it('when a server dies under round robin, the lesson is about routing around it', () => {
    const r = simulate(build(reference), stage, 'generalist')
    expect(r.lesson).toMatch(/least connections/i)
  })

  it('least connections routes around the dead server', () => {
    const rr = simulate(build(reference), stage, 'generalist')
    const lc = simulate(build(reference.map((a) => (a.kind === 'place' && a.type === 'lb' ? { ...a, option: 'least_conn' } : a))), stage, 'generalist')
    expect(lc.servedPct).toBeGreaterThan(rr.servedPct + 0.1)
  })

  it('the rival is told to use round robin and no queue', () => {
    expect(stage.rivalBlindSpot).toMatch(/round robin/)
    expect(stage.rivalBlindSpot).toMatch(/never build a queue/i)
  })

  it('the reference build fits the budget with room for a firefight', () => {
    expect(build(reference).coins).toBeGreaterThanOrEqual(10)
  })
})
