import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import * as THREE from 'three'
import type { Building as B } from '@uptime/core'
import { BUILD_SECONDS, type Crew } from './builder'

export const TYPE_COLOR: Record<string, string> = {
  users: '#7dd3fc', lb: '#a78bfa', api: '#34d399', cache: '#facc15', sql: '#60a5fa', nosql: '#2dd4bf',
  queue: '#fb923c', worker: '#f472b6', cdn: '#c084fc', storage: '#94a3b8',
}
const SHORT: Record<string, string> = {
  lb: 'Balancer', api: 'API', cache: 'Cache', sql: 'SQL', nosql: 'NoSQL', queue: 'Queue', worker: 'Worker', cdn: 'CDN', storage: 'Storage',
}
export function shortName(id: string, type: string): string {
  const n = id.match(/\d+$/)?.[0]
  return type === 'users' ? 'Users' : `${SHORT[type] ?? type} ${n ?? ''}`.trim()
}

export const HEIGHT: Record<string, number> = {
  users: 0.5, lb: 1.7, api: 1.3, cache: 0.9, sql: 1.9, nosql: 1.6, queue: 0.8, worker: 1.1, cdn: 1.4, storage: 1.2,
}
const HOT = new THREE.Color('#ef4444')
const WARM = new THREE.Color('#f59e0b')

function Shape({ type }: { type: string }) {
  const h = HEIGHT[type]
  switch (type) {
    case 'lb': return <coneGeometry args={[0.85, h, 4]} />
    case 'cache': return <octahedronGeometry args={[0.75]} />
    case 'sql': return <cylinderGeometry args={[0.8, 0.8, h, 28]} />
    case 'nosql': return <cylinderGeometry args={[0.7, 0.85, h, 6]} />
    default: return <boxGeometry args={[1.3, h, 1.3]} />
  }
}

function Users() {
  return (
    <group>
      {[[-0.4, -0.3], [0.3, -0.4], [0, 0.35], [-0.45, 0.4], [0.45, 0.25]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.3, z]}>
          <capsuleGeometry args={[0.16, 0.3, 4, 8]} />
          <meshStandardMaterial color={TYPE_COLOR.users} emissive={TYPE_COLOR.users} emissiveIntensity={0.5} />
        </mesh>
      ))}
    </group>
  )
}

type Props = { id: string; building?: B; position: [number, number]; load: number; crew?: Crew }

/** One building: drops in when placed, glows, turns orange near capacity, red and shaking above it. */
export function Building({ id, building, position, load, crew }: Props) {
  const group = useRef<THREE.Group>(null)
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  // Hidden until the builder reaches the site, then it rises from the ground.
  const [shown, setShown] = useState(!crew || crew.started.has(id))
  const type = building?.type ?? 'users'
  const base = new THREE.Color(TYPE_COLOR[type])
  const h = HEIGHT[type]

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const start = crew ? crew.started.get(id) : -Infinity
    if (start === undefined) {
      if (group.current) group.current.scale.setScalar(0.0001)
      return
    }
    if (!shown) setShown(true)
    const p = Math.min(1, Math.max(0, (t - start) / BUILD_SECONDS))
    const rise = p < 1 ? 0.05 + 0.95 * (1 - (1 - p) ** 3) : 1
    const hot = load > 1
    const shake = hot ? Math.sin(t * 45) * 0.06 : 0
    if (group.current) {
      group.current.position.set(position[0] + shake, 0, position[1])
      group.current.scale.set(1, rise, 1)
    }
    if (mat.current) {
      const c = hot ? HOT : load > 0.8 ? WARM : base
      mat.current.color.copy(c)
      mat.current.emissive.copy(c)
      mat.current.emissiveIntensity = hot ? 1.4 + Math.sin(t * 12) * 0.6 : p < 1 ? 1.6 - p : 0.45
    }
  })

  const replicas = building?.addons.filter((a) => a === 'read_replica').length ?? 0
  const nodes = building?.type === 'nosql' ? 2 + building.addons.filter((a) => a === 'nosql_node').length : 0
  const badges = building ? [...new Set(building.addons)].filter((a) => a !== 'read_replica' && a !== 'nosql_node') : []
  const pct = Math.round(load * 100)

  return (
    <group ref={group}>
      {type === 'users' ? <Users /> : (
        <mesh position={[0, h / 2, 0]} castShadow>
          <Shape type={type} />
          <meshStandardMaterial ref={mat} roughness={0.35} metalness={0.1} />
        </mesh>
      )}
      {Array.from({ length: replicas }, (_, i) => (
        <mesh key={`r${i}`} position={[0.75 + i * 0.5, 0.55, 0.85]} castShadow>
          <cylinderGeometry args={[0.32, 0.32, 1.1, 20]} />
          <meshStandardMaterial color={TYPE_COLOR.sql} emissive={TYPE_COLOR.sql} emissiveIntensity={0.3} />
        </mesh>
      ))}
      {Array.from({ length: Math.max(0, nodes - 2) }, (_, i) => (
        <mesh key={`n${i}`} position={[0.8 + i * 0.5, 0.45, 0.8]} castShadow>
          <cylinderGeometry args={[0.3, 0.36, 0.9, 6]} />
          <meshStandardMaterial color={TYPE_COLOR.nosql} emissive={TYPE_COLOR.nosql} emissiveIntensity={0.3} />
        </mesh>
      ))}
      {shown && <Html position={[0, h + 0.55, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="label">
          <div className="label-row">
            <span className="label-name">{shortName(id, type)}</span>
            {type !== 'users' && <span className={load > 1 ? 'pct hot' : 'pct'}>{pct}%</span>}
          </div>
          {type !== 'users' && <div className="bar"><div className={load > 1 ? 'fill hot' : load > 0.8 ? 'fill warm' : 'fill'} style={{ width: `${Math.min(100, pct)}%` }} /></div>}
          {(badges.length > 0 || replicas > 0) && (
            <div className="badges">
              {badges.map((b) => <span key={b}>{b.replace('_', ' ')}</span>)}
              {replicas > 0 && <span>×{replicas} replica</span>}
            </div>
          )}
        </div>
      </Html>}
    </group>
  )
}
