import { CLASSES } from '@uptime/core'
import type { SavedHero } from './heroStore'

export function HeroCardView({ hero }: { hero: SavedHero }) {
  const cls = CLASSES[hero.heroClass]
  return (
    <div className="hero-card">
      {hero.portrait ? (
        <img className="portrait" src={hero.portrait} alt={`Portrait of ${hero.nickname}`} />
      ) : (
        <div className="portrait placeholder">Painting your portrait...</div>
      )}
      <div className="hero-info">
        <span className="num">{cls.name}</span>
        <h3>{hero.nickname}</h3>
        <p className="quirk">{hero.quirk}</p>
        <p className="catch">"{hero.catchphrase}"</p>
        <p className="perk">{cls.perk}</p>
        <p className="weak">{cls.weakness}</p>
      </div>
    </div>
  )
}
