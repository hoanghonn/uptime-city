import * as THREE from 'three'
import type { Mat } from './voxels'

// Pixel-art textures drawn in code (16 x 16, no image files): a blocky look that is ours, not borrowed.

type Spec = { base: string; dark: string; light: string; pattern: 'noise' | 'brick' | 'plank' | 'crate' | 'window' | 'grass' | 'gravel'; glow?: string }

const SPECS: Record<Mat | 'grass' | 'gravel', Spec> = {
  stone: { base: '#8b9099', dark: '#6b7079', light: '#a7acb4', pattern: 'noise' },
  brick: { base: '#9a4a3c', dark: '#6e3027', light: '#c9c2b8', pattern: 'brick' },
  plank: { base: '#a8794a', dark: '#7f5832', light: '#c4935f', pattern: 'plank' },
  roof: { base: '#3b4a6b', dark: '#2a3550', light: '#4f6189', pattern: 'plank' },
  glass: { base: '#7dd3fc', dark: '#38bdf8', light: '#e0f2fe', pattern: 'noise', glow: '#38bdf8' },
  window: { base: '#fde68a', dark: '#f59e0b', light: '#fffbeb', pattern: 'window', glow: '#fbbf24' },
  gold: { base: '#facc15', dark: '#ca8a04', light: '#fef08a', pattern: 'noise', glow: '#eab308' },
  crate: { base: '#2dd4bf', dark: '#0f766e', light: '#99f6e4', pattern: 'crate' },
  metal: { base: '#94a3b8', dark: '#64748b', light: '#cbd5e1', pattern: 'noise' },
  banner: { base: '#a78bfa', dark: '#7c3aed', light: '#ddd6fe', pattern: 'noise', glow: '#8b5cf6' },
  lantern: { base: '#fef3c7', dark: '#fbbf24', light: '#ffffff', pattern: 'window', glow: '#fde68a' },
  skin: { base: '#f1c27d', dark: '#d9a066', light: '#ffdbac', pattern: 'noise' },
  shirt: { base: '#38bdf8', dark: '#0284c7', light: '#7dd3fc', pattern: 'noise' },
  pants: { base: '#334155', dark: '#1e293b', light: '#475569', pattern: 'noise' },
  hair: { base: '#5b3a1e', dark: '#3f2814', light: '#7a5130', pattern: 'noise' },
  grass: { base: '#4f8f33', dark: '#47822e', light: '#5a9c3b', pattern: 'grass' },
  gravel: { base: '#7c7f86', dark: '#5b5e64', light: '#9ea1a8', pattern: 'gravel' },
}

function rand(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

function draw(spec: Spec, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 16
  const g = c.getContext('2d')!
  const r = rand(seed)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const v = r()
      let col = v < 0.2 ? spec.dark : v > 0.85 ? spec.light : spec.base
      if (spec.pattern === 'brick') col = y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0 ? spec.light : v < 0.25 ? spec.dark : spec.base
      if (spec.pattern === 'plank') col = y % 4 === 3 ? spec.dark : v < 0.12 ? spec.dark : spec.base
      if (spec.pattern === 'crate') col = x === 0 || x === 15 || y === 0 || y === 15 || x === y ? spec.dark : spec.base
      if (spec.pattern === 'window') col = x < 2 || x > 13 || y < 2 || y > 13 || x === 7 || x === 8 || y === 7 || y === 8 ? spec.dark : v > 0.8 ? spec.light : spec.base
      if (spec.pattern === 'grass') col = v < 0.3 ? spec.dark : v > 0.9 ? spec.light : spec.base
      if (spec.pattern === 'gravel') col = v < 0.35 ? spec.dark : v > 0.75 ? spec.light : spec.base
      g.fillStyle = col
      g.fillRect(x, y, 1, 1)
    }
  return c
}

const cache = new Map<string, THREE.Texture>()
export function pixelTexture(name: keyof typeof SPECS, repeat = 1): THREE.Texture {
  const key = `${name}:${repeat}`
  let t = cache.get(key)
  if (!t) {
    t = new THREE.CanvasTexture(draw(SPECS[name], name.length * 7919 + 13))
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestFilter
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat, repeat)
    cache.set(key, t)
  }
  return t
}

/** A fresh material per building, so one building can glow red without the others. */
export function blockMaterial(mat: Mat): THREE.MeshStandardMaterial {
  const spec = SPECS[mat]
  return new THREE.MeshStandardMaterial({
    map: pixelTexture(mat),
    roughness: 0.9,
    metalness: mat === 'metal' ? 0.3 : 0,
    emissive: new THREE.Color(spec.glow ?? '#000000'),
    emissiveIntensity: spec.glow ? 0.6 : 0,
  })
}
