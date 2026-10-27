import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { HeroCardView } from './HeroCardView'
import { loadHero, saveHero, SAMPLE_CVS, type SavedHero } from './heroStore'

afterEach(() => { cleanup(); localStorage.clear() })

const hero: SavedHero = {
  nickname: 'Sourdough Sentinel', heroClass: 'data_keeper', quirk: 'Builds vaults for orders', catchphrase: 'Failover ready!', portrait: 'data:image/webp;base64,AA==',
}

describe('hero card', () => {
  it('shows the hero, its class perk and weakness, and nothing that rates the person', () => {
    render(<HeroCardView hero={hero} />)
    expect(screen.getByText('Sourdough Sentinel')).toBeTruthy()
    expect(screen.getByText(/Data Keeper/)).toBeTruthy()
    expect(screen.getByText(/first replica is free/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/score|rating|level|senior|junior|hire/i)
  })

  it('shows a class badge while the portrait is still painting', () => {
    render(<HeroCardView hero={{ ...hero, portrait: undefined }} />)
    expect(screen.getByText('Painting your portrait...')).toBeTruthy()
  })
})

describe('hero storage', () => {
  it('saves and loads the hero card in this browser only', () => {
    saveHero(hero)
    expect(loadHero()).toEqual(hero)
  })

  it('a broken saved value loads as no hero', () => {
    localStorage.setItem('uptime.hero', '{nope')
    expect(loadHero()).toBeNull()
  })

  it('ships three fictional sample CVs', () => {
    expect(SAMPLE_CVS).toHaveLength(3)
    for (const s of SAMPLE_CVS) expect(s.text).toMatch(/fictional/i)
  })
})
