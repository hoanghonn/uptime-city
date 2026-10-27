import type { Action, BuildingType, City, HeroClass } from '@uptime/core'
import { TYPE_COLOR } from '../city/Building'
import type { Phase } from './flow'
import { paletteItems } from './palette'

type Props = { stageId: string; city: City; heroClass: HeroClass; phase: Phase; onBuild(action: Action): void; onLearn?(type: BuildingType): void }

/** The clickable list of everything you can build, beside the city. Talking does the same thing. */
export function Palette({ stageId, city, heroClass, phase, onBuild, onLearn }: Props) {
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
          <h4><span className="dot" style={{ background: TYPE_COLOR[g.type] }} />{g.title}{onLearn && <button className="learn-btn" title="How it works" onClick={() => onLearn(g.type)}>?</button>}</h4>
          {g.items.map((item) => (
            <button
              key={item.label}
              className="pal-item"
              disabled={item.disabled}
              title={item.disabled ? item.reason : undefined}
              onClick={() => item.action && onBuild(item.action)}
            >
              <span className="pal-row">
                <span className="pal-label">{item.label}</span>
                <span className="pal-cost">{item.cost === 0 ? 'free' : `${item.cost}`}</span>
              </span>
              {item.disabled && item.reason && item.reason !== 'only while building' && (
                <span className="pal-why">{item.reason === 'not enough coins' ? `Need ${item.cost - city.coins} more coins` : item.reason}</span>
              )}
              {!(item.disabled && item.reason && item.reason !== 'only while building') && (
                <>
                  <span className="pal-pro">+ {item.pro}</span>
                  <span className="pal-con">− {item.con}</span>
                </>
              )}
            </button>
          ))}
        </section>
      ))}
    </aside>
  )
}
