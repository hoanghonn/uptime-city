import { describe, expect, it } from 'vitest'
import { CATALOG, type BuildingType } from '@uptime/core'
import { FOOTPRINT, modelHeight, visibleBlocks, voxelModel } from './voxels'

describe('voxel models', () => {
  for (const type of Object.keys(CATALOG) as BuildingType[]) {
    for (const option of Object.keys(CATALOG[type].options)) {
      it(`${type} ${option} is made of blocks inside its footprint`, () => {
        const blocks = voxelModel(type, option, [])
        expect(blocks.length).toBeGreaterThan(4)
        for (const b of blocks) {
          expect(Math.abs(b.x)).toBeLessThanOrEqual(FOOTPRINT)
          expect(Math.abs(b.z)).toBeLessThanOrEqual(FOOTPRINT)
          expect(b.y).toBeGreaterThanOrEqual(0)
        }
      })
    }
  }

  it('a large API server is taller than a small one', () => {
    expect(modelHeight(voxelModel('api', 'large', []))).toBeGreaterThan(modelHeight(voxelModel('api', 'small', [])))
  })

  it('add-ons show up as blocks: replicas and extra nodes', () => {
    expect(voxelModel('sql', 'standard', ['read_replica']).length).toBeGreaterThan(voxelModel('sql', 'standard', []).length)
    expect(voxelModel('nosql', 'standard', ['nosql_node']).length).toBeGreaterThan(voxelModel('nosql', 'standard', []).length)
  })

  it('the users are a little crowd of blocky people', () => {
    expect(voxelModel('users', '', []).length).toBeGreaterThan(4)
  })

  it('builds bottom-up: progress shows the lowest blocks first', () => {
    const blocks = voxelModel('api', 'large', [])
    expect(visibleBlocks(blocks, 0)).toBe(0)
    expect(visibleBlocks(blocks, 1)).toBe(blocks.length)
    const half = visibleBlocks(blocks, 0.5)
    const sorted = [...blocks].sort((a, b) => a.y - b.y)
    expect(sorted.slice(0, half).every((b) => b.y <= sorted[half].y)).toBe(true)
    expect(blocks.map((b) => b.y)).toEqual(sorted.map((b) => b.y))
  })
})
