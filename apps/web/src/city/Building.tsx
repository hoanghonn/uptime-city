import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Building as B } from '@uptime/core'
import { BUILD_SECONDS, type Crew } from './builder'
import { blockMaterial } from './textures'
import { BLOCK, modelHeight, visibleBlocks, voxelModel, type Block, type Mat } from './voxels'

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

const HOT = new THREE.Color('#ff2d2d')
const WARM = new THREE.Color('#f59e0b')
const CUBE = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK)
const SMOKE = new THREE.MeshStandardMaterial({ color: '#6b7280', transparent: true, opacity: 0.7 })
const dummy = new THREE.Object3D()

/** All the blocks of one material in one building, as one instanced mesh. */
function BlockLayer({ blocks, rank, material, visible }: { blocks: Block[]; rank: number[]; material: THREE.Material; visible: React.MutableRefObject<number> }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const shownCount = useRef(-1)
  useFrame(() => {
    const m = mesh.current
    if (!m || shownCount.current === visible.current) return
    shownCount.current = visible.current
    blocks.forEach((b, i) => {
      dummy.position.set(b.x * BLOCK, b.y * BLOCK + BLOCK / 2, b.z * BLOCK)
      dummy.scale.setScalar(rank[i] < visible.current ? 1 : 0)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[CUBE, material, blocks.length]} castShadow receiveShadow frustumCulled={false} />
}

type Props = { id: string; building?: B; position: [number, number]; load: number; crew?: Crew; showLoad?: boolean }

/** One building, made of blocks: it goes up block by block while the builder works, then glows red and smokes when overloaded. */
export function Building({ id, building, position, load, crew, showLoad = true }: Props) {
  const group = useRef<THREE.Group>(null)
  const smoke = useRef<THREE.Group>(null)
  const [shown, setShown] = useState(!crew || crew.started.has(id))
  const type = building?.type ?? 'users'
  const addonsKey = building?.addons.join(',') ?? ''
  const blocks = useMemo(() => voxelModel(type, building?.option ?? '', building?.addons ?? []), [type, building?.option, addonsKey])
  const height = modelHeight(blocks) * BLOCK

  // One material per block type, per building, so this building can flash red alone.
  const layers = useMemo(() => {
    const byMat = new Map<Mat, { blocks: Block[]; rank: number[] }>()
    blocks.forEach((b, i) => {
      const l = byMat.get(b.mat) ?? { blocks: [], rank: [] }
      l.blocks.push(b)
      l.rank.push(i)
      byMat.set(b.mat, l)
    })
    return [...byMat.entries()].map(([mat, l]) => ({ mat, ...l, material: blockMaterial(mat) }))
  }, [blocks])
  useEffect(() => () => layers.forEach((l) => l.material.dispose()), [layers])
  const baseEmissive = useMemo(() => layers.map((l) => ({ color: l.material.emissive.clone(), intensity: l.material.emissiveIntensity })), [layers])

  const visible = useRef(crew && !crew.started.has(id) ? 0 : blocks.length)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const start = crew ? crew.started.get(id) : -Infinity
    if (start === undefined) { visible.current = 0; return }
    if (!shown) setShown(true)
    visible.current = visibleBlocks(blocks, (t - start) / BUILD_SECONDS)
    const hot = load > 1
    const warm = load > 0.8
    if (group.current) group.current.position.set(position[0] + (hot ? Math.sin(t * 45) * 0.05 : 0), 0, position[1])
    layers.forEach((l, i) => {
      const m = l.material
      if (hot) { m.emissive.copy(HOT); m.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 8)) * 0.7 }
      else if (warm) { m.emissive.copy(WARM); m.emissiveIntensity = 0.35 }
      else { m.emissive.copy(baseEmissive[i].color); m.emissiveIntensity = baseEmissive[i].intensity }
    })
    if (smoke.current) {
      smoke.current.visible = hot
      if (hot) smoke.current.children.forEach((c, i) => {
        const age = (t * 0.8 + i * 0.27) % 1
        c.position.set(Math.sin(i * 2.1) * 0.4, height + age * 2.2, Math.cos(i * 1.7) * 0.4)
        c.scale.setScalar(0.6 + age)
      })
    }
  })

  const replicas = building?.addons.filter((a) => a === 'read_replica').length ?? 0
  const badges = building ? [...new Set(building.addons)].filter((a) => a !== 'read_replica' && a !== 'nosql_node') : []
  const pct = Math.round(load * 100)

  return (
    <group ref={group} position={[position[0], 0, position[1]]}>
      {layers.map((l) => <BlockLayer key={`${l.mat}-${blocks.length}`} blocks={l.blocks} rank={l.rank} material={l.material} visible={visible} />)}
      <group ref={smoke} visible={false}>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} geometry={CUBE} material={SMOKE} scale={0.6} />
        ))}
      </group>
      {shown && type !== 'users' && <Html position={[0, height + 0.5, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="label">
          <div className="label-row">
            <span className="label-name">{shortName(id, type)}</span>
            {showLoad && <span className={load > 1 ? 'pct hot' : 'pct'}>{pct}%</span>}
          </div>
          {showLoad && <div className="bar"><div className={load > 1 ? 'fill hot' : load > 0.8 ? 'fill warm' : 'fill'} style={{ width: `${Math.min(100, pct)}%` }} /></div>}
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
