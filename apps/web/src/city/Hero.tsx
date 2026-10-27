import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { crewStep, type Crew } from './builder'
import type { XZ } from './layout'

/** A little low-poly builder in a hard hat who walks to each site and hammers it up. */
export function Hero({ crew, positions, color }: { crew: Crew; positions: Record<string, XZ>; color: string }) {
  const body = useRef<THREE.Group>(null)
  const arm = useRef<THREE.Group>(null)
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    crewStep(crew, positions, t, Math.min(dt, 0.1))
    const g = body.current
    if (!g) return
    const walking = crew.mode === 'walking'
    const building = crew.mode === 'building'
    g.position.set(crew.pos[0], walking ? Math.abs(Math.sin(t * 16)) * 0.12 : Math.sin(t * 3) * 0.03, crew.pos[1])
    if (walking) g.rotation.y = crew.heading
    else if (building) g.rotation.y += (Math.PI / 4 - g.rotation.y) * 0.2 // face the site
    if (arm.current) arm.current.rotation.x = building ? -1.2 + Math.abs(Math.sin(t * 14)) * 1.6 : walking ? Math.sin(t * 16) * 0.6 : 0
  })
  return (
    <group ref={body} scale={1.6}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <capsuleGeometry args={[0.2, 0.4, 4, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, 0.98, 0]} castShadow>
        <sphereGeometry args={[0.17, 16, 12]} />
        <meshStandardMaterial color="#fde4cf" />
      </mesh>
      <mesh position={[0, 1.07, 0]}>
        <sphereGeometry args={[0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0.98, 0.15]}>
        <boxGeometry args={[0.22, 0.06, 0.04]} />
        <meshBasicMaterial color="#67e8f9" toneMapped={false} />
      </mesh>
      <group ref={arm} position={[0.24, 0.7, 0]}>
        <mesh position={[0, -0.18, 0]}>
          <boxGeometry args={[0.07, 0.36, 0.07]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0, -0.38, 0.1]}>
          <boxGeometry args={[0.16, 0.08, 0.1]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    </group>
  )
}

/** Sparks over a site while it is being built. */
export function Sparks({ at, crew, id }: { at: XZ; crew: Crew; id: string }) {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const start = crew.started.get(id)
    const age = start === undefined ? -1 : clock.elapsedTime - start
    const on = age >= 0 && age < 0.6
    g.visible = on
    if (!on) return
    g.children.forEach((c, i) => {
      const a = i * 1.7 + age * 9
      c.position.set(Math.cos(a) * (0.4 + age), 0.3 + age * 2.2 + (i % 3) * 0.2, Math.sin(a) * (0.4 + age))
    })
  })
  return (
    <group ref={group} position={[at[0], 0, at[1]]} visible={false}>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.05, 6, 6]} />
          <meshBasicMaterial color={i % 2 ? '#fde047' : '#fb923c'} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
