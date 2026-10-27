import { describe, expect, it } from 'vitest'
import { CATALOG, GUIDE, guideEntry, guideFor, STAGES, type BuildingType } from '../src'

describe('field guide', () => {
  it('covers every building type the game has', () => {
    for (const type of Object.keys(CATALOG) as BuildingType[]) {
      if (type === 'worker' || type === 'queue' || type === 'storage' || type === 'cdn' || Object.keys(CATALOG[type].options).length) {
        expect(guideFor(type).length, type).toBeGreaterThan(0)
      }
    }
  })

  it('has unique ids and plain-length entries', () => {
    expect(new Set(GUIDE.map((g) => g.id)).size).toBe(GUIDE.length)
    for (const g of GUIDE) expect(g.body.length).toBeLessThan(700)
  })

  it('every stage links only to guide entries that exist', () => {
    for (const s of Object.values(STAGES)) for (const id of s.guide ?? []) expect(guideEntry(id), `${s.id}: ${id}`).toBeTruthy()
  })
})
