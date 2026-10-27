import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { XZ } from './layout'

const MAX = 1600
const OK = new THREE.Color('#5eead4')
const DROPPED = new THREE.Color('#f87171')
const Y = 0.45

type Props = {
  routes: string[][]
  positions: Record<string, XZ>
  /** per-building load, to find where dropped requests fall */
  load: Record<string, number>
  offered: number
  servedFraction: number
  running: boolean
}

/** Requests as orbs flowing along the roads; the dropped share turns red and falls off at the overloaded building. */
export function Orbs({ routes, positions, load, offered, servedFraction, running }: Props) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const seeds = useMemo(() => Array.from({ length: MAX }, (_, i) => ({ phase: (i * 0.618) % 1, route: i, luck: ((i * 7919) % 1000) / 1000, jitter: ((i * 104729) % 1000) / 1000 - 0.5 })), [])

  const paths = useMemo(
    () =>
      routes.map((r) => {
        const pts = r.map((id) => new THREE.Vector3(positions[id][0], Y, positions[id][1]))
        const curve = new THREE.CurvePath<THREE.Vector3>()
        for (let i = 1; i < pts.length; i++) curve.add(new THREE.LineCurve3(pts[i - 1], pts[i]))
        // where on this route requests get dropped: the most overloaded building, else the end
        let breakAt = 1
        let worst = 1
        r.forEach((id, i) => { if ((load[id] ?? 0) > worst) { worst = load[id]; breakAt = i / (r.length - 1) } })
        return { curve, breakAt }
      }),
    [routes, positions, load],
  )

  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m) return
    const t = clock.elapsedTime
    const visible = running && paths.length > 0 ? Math.min(MAX, Math.round((offered / 5000) * MAX * 0.9) + 120) : 0
    for (let i = 0; i < MAX; i++) {
      const s = seeds[i]
      if (i >= visible) {
        dummy.scale.setScalar(0)
      } else {
        const p = paths[s.route % paths.length]
        const u = (s.phase + t * 0.22) % 1
        const dropped = s.luck > servedFraction
        if (dropped && u > p.breakAt) {
          const at = p.curve.getPointAt(Math.max(0, p.breakAt - 0.001))
          const fall = (u - p.breakAt) * 18
          dummy.position.set(at.x + s.jitter * 1.4, Y - fall, at.z + s.jitter * 0.8 + fall * 0.15)
          dummy.scale.setScalar(0.11)
        } else {
          const at = p.curve.getPointAt(u)
          dummy.position.set(at.x + s.jitter * 0.35, at.y, at.z + s.jitter * 0.35)
          dummy.scale.setScalar(dropped ? 0.1 : 0.075)
        }
        m.setColorAt(i, dropped ? DROPPED : OK)
      }
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <boxGeometry args={[1.6, 1.6, 1.6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
