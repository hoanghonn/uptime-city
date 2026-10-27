// Dev demo (/?demo, add &t=16 to freeze at a second): a scripted stage 1 match - Nova with the firefight cache vs Rusty - for screenshots and the README GIF.
import { useEffect, useMemo, useState } from 'react'
import { applyAction, autoWire, newCity, simulate, STAGES, type Action, type City, type HeroClass } from '@uptime/core'
import { City3D } from './city/City3D'

const stage = STAGES.shorty
function build(actions: Action[], heroClass: HeroClass): City {
  let city = newCity(stage, heroClass)
  for (const a of actions) {
    const r = applyAction(city, a, { stage, heroClass })
    if (r.ok) city = r.city
  }
  return autoWire(city)
}
const NOVA = build(
  [
    { kind: 'place', type: 'lb', option: 'round_robin' },
    { kind: 'place', type: 'api', option: 'large' },
    { kind: 'place', type: 'api', option: 'large' },
    { kind: 'place', type: 'sql', option: 'standard' },
    { kind: 'addon', building: 'sql1', addon: 'index' },
    { kind: 'addon', building: 'sql1', addon: 'read_replica' },
  ],
  'generalist',
)
const FIX: Action = { kind: 'insert', type: 'cache', option: 'standard', after: 'lb1', wildcard: true }
const RUSTY = build(stage.rivalScripted, 'data_keeper')

export default function Demo() {
  const params = new URLSearchParams(location.search)
  const fixAt = Number(params.get('fix') ?? 17)
  const frozen = params.get('t')
  const nova = useMemo(() => simulate(NOVA, stage, 'generalist', { firefight: { atSecond: fixAt, action: FIX } }), [fixAt])
  const rusty = useMemo(() => simulate(RUSTY, stage, 'data_keeper'), [])
  const novaFixed = useMemo(() => { const r = applyAction(NOVA, FIX, { stage, heroClass: 'generalist' }); return r.ok ? r.city : NOVA }, [])
  const [i, setI] = useState(frozen ? Math.round(Number(frozen) * 10) : 0)
  useEffect(() => {
    if (frozen) return
    const id = setInterval(() => setI((x) => (x + 1) % nova.ticks.length), 100)
    return () => clearInterval(id)
  }, [nova, frozen])
  const t = i / 10
  const chaos = t >= 15 && t < 16.5
  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr', background: '#050b1a', color: '#e2e8f0', font: '14px system-ui' }}>
      <div style={{ padding: 10, display: 'flex', gap: 16 }}>
        <b>STAGE 1 · Shorty</b><span>t = {t.toFixed(1)} s</span>
        {t >= 15 && <span style={{ background: '#7c2d12', padding: '2px 8px', borderRadius: 4 }}>CHAOS: Celebrity tweet</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <City3D city={t >= fixAt ? novaFixed : NOVA} tick={nova.ticks[i]} chaos={chaos} label={`Nova (you) · ${Math.round((nova.ticks[i].served / nova.ticks[i].offered) * 100)}%`} accent="#5eead4" />
        <City3D city={RUSTY} tick={rusty.ticks[i]} chaos={chaos} label={`Rusty · ${Math.round((rusty.ticks[i].served / rusty.ticks[i].offered) * 100)}%`} accent="#f87171" />
      </div>
    </div>
  )
}
