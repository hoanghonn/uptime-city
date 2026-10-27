// SPIKE (throwaway): stage 1 fun test - typed commands, 3D city, orbs, one chaos card.
import { Canvas, useFrame } from '@react-three/fiber'
import { OrthographicCamera, Html } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useMemo, useRef, useState, useEffect } from 'react'
import * as THREE from 'three'

type Kind = 'users' | 'lb' | 'cache' | 'api' | 'db' | 'replica'
type Node = { id: string; kind: Kind; label: string; cap: number; x: number; z: number }

const COLORS: Record<Kind, string> = {
  users: '#7dd3fc', lb: '#a78bfa', cache: '#facc15', api: '#34d399', db: '#60a5fa', replica: '#93c5fd',
}
const HEIGHT: Record<Kind, number> = { users: 0.6, lb: 1.6, cache: 1.0, api: 1.2, db: 2.0, replica: 1.6 }

function parse(text: string) {
  const t = text.toLowerCase()
  const num = (w: string) => ({ one: 1, two: 2, three: 3, four: 4 } as Record<string, number>)[w] ?? Number(w)
  const m = t.match(/(\d|one|two|three|four)\s+(large|small)/)
  const apiCount = m ? num(m[1]) : t.includes('server') ? 1 : 0
  return {
    lb: t.includes('round robin') || t.includes('balancer') || t.includes('least'),
    apiCount, apiCap: m?.[2] === 'small' ? 300 : 900,
    db: t.includes('nosql') ? 'nosql' : t.includes('sql') || t.includes('database') ? 'sql' : null,
    index: t.includes('index'), replica: t.includes('replica'),
    cache: t.includes('cache') ? (t.includes('behind') ? 'behind' : 'front') : null,
  }
}

function buildCity(p: ReturnType<typeof parse>): Node[] {
  const nodes: Node[] = [{ id: 'users', kind: 'users', label: 'Users', cap: Infinity, x: -7, z: 0 }]
  if (p.lb) nodes.push({ id: 'lb', kind: 'lb', label: 'Load balancer', cap: 20000, x: -4, z: 0 })
  if (p.cache === 'front') nodes.push({ id: 'cache', kind: 'cache', label: 'Cache', cap: 20000, x: -1.5, z: 0 })
  for (let i = 0; i < p.apiCount; i++)
    nodes.push({ id: `api${i}`, kind: 'api', label: `API ${i + 1}`, cap: p.apiCap, x: 1.5, z: (i - (p.apiCount - 1) / 2) * 2.5 })
  if (p.cache === 'behind') nodes.push({ id: 'cache', kind: 'cache', label: 'Cache', cap: 20000, x: 3.5, z: 2.5 })
  if (p.db) {
    const reads = (p.db === 'nosql' ? 3000 : 1500) * (p.index ? 2 : 1)
    nodes.push({ id: 'db', kind: 'db', label: p.db === 'nosql' ? 'NoSQL' : 'SQL', cap: reads, x: 5.5, z: 0 })
    if (p.replica) nodes.push({ id: 'rep', kind: 'replica', label: 'Replica', cap: reads, x: 5.5, z: 2.5 })
  }
  return nodes
}

// crude flow for the spike: offered -> cache front absorbs -> api cap -> db cap
function step(nodes: Node[], t: number, fixedCacheAt: number | null) {
  const chaos = t >= 15
  const offered = chaos ? 5000 : 1000
  const hot = chaos ? 4000 : 0
  const normal = offered - hot
  const cacheFront = nodes.some((n) => n.id === 'cache' && n.x < 0) || (fixedCacheAt !== null && t >= fixedCacheAt + 1)
  const toApi = cacheFront ? normal * 0.1 + normal * 0.9 * 0.4 + hot * 0.01 : offered
  const apiCap = nodes.filter((n) => n.kind === 'api').reduce((s, n) => s + n.cap, 0)
  const servedApi = Math.min(toApi, apiCap)
  const dbCap = nodes.filter((n) => n.kind === 'db' || n.kind === 'replica').reduce((s, n) => s + n.cap, 0)
  const servedDb = Math.min(servedApi, dbCap || 0)
  const served = (offered - toApi) + servedDb
  const load: Record<string, number> = {}
  for (const n of nodes) {
    if (n.kind === 'api') load[n.id] = apiCap ? toApi / apiCap : 0
    if (n.kind === 'db' || n.kind === 'replica') load[n.id] = dbCap ? servedApi / dbCap : 0
    if (n.kind === 'lb') load[n.id] = offered / n.cap
    if (n.kind === 'cache') load[n.id] = 0.3
  }
  return { offered, served, pct: served / offered, load }
}

function Building({ node, load }: { node: Node; load: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const h = HEIGHT[node.kind]
  const hot = load > 1
  useFrame(({ clock }) => {
    if (!ref.current) return
    const s = hot ? Math.sin(clock.elapsedTime * 40) * 0.05 : 0
    ref.current.position.x = node.x + s
    const m = ref.current.material as THREE.MeshStandardMaterial
    m.emissiveIntensity = hot ? 1.5 + Math.sin(clock.elapsedTime * 10) : 0.6
  })
  return (
    <group>
      <mesh ref={ref} position={[node.x, h / 2, node.z]} castShadow>
        {node.kind === 'db' || node.kind === 'replica' ? <cylinderGeometry args={[0.8, 0.8, h, 24]} /> :
          node.kind === 'lb' ? <coneGeometry args={[0.8, h, 4]} /> : <boxGeometry args={[1.3, h, 1.3]} />}
        <meshStandardMaterial color={hot ? '#ef4444' : COLORS[node.kind]} emissive={hot ? '#ef4444' : COLORS[node.kind]} emissiveIntensity={0.6} />
      </mesh>
      <Html position={[node.x, h + 0.7, node.z]} center style={{ pointerEvents: 'none' }}>
        <div style={{ font: '11px system-ui', color: '#e2e8f0', textAlign: 'center', whiteSpace: 'nowrap' }}>
          {node.label}
          {node.kind !== 'users' && (
            <div style={{ width: 60, height: 5, background: '#1e293b', marginTop: 2 }}>
              <div style={{ width: `${Math.min(100, load * 100)}%`, height: 5, background: hot ? '#ef4444' : load > 0.8 ? '#f59e0b' : '#22c55e' }} />
            </div>
          )}
          {node.kind !== 'users' && <span style={{ color: hot ? '#fca5a5' : '#94a3b8' }}>{Math.round(load * 100)}%</span>}
        </div>
      </Html>
    </group>
  )
}

function pathSegments(nodes: Node[]): [Node, Node][] {
  const by = (k: Kind) => nodes.filter((n) => n.kind === k)
  const users = by('users')[0], lb = by('lb')[0], apis = by('api'), dbs = [...by('db'), ...by('replica')]
  const cache = nodes.find((n) => n.id === 'cache' && n.x < 0)
  const segs: [Node, Node][] = []
  let head = users
  if (lb) { segs.push([head, lb]); head = lb }
  if (cache) { segs.push([head, cache]); head = cache }
  for (const a of apis) { segs.push([head, a]); for (const d of dbs) segs.push([a, d]) }
  return segs
}

function Roads({ nodes }: { nodes: Node[] }) {
  const segs = useMemo(() => pathSegments(nodes), [nodes])
  return (
    <>
      {segs.map(([a, b], i) => {
        const len = Math.hypot(b.x - a.x, b.z - a.z)
        return (
          <mesh key={i} position={[(a.x + b.x) / 2, 0.02, (a.z + b.z) / 2]} rotation={[0, -Math.atan2(b.z - a.z, b.x - a.x), 0]}>
            <boxGeometry args={[len, 0.04, 0.35]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
        )
      })}
    </>
  )
}

const MAX_ORBS = 1500
const GREEN = new THREE.Color('#a7f3d0')
const RED = new THREE.Color('#ef4444')
function Orbs({ nodes, pct, running }: { nodes: Node[]; pct: number; running: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const routes = useMemo(() => {
    const apis = nodes.filter((n) => n.kind === 'api')
    const users = nodes[0]
    const lb = nodes.find((n) => n.kind === 'lb')
    const cache = nodes.find((n) => n.id === 'cache' && n.x < 0)
    const db = nodes.find((n) => n.kind === 'db')
    return apis.map((a) => {
      const pts = [users, lb, cache, a, db].filter(Boolean).map((n) => new THREE.Vector3(n!.x, 0.3, n!.z))
      return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0)
    })
  }, [nodes])
  const seeds = useMemo(() => Array.from({ length: MAX_ORBS }, () => ({ o: Math.random(), r: Math.floor(Math.random() * 64), f: Math.random() })), [])
  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh || routes.length === 0) return
    const t = clock.elapsedTime
    seeds.forEach((s, i) => {
      const dropped = s.f > pct
      if (!running) {
        dummy.scale.setScalar(0)
      } else {
        const route = routes[s.r % routes.length]
        const u = (s.o + t * 0.25) % 1
        const falling = dropped && u > 0.55
        const p = route.getPointAt(falling ? 0.55 : u)
        dummy.position.set(p.x + (s.f - 0.5) * 0.4, falling ? 0.3 - (u - 0.55) * 12 : p.y, p.z + (s.o - 0.5) * 0.4)
        dummy.scale.setScalar(falling ? 0.09 : 0.07)
      }
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, dropped ? RED : GREEN)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX_ORBS]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial emissive="#ffffff" emissiveIntensity={1.2} toneMapped={false} />
    </instancedMesh>
  )
}

export default function App() {
  const [text, setText] = useState('Round robin, two large servers, SQL with index and replica')
  const [nodes, setNodes] = useState<Node[]>(() => buildCity(parse('')))
  const [t, setT] = useState<number | null>(null)
  const [cacheAt, setCacheAt] = useState<number | null>(null)
  const running = t !== null && t < 30
  const sim = t === null ? null : step(nodes, Math.min(t, 29.9), cacheAt)

  useEffect(() => {
    if (t === null || t >= 30) return
    const id = setTimeout(() => setT((x) => (x === null ? x : +(x + 0.1).toFixed(1))), 100)
    return () => clearTimeout(id)
  }, [t])

  const submit = () => {
    if (/submit/i.test(text)) { setT(0); setCacheAt(null); return }
    if (running && /cache/i.test(text)) { setCacheAt(t); return }
    setNodes(buildCity(parse(text)))
  }

  return (
    <div style={{ height: '100vh', background: '#020617', color: '#e2e8f0', font: '14px system-ui', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 10, display: 'flex', gap: 16, alignItems: 'center' }}>
        <b>STAGE 1 · Shorty</b>
        <span>⏱ {t === null ? '-' : t.toFixed(1)} s</span>
        <span>Served {sim ? Math.round(sim.pct * 100) : '-'}%</span>
        {t !== null && t >= 15 && <span style={{ background: '#7c2d12', padding: '2px 8px', borderRadius: 4 }}>🃏 CELEBRITY TWEET ×5</span>}
      </div>
      <div style={{ flex: 1 }}>
        <Canvas shadows>
          <OrthographicCamera makeDefault position={[10, 12, 14]} zoom={48} onUpdate={(c) => c.lookAt(0, 0, 0)} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[30, 20]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
          <Roads nodes={nodes} />
          {nodes.map((n) => <Building key={n.id} node={n} load={sim?.load[n.id] ?? 0} />)}
          <Orbs nodes={nodes} pct={sim?.pct ?? 1} running={running} />
          <EffectComposer><Bloom intensity={1.1} luminanceThreshold={0.2} mipmapBlur /></EffectComposer>
        </Canvas>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit() }} style={{ padding: 10, display: 'flex', gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1, padding: 8, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }} />
        <button>Send</button>
        <span style={{ color: '#94a3b8' }}>Build, then type "submit". During the tweet, type "cache front".</span>
      </form>
    </div>
  )
}
