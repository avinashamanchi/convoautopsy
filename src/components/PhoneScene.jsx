import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox, MeshTransmissionMaterial } from '@react-three/drei'
import * as THREE from 'three'

// Generate Voronoi-ish shard geometry for shatter effect
function createShardGeometry(index, total) {
  const angle = (index / total) * Math.PI * 2
  const radius = 0.2 + Math.random() * 0.6
  const width = 0.3 + Math.random() * 0.5
  const height = 0.4 + Math.random() * 0.7
  const depth = 0.04 + Math.random() * 0.06

  const geo = new THREE.BoxGeometry(width, height, depth)
  // Slightly deform vertices for shard feel
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) + (Math.random() - 0.5) * 0.08)
    pos.setY(i, pos.getY(i) + (Math.random() - 0.5) * 0.08)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

function PhoneShard({ index, total, progress, explodeDir }) {
  const meshRef = useRef()
  const geo = useMemo(() => createShardGeometry(index, total), [index, total])

  const startPos = useMemo(() => new THREE.Vector3(
    (Math.random() - 0.5) * 1.6,
    (Math.random() - 0.5) * 3.2,
    (Math.random() - 0.5) * 0.2
  ), [])

  const explodeVec = useMemo(() => new THREE.Vector3(
    explodeDir.x + (Math.random() - 0.5) * 3,
    explodeDir.y + (Math.random() - 0.5) * 3,
    (Math.random() - 0.5) * 4 + 1.5
  ), [explodeDir])

  const rotSpeed = useMemo(() => new THREE.Vector3(
    (Math.random() - 0.5) * 4,
    (Math.random() - 0.5) * 4,
    (Math.random() - 0.5) * 4
  ), [])

  useFrame(() => {
    if (!meshRef.current) return
    const p = Math.max(0, (progress - 0.1) / 0.5) // shatter window: 10%-60% scroll
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2

    meshRef.current.position.set(
      startPos.x + explodeVec.x * eased,
      startPos.y + explodeVec.y * eased,
      startPos.z + explodeVec.z * eased
    )
    meshRef.current.rotation.x = rotSpeed.x * eased
    meshRef.current.rotation.y = rotSpeed.y * eased
    meshRef.current.rotation.z = rotSpeed.z * eased
    meshRef.current.material.opacity = 1 - eased * 0.85
  })

  return (
    <mesh ref={meshRef} geometry={geo} position={startPos}>
      <MeshTransmissionMaterial
        backside
        samples={4}
        thickness={0.3}
        roughness={0.05}
        transmission={0.95}
        ior={1.5}
        chromaticAberration={0.06}
        anisotropy={0.3}
        color="#c4b5fd"
        distortionScale={0.1}
        temporalDistortion={0.1}
        transparent
        opacity={1}
      />
    </mesh>
  )
}

function IntactPhone({ progress }) {
  const phoneRef = useRef()
  const screenRef = useRef()

  useFrame((state) => {
    if (!phoneRef.current) return
    const t = state.clock.elapsedTime
    // Idle float
    phoneRef.current.rotation.y = Math.sin(t * 0.4) * 0.12
    phoneRef.current.position.y = Math.sin(t * 0.6) * 0.08

    // Fade out as shatter begins
    const opacity = Math.max(0, 1 - progress * 8)
    phoneRef.current.traverse(child => {
      if (child.material) child.material.opacity = opacity
    })
  })

  return (
    <group ref={phoneRef} position={[1.2, 0, 0]}>
      {/* Phone body */}
      <RoundedBox args={[1.6, 3.2, 0.14]} radius={0.14} smoothness={8}>
        <MeshTransmissionMaterial
          backside
          samples={6}
          thickness={0.4}
          roughness={0.02}
          transmission={0.92}
          ior={1.6}
          chromaticAberration={0.04}
          anisotropy={0.5}
          color="#d8b4fe"
          distortionScale={0.05}
          temporalDistortion={0.05}
          transparent
          opacity={1}
        />
      </RoundedBox>

      {/* Screen surface */}
      <mesh position={[0, 0, 0.075]} ref={screenRef}>
        <planeGeometry args={[1.35, 2.9]} />
        <meshStandardMaterial
          color="#0a0010"
          roughness={0.1}
          metalness={0.3}
          transparent
          opacity={1}
        />
      </mesh>

      {/* Screen glow */}
      <mesh position={[0, 0, 0.08]}>
        <planeGeometry args={[1.35, 2.9]} />
        <meshStandardMaterial
          color="#7c3aed"
          emissive="#4c1d95"
          emissiveIntensity={0.8}
          transparent
          opacity={0.15}
        />
      </mesh>

      {/* Chat bubbles on screen */}
      {[
        { y: 0.9, color: '#6d28d9', right: false },
        { y: 0.35, color: '#1f1635', right: true },
        { y: -0.2, color: '#6d28d9', right: false },
        { y: -0.75, color: '#1f1635', right: true },
      ].map((b, i) => (
        <mesh key={i} position={[b.right ? 0.25 : -0.25, b.y, 0.09]}>
          <boxGeometry args={[0.7, 0.2, 0.01]} />
          <meshStandardMaterial color={b.color} transparent opacity={0.9} />
        </mesh>
      ))}

      {/* Camera notch */}
      <mesh position={[0, 1.52, 0.08]}>
        <cylinderGeometry args={[0.06, 0.06, 0.02, 16]} />
        <meshStandardMaterial color="#0a0010" />
      </mesh>
    </group>
  )
}

export default function PhoneScene({ scrollProgress }) {
  const groupRef = useRef()
  const SHARD_COUNT = 24

  const explodeDirs = useMemo(() =>
    Array.from({ length: SHARD_COUNT }, (_, i) => {
      const angle = (i / SHARD_COUNT) * Math.PI * 2
      return { x: Math.cos(angle) * 1.5, y: Math.sin(angle) * 1.5 }
    }), [])

  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime
    groupRef.current.rotation.y = scrollProgress * Math.PI * 0.15
  })

  const showIntact = scrollProgress < 0.12
  const showShards = scrollProgress > 0.05

  return (
    <group ref={groupRef}>
      {showIntact && <IntactPhone progress={scrollProgress} />}
      {showShards && Array.from({ length: SHARD_COUNT }, (_, i) => (
        <PhoneShard
          key={i}
          index={i}
          total={SHARD_COUNT}
          progress={scrollProgress}
          explodeDir={explodeDirs[i]}
        />
      ))}
    </group>
  )
}
