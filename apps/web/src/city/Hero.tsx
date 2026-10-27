import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { crewStep, type Crew } from './builder'
import type { XZ } from './layout'
import { pixelTexture } from './textures'

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const HEAD = box(0.5, 0.5, 0.5)
const HAT = box(0.58, 0.16, 0.58)
const BODY = box(0.5, 0.7, 0.28)
const LIMB = box(0.22, 0.62, 0.22)
const HANDLE = box(0.08, 0.5, 0.08)
const HAMMER = box(0.3, 0.16, 0.16)

/** A blocky builder in a hard hat: walks to each site, then hammers the building up. */
export function Hero({ crew, positions, color }: { crew: Crew; positions: Record<string, XZ>; color: string }) {
  const body = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const mats = useMemo(() => ({
    skin: new THREE.MeshStandardMaterial({ map: pixelTexture('skin') }),
    hat: new THREE.MeshStandardMaterial({ map: pixelTexture('gold'), emissive: '#ca8a04', emissiveIntensity: 0.2 }),
    shirt: new THREE.MeshStandardMaterial({ color, map: pixelTexture('metal') }),
    pants: new THREE.MeshStandardMaterial({ map: pixelTexture('pants') }),
    wood: new THREE.MeshStandardMaterial({ map: pixelTexture('plank') }),
    iron: new THREE.MeshStandardMaterial({ map: pixelTexture('metal'), metalness: 0.4 }),
  }), [color])

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    crewStep(crew, positions, t, Math.min(dt, 0.1))
    const g = body.current
    if (!g) return
    const walking = crew.mode === 'walking'
    const building = crew.mode === 'building'
    const swing = walking ? Math.sin(t * 12) * 0.8 : 0
    g.position.set(crew.pos[0], walking ? Math.abs(Math.sin(t * 12)) * 0.08 : 0, crew.pos[1])
    if (walking) g.rotation.y = crew.heading
    else if (building) g.rotation.y += (Math.PI * 0.75 - g.rotation.y) * 0.2 // face the site
    if (legR.current) legR.current.rotation.x = swing
    if (legL.current) legL.current.rotation.x = -swing
    if (armL.current) armL.current.rotation.x = -swing
    if (armR.current) armR.current.rotation.x = building ? -2.2 + Math.abs(Math.sin(t * 10)) * 1.9 : swing
  })

  return (
    <group ref={body} scale={1.5}>
      <group ref={legL} position={[-0.12, 0.62, 0]}><mesh geometry={LIMB} material={mats.pants} position={[0, -0.31, 0]} castShadow /></group>
      <group ref={legR} position={[0.12, 0.62, 0]}><mesh geometry={LIMB} material={mats.pants} position={[0, -0.31, 0]} castShadow /></group>
      <mesh geometry={BODY} material={mats.shirt} position={[0, 0.97, 0]} castShadow />
      <group ref={armL} position={[-0.36, 1.26, 0]}><mesh geometry={LIMB} material={mats.shirt} position={[0, -0.28, 0]} castShadow /></group>
      <group ref={armR} position={[0.36, 1.26, 0]}>
        <mesh geometry={LIMB} material={mats.shirt} position={[0, -0.28, 0]} castShadow />
        <mesh geometry={HANDLE} material={mats.wood} position={[0, -0.6, 0.2]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={HAMMER} material={mats.iron} position={[0, -0.6, 0.45]} />
      </group>
      <mesh geometry={HEAD} material={mats.skin} position={[0, 1.57, 0]} castShadow />
      <mesh geometry={HAT} material={mats.hat} position={[0, 1.86, 0]} castShadow />
    </group>
  )
}

const SPARK = box(0.12, 0.12, 0.12)
const SPARK_MATS = [new THREE.MeshBasicMaterial({ color: '#fde047', toneMapped: false }), new THREE.MeshBasicMaterial({ color: '#fb923c', toneMapped: false })]

/** Little cube sparks over a site while it is being built. */
export function Sparks({ at, crew, id }: { at: XZ; crew: Crew; id: string }) {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const start = crew.started.get(id)
    const age = start === undefined ? -1 : clock.elapsedTime - start
    const on = age >= 0 && age < 1.3
    g.visible = on
    if (!on) return
    g.children.forEach((c, i) => {
      const a = i * 1.7 + age * 6
      const k = (age * 1.5 + i * 0.13) % 1
      c.position.set(Math.cos(a) * (0.6 + k), 0.4 + k * 2.4, Math.sin(a) * (0.6 + k))
    })
  })
  return (
    <group ref={group} position={[at[0], 0, at[1]]} visible={false}>
      {Array.from({ length: 10 }, (_, i) => <mesh key={i} geometry={SPARK} material={SPARK_MATS[i % 2]} />)}
    </group>
  )
}
