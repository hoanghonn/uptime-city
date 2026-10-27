import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./game/Game', () => ({ default: () => <div>game</div> }))
vi.mock('./Demo', () => ({ default: () => <div>demo</div> }))
import App from './App'

describe('App', () => {
  it('a narrow screen shows the laptop message instead of the game', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true })
    render(<App />)
    expect(screen.getByText('Uptime City needs a laptop screen.')).toBeTruthy()
    expect(screen.queryByText('game')).toBeNull()
  })

  it('a laptop screen shows the game', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
    render(<App />)
    expect(screen.getByText('game')).toBeTruthy()
  })
})
