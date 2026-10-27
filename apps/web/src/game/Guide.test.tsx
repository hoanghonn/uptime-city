import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GuideModal } from './Guide'

afterEach(cleanup)

describe('field guide modal', () => {
  it('shows the entry and every other topic as a link', () => {
    let opened = ''
    render(<GuideModal id="caching" onOpen={(id) => (opened = id)} onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Caching' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Indexes' }))
    expect(opened).toBe('indexes')
  })

  it('an unknown entry shows nothing', () => {
    const { container } = render(<GuideModal id="nope" onOpen={() => {}} onClose={() => {}} />)
    expect(container.textContent).toBe('')
  })
})
