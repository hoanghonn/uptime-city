import type { Action, City, HeroClass } from '@uptime/core'
import { TYPE_COLOR } from '../city/Building'
import type { Phase } from './flow'
import { paletteItems } from './palette'

type Props = { stageId: string; city: City; heroClass: HeroClass; phase: Phase; onBuild(action: Action): void }

/** The clickable list of everything you can build, beside the city. Talking does the same thing. */
export function Palette({ stageId, city, heroClass, phase, onBuild }: Props) {
  const groups = paletteItems(stageId, city, heroClass, phase)
  return (
    <aside className="palette">
      <div className="palette-head">
        <b>Build</b>
        <span className="coins">{city.coins} coins</span>
      </div>
      <p className="hint">{phase === 'firefight' ? 'Pick one fix.' : 'Click to build, or just say it.'}</p>
      {groups.map((g) => (
        <section key={g.title} className="pal-group">
          <h4><span className="dot" style={{ background: TYPE_COLOR[g.type] }} />{g.title}</h4>
          {g.items.map((item) => (
            <button
              key={item.label}
              className="pal-item"
              disabled={item.disabled}
              title={item.disabled ? item.reason : item.note}
              onClick={() => item.action && onBuild(item.action)}
            >
              <span className="pal-row">
                <span className="pal-label">{item.label}</span>
                <span className="pal-cost">{item.cost === 0 ? 'free' : `${item.cost}`}</span>
              </span>
              <span className="pal-note">{item.disabled && item.reason && item.reason !== 'only while building' ? item.reason : item.note}</span>
            </button>
          ))}
        </section>
      ))}
    </aside>
  )
}
