import type { BuildingType } from '@uptime/core'

/** Blocky building models: every building is a small stack of cubes, sorted bottom-up so it can be built block by block. */
export type Mat =
  | 'stone' | 'brick' | 'plank' | 'roof' | 'glass' | 'window' | 'gold' | 'crate' | 'metal' | 'banner' | 'lantern'
  | 'skin' | 'shirt' | 'pants' | 'hair'
export type Block = { x: number; y: number; z: number; mat: Mat }

/** Blocks reach at most this many cells from the centre on x and z. */
export const FOOTPRINT = 2
/** World size of one block. */
export const BLOCK = 0.55

function box(out: Block[], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: Mat, hollow = false) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1
        if (!hollow || edge) out.push({ x, y, z, mat })
      }
}

function house(out: Block[], r: number, h: number, wall: Mat) {
  box(out, -r, r, 0, h - 1, -r, r, wall, true)
  // lit windows on the front and one side, every other block
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = -r + 1; x <= r - 1; x += 2) replace(out, x, y, r, 'window')
    for (let z = -r + 1; z <= r - 1; z += 2) replace(out, r, y, z, 'window')
  }
  box(out, -r, r, h, h, -r, r, 'roof')
}

function replace(out: Block[], x: number, y: number, z: number, mat: Mat) {
  const b = out.find((q) => q.x === x && q.y === y && q.z === z)
  if (b) b.mat = mat
}

function person(out: Block[], x: number, z: number, shirt: Mat) {
  out.push({ x, y: 0, z, mat: 'pants' }, { x, y: 1, z, mat: shirt }, { x, y: 2, z, mat: 'skin' })
}

export function voxelModel(type: BuildingType | 'users', option: string, addons: string[]): Block[] {
  const out: Block[] = []
  switch (type) {
    case 'users':
      for (const [x, z] of [[-2, 0], [0, -1], [2, 0], [-1, 2], [1, 1]]) person(out, x, z, 'shirt')
      break
    case 'lb':
      box(out, -2, -2, 0, 4, 0, 0, 'stone')
      box(out, 2, 2, 0, 4, 0, 0, 'stone')
      box(out, -2, 2, 5, 5, 0, 0, 'stone')
      box(out, -1, 1, 4, 4, 0, 0, 'banner')
      if (option === 'least_conn') out.push({ x: 0, y: 6, z: 0, mat: 'lantern' })
      if (option === 'rate_limit') box(out, -1, 1, 0, 2, 0, 0, 'metal')
      break
    case 'api':
      if (option === 'large') house(out, 2, 6, 'plank')
      else house(out, 1, 3, 'plank')
      break
    case 'cache':
      box(out, -1, 1, 0, 2, -1, 1, 'gold')
      break
    case 'sql': {
      box(out, -1, 1, 0, 3, -1, 1, 'brick', true)
      box(out, -1, 1, 4, 4, -1, 1, 'stone')
      replace(out, 0, 1, 1, 'metal') // the vault door
      const corners = [[-2, -2], [2, -2], [-2, 2], [2, 2]]
      addons.filter((a) => a === 'read_replica').slice(0, 4).forEach((_, i) => box(out, corners[i][0], corners[i][0], 0, 2, corners[i][1], corners[i][1], 'brick'))
      break
    }
    case 'nosql': {
      const nodes = 2 + addons.filter((a) => a === 'nosql_node').length
      const slots = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -2], [-2, 0], [2, 0], [0, 2], [0, 0]]
      slots.slice(0, Math.min(nodes, slots.length)).forEach(([x, z]) => box(out, x, x, 0, 2, z, z, 'crate'))
      break
    }
    case 'queue':
      box(out, -2, 2, 0, 0, 0, 0, 'metal')
      out.push({ x: -1, y: 1, z: 0, mat: 'crate' }, { x: 1, y: 1, z: 0, mat: 'crate' }, { x: 2, y: 1, z: 0, mat: 'crate' })
      break
    case 'worker':
      house(out, 1, 2, 'plank')
      break
    case 'cdn':
      box(out, -1, 1, 0, 0, -1, 1, 'stone')
      box(out, 0, 0, 1, 5, 0, 0, 'metal')
      box(out, -1, 1, 6, 6, 0, 0, 'glass')
      break
    case 'storage':
      box(out, -2, 2, 0, 2, -1, 1, 'brick', true)
      replace(out, 0, 0, 1, 'metal')
      replace(out, 0, 1, 1, 'metal')
      box(out, -2, 2, 3, 3, -1, 1, 'roof')
      break
  }
  if (addons.includes('index') && out.length) {
    const top = Math.max(...out.map((b) => b.y))
    out.push({ x: 0, y: top + 1, z: 0, mat: 'lantern' })
  }
  return out.sort((a, b) => a.y - b.y)
}

export const modelHeight = (blocks: Block[]) => (blocks.length ? Math.max(...blocks.map((b) => b.y)) + 1 : 0)

/** How many blocks (from the bottom) are standing at build progress p (0..1). */
export const visibleBlocks = (blocks: Block[], p: number) => Math.round(Math.max(0, Math.min(1, p)) * blocks.length)
