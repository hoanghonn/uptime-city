import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrthographicCamera } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useMemo, useRef } from 'react'
import type { City, Tick } from '@uptime/core'
import { Building } from './Building'
import { layoutCity, routesFor, CELL } from './layout'
import { Orbs } from './Orbs'
import { createCrew, syncCrew, type Crew } from './builder'
import { Hero, Sparks } from './Hero'
import './city.css'

type Props = {
  city: City
  tick: Tick | null
  /** true while a chaos card is fresh: the camera pushes in */
  chaos?: boolean
  label: string
  accent: string
}

function Camera({ span, depth, chaos }: { span: number; depth: number; chaos: boolean }) {
  const { size } = useThree()
  const cam = useRef<any>(null)
  const fit = Math.min(size.width / (span + 2.6 * CELL), size.height / (depth * 0.8 + 2.4 * CELL))
  useFrame((_, dt) => {
    if (!cam.current) return
    const target = fit * (chaos ? 1.07 : 1)
    cam.current.zoom += (target - cam.current.zoom) * Math.min(1, dt * 4)
    cam.current.updateProjectionMatrix()
  })
  return <OrthographicCamera ref={cam} makeDefault position={[3.5, 11, 13]} zoom={fit} onUpdate={(c) => c.lookAt(0, 0.6, 0)} />
}

/** A road appears once the buildings at both ends are standing. */
function Road({ from, to, crew, position, angle, len }: { from: string; to: string; crew: Crew; position: [number, number, number]; angle: number; len: number }) {
  const mesh = useRef<any>(null)
  useFrame(({ clock }) => {
    if (!mesh.current) return
    const done = (id: string) => id === 'users' || (crew.started.has(id) && clock.elapsedTime - crew.started.get(id)! > 0.3)
    mesh.current.visible = done(from) && done(to)
  })
  return (
    <mesh ref={mesh} position={position} rotation={[0, angle, 0]} receiveShadow visible={false}>
      <boxGeometry args={[len, 0.05, 0.5]} />
      <meshStandardMaterial color="#334b73" />
    </mesh>
  )
}

/** One player's half of the screen: a small 3D city with traffic flowing through it. */
export function City3D({ city, tick, chaos = false, label, accent }: Props) {
  const { positions, roads } = useMemo(() => layoutCity(city), [city])
  const crew = useRef<Crew | null>(null)
  if (!crew.current) crew.current = createCrew(positions.users)
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
        <color attach="background" args={['#050b1a']} />
        <Camera span={span} depth={depth} chaos={chaos} />
        <ambientLight intensity={0.45} />
        <directionalLight position={[6, 12, 6]} intensity={1.3} castShadow shadow-mapSize={[1024, 1024]} />
        <Grid args={[40, 40]} cellSize={CELL / 2} cellColor="#0f1d38" sectionSize={CELL} sectionColor="#16294d" fadeDistance={40} infiniteGrid />
        {roads.map((r) => {
          const [[x1, z1], [x2, z2]] = r.points
          const len = Math.hypot(x2 - x1, z2 - z1)
          return <Road key={`${r.from}>${r.to}`} from={r.from} to={r.to} crew={crew.current!} position={[(x1 + x2) / 2, 0.03, (z1 + z2) / 2]} angle={-Math.atan2(z2 - z1, x2 - x1)} len={len} />
        })}
        <Building key="users" id="users" position={positions.users} load={0} />
        {city.buildings.map((b) => (
          <Building key={b.id} id={b.id} building={b} position={positions[b.id]} load={load[b.id] ?? 0} crew={crew.current!} />
        ))}
        {city.buildings.map((b) => <Sparks key={`s-${b.id}`} id={b.id} at={positions[b.id]} crew={crew.current!} />)}
        <Hero crew={crew.current} positions={positions} color={accent} />
        <Orbs routes={routes} positions={positions} load={load} offered={tick?.offered ?? 0} servedFraction={served} running={!!tick} />
        <EffectComposer>
          <Bloom intensity={0.9} luminanceThreshold={0.55} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
