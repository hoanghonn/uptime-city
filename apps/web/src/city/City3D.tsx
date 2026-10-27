import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useMemo, useRef } from 'react'
import type { City, Tick } from '@uptime/core'
import { Building } from './Building'
import { layoutCity, routesFor, CELL } from './layout'
import { Orbs } from './Orbs'
import { createCrew, syncCrew, type Crew } from './builder'
import { Hero, Sparks } from './Hero'
import { pixelTexture } from './textures'
import './city.css'

type Props = {
  city: City
  tick: Tick | null
  /** true while a chaos card is fresh: the camera pushes in */
  chaos?: boolean
  label: string
  accent: string
  /** skip the builder: everything already standing (demo page) */
  instant?: boolean
}

function Camera({ span, depth, chaos }: { span: number; depth: number; chaos: boolean }) {
  const { size } = useThree()
  const cam = useRef<any>(null)
  const fit = Math.min(size.width / (span + 1.5 * CELL), size.height / (depth * 0.85 + 1.9 * CELL))
  useFrame((_, dt) => {
    if (!cam.current) return
    const target = fit * (chaos ? 1.07 : 1)
    cam.current.zoom += (target - cam.current.zoom) * Math.min(1, dt * 4)
    cam.current.updateProjectionMatrix()
  })
  return <OrthographicCamera ref={cam} makeDefault position={[10.5, 33, 39]} near={0.1} far={400} zoom={fit} onUpdate={(c) => c.lookAt(0, 0.6, 0)} />
}

const gravel = (len: number) => {
  const t = pixelTexture('gravel', 1).clone()
  t.repeat.set(Math.max(1, Math.round(len / 0.55)), 2)
  t.needsUpdate = true
  return t
}

/** A road appears once the buildings at both ends are standing. */
function Road({ from, to, crew, position, angle, len }: { from: string; to: string; crew: Crew; position: [number, number, number]; angle: number; len: number }) {
  const mesh = useRef<any>(null)
  const map = useMemo(() => gravel(len), [len])
  useFrame(({ clock }) => {
    if (!mesh.current) return
    const done = (id: string) => id === 'users' || (crew.started.has(id) && clock.elapsedTime - crew.started.get(id)! > 0.3)
    mesh.current.visible = done(from) && done(to)
  })
  return (
    <mesh ref={mesh} position={position} rotation={[0, angle, 0]} receiveShadow visible={false}>
      <boxGeometry args={[len, 0.12, 1.1]} />
      <meshStandardMaterial map={map} roughness={1} />
    </mesh>
  )
}

/** One player's half of the screen: a small 3D city with traffic flowing through it. */
export function City3D({ city, tick, chaos = false, label, accent, instant = false }: Props) {
  const { positions, roads } = useMemo(() => layoutCity(city), [city])
  const crew = useRef<Crew | null>(null)
  if (!crew.current) crew.current = createCrew(positions.users, instant ? city.buildings.map((b) => b.id) : [])
  const ids = city.buildings.map((b) => b.id)
  syncCrew(crew.current, ids)
  const routes = useMemo(() => routesFor(city), [city])
  const xs = Object.values(positions).map((p) => p[0])
  const zs = Object.values(positions).map((p) => p[1])
  const span = Math.max(4 * CELL, Math.max(...xs) - Math.min(...xs))
  const depth = Math.max(2 * CELL, Math.max(...zs) - Math.min(...zs))
  const load = tick?.load ?? {}
  const served = tick && tick.offered > 0 ? tick.served / tick.offered : 1

  return (
    <div className="city">
      <div className="city-tag" style={{ borderColor: accent, color: accent }}>{label}</div>
      <Canvas shadows dpr={[1, 2]}>
        <color attach="background" args={['#4d8b31']} />
        <Camera span={span} depth={depth} chaos={chaos} />
        <hemisphereLight args={['#dbeafe', '#3b6d25', 0.8]} />
        <directionalLight position={[10, 18, 8]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[800, 800]} />
          <meshStandardMaterial map={pixelTexture('grass', 400)} roughness={1} />
        </mesh>
        {roads.map((r) => {
          const [[x1, z1], [x2, z2]] = r.points
          const len = Math.hypot(x2 - x1, z2 - z1)
          return <Road key={`${r.from}>${r.to}`} from={r.from} to={r.to} crew={crew.current!} position={[(x1 + x2) / 2, 0.06, (z1 + z2) / 2]} angle={-Math.atan2(z2 - z1, x2 - x1)} len={len} />
        })}
        <Building key="users" id="users" position={positions.users} load={0} />
        {city.buildings.map((b) => (
          <Building key={b.id} id={b.id} building={b} position={positions[b.id]} load={load[b.id] ?? 0} crew={crew.current!} showLoad={!!tick} />
        ))}
        {city.buildings.map((b) => <Sparks key={`s-${b.id}`} id={b.id} at={positions[b.id]} crew={crew.current!} />)}
        <Hero crew={crew.current} positions={positions} color={accent} />
        <Orbs routes={routes} positions={positions} load={load} offered={tick?.offered ?? 0} servedFraction={served} running={!!tick} />
        <EffectComposer>
          <Bloom intensity={0.6} luminanceThreshold={0.8} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
