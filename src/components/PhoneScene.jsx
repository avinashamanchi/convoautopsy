import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

// ── Shard geometry (glass fragment) ──────────────────────────────
function createShardGeo(seed) {
  const rng = (() => { let s = seed; return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff } })()
  const w = 0.25 + rng() * 0.55
  const h = 0.35 + rng() * 0.75
  const d = 0.03 + rng() * 0.05
  const geo = new THREE.BoxGeometry(w, h, d)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) + (rng() - 0.5) * 0.07)
    pos.setY(i, pos.getY(i) + (rng() - 0.5) * 0.07)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

function PhoneShard({ seed, explodeDir, scrollProgressRef }) {
  const meshRef = useRef()
  const matRef = useRef()
  const geo = useMemo(() => createShardGeo(seed), [seed])

  const rng = useMemo(() => {
    let s = seed + 99
    return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }
  }, [seed])

  const startPos = useMemo(() => new THREE.Vector3((rng() - 0.5) * 1.8, (rng() - 0.5) * 3.4, (rng() - 0.5) * 0.2), [])
  const explodeVec = useMemo(() => new THREE.Vector3(
    explodeDir.x + (rng() - 0.5) * 3.5,
    explodeDir.y + (rng() - 0.5) * 3.5,
    (rng() - 0.5) * 5 + 2
  ), [explodeDir])
  const rotSpeed = useMemo(() => new THREE.Vector3((rng() - 0.5) * 5, (rng() - 0.5) * 5, (rng() - 0.5) * 5), [])

  useFrame(() => {
    const mesh = meshRef.current
    const mat = matRef.current
    if (!mesh || !mat) return
    const progress = scrollProgressRef.current || 0

    // Shard entrance: fade in quickly when shatter begins
    const enter = Math.max(0, Math.min(1, (progress - 0.05) / 0.03))
    // Shard exit: fade out near end of scroll
    const exit = progress > 0.72 ? Math.max(0, 1 - (progress - 0.72) / 0.12) : 1
    mat.opacity = enter * exit

    // Explosion progress (eased in-out)
    const ep = Math.max(0, Math.min(1, (progress - 0.05) / 0.6))
    const eased = ep < 0.5 ? 2 * ep * ep : 1 - Math.pow(-2 * ep + 2, 2) / 2

    mesh.position.set(
      startPos.x + explodeVec.x * eased,
      startPos.y + explodeVec.y * eased,
      startPos.z + explodeVec.z * eased
    )
    mesh.rotation.set(rotSpeed.x * eased, rotSpeed.y * eased, rotSpeed.z * eased)
  })

  return (
    <mesh ref={meshRef} geometry={geo} position={startPos}>
      <meshStandardMaterial
        ref={matRef}
        color="#c4b5fd"
        roughness={0.08}
        metalness={0.35}
        transparent
        opacity={0}
      />
    </mesh>
  )
}

// ── iPhone screen content ─────────────────────────────────────────
const SCREEN_BUBBLES = [
  { text: "are you serious rn",        right: false, y: 0.92 },
  { text: "what did i do",              right: true,  y: 0.42 },
  { text: "you know what you did",      right: false, y: -0.08 },
  { text: "can we not do this",         right: true,  y: -0.55 },
  { text: "fine. whatever",             right: false, y: -1.02 },
]

function IPhoneScreen() {
  const sw = 1.38, sh = 2.9
  return (
    <group>
      {/* Screen background */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[sw, sh]} />
        <meshStandardMaterial color="#000000" />
      </mesh>

      {/* Status bar background */}
      <mesh position={[0, sh / 2 - 0.13, 0.001]}>
        <planeGeometry args={[sw, 0.26]} />
        <meshStandardMaterial color="#050505" />
      </mesh>

      {/* Time indicator (9:41 simulated as thick pill) */}
      <mesh position={[-0.46, sh / 2 - 0.1, 0.002]}>
        <planeGeometry args={[0.23, 0.055]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.9} />
      </mesh>

      {/* Signal bars (3 ascending) */}
      {[0, 1, 2].map(i => (
        <mesh key={i} position={[0.38 + i * 0.065, sh / 2 - 0.115 + i * 0.008, 0.002]}>
          <boxGeometry args={[0.035, 0.025 + i * 0.018, 0.001]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.85} />
        </mesh>
      ))}

      {/* WiFi arc (simplified as small square) */}
      <mesh position={[0.51, sh / 2 - 0.1, 0.002]}>
        <planeGeometry args={[0.055, 0.048]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.75} />
      </mesh>

      {/* Battery */}
      <mesh position={[0.59, sh / 2 - 0.1, 0.002]}>
        <planeGeometry args={[0.1, 0.048]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.8} />
      </mesh>
      {/* Battery nub */}
      <mesh position={[0.645, sh / 2 - 0.1, 0.002]}>
        <planeGeometry args={[0.016, 0.024]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.6} />
      </mesh>

      {/* Dynamic Island */}
      <RoundedBox args={[0.44, 0.115, 0.006]} radius={0.057} smoothness={8} position={[0, sh / 2 - 0.32, 0.003]}>
        <meshStandardMaterial color="#000000" />
      </RoundedBox>

      {/* Chat header separator */}
      <mesh position={[0, sh / 2 - 0.56, 0.001]}>
        <planeGeometry args={[sw, 0.001]} />
        <meshStandardMaterial color="#2a2a2e" />
      </mesh>

      {/* Contact avatar circle */}
      <mesh position={[0, sh / 2 - 0.72, 0.002]}>
        <circleGeometry args={[0.13, 24]} />
        <meshStandardMaterial color="#3a3a3c" />
      </mesh>
      {/* Contact name pill */}
      <mesh position={[0, sh / 2 - 0.92, 0.002]}>
        <planeGeometry args={[0.38, 0.046]} />
        <meshStandardMaterial color="#3a3a3c" transparent opacity={0.8} />
      </mesh>

      {/* iMessage bubbles */}
      {SCREEN_BUBBLES.map((b, i) => (
        <group key={i} position={[b.right ? 0.2 : -0.2, b.y, 0.002]}>
          <RoundedBox
            args={[0.78, 0.19, 0.005]}
            radius={0.095}
            smoothness={6}
          >
            <meshStandardMaterial
              color={b.right ? '#007AFF' : '#3a3a3c'}
              emissive={b.right ? '#004faa' : '#1a1a1e'}
              emissiveIntensity={0.4}
            />
          </RoundedBox>
          {/* Simulated text line */}
          <mesh position={[0, 0, 0.004]}>
            <planeGeometry args={[0.56, 0.028]} />
            <meshStandardMaterial color={b.right ? '#cce3ff' : '#888893'} transparent opacity={0.75} />
          </mesh>
        </group>
      ))}

      {/* Home indicator */}
      <mesh position={[0, -sh / 2 + 0.1, 0.002]}>
        <planeGeometry args={[0.36, 0.022]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.28} />
      </mesh>
    </group>
  )
}

// ── Full iPhone body ──────────────────────────────────────────────
function IntactPhone({ scrollProgressRef }) {
  const phoneRef = useRef()

  useFrame((state) => {
    const phone = phoneRef.current
    if (!phone) return
    const t = state.clock.elapsedTime
    const progress = scrollProgressRef.current || 0

    // Idle float + gentle rotation
    phone.rotation.y = Math.sin(t * 0.38) * 0.1 + progress * Math.PI * 0.08
    phone.position.y = Math.sin(t * 0.55) * 0.07

    // Fade out as shatter begins
    const opacity = Math.max(0, 1 - Math.max(0, (progress - 0.04) / 0.08))
    phone.traverse(child => {
      if (child.isMesh && child.material) child.material.opacity = opacity
    })
  })

  // Titanium silver material (reused)
  const titaniumProps = { color: '#c8c3bc', roughness: 0.1, metalness: 0.88, transparent: true, opacity: 1 }
  const buttonProps = { color: '#b5b0a9', roughness: 0.08, metalness: 0.92, transparent: true, opacity: 1 }

  return (
    <group ref={phoneRef} position={[0.95, 0.05, 0]}>
      {/* ── Main frame ── */}
      <RoundedBox args={[1.6, 3.2, 0.17]} radius={0.165} smoothness={12}>
        <meshStandardMaterial {...titaniumProps} />
      </RoundedBox>

      {/* ── Screen glass (flush with front face) ── */}
      <mesh position={[0, 0, 0.087]}>
        <planeGeometry args={[1.38, 2.9]} />
        <meshStandardMaterial color="#060608" roughness={0.04} metalness={0.0} transparent opacity={1} />
      </mesh>

      {/* ── Screen content ── */}
      <group position={[0, 0, 0.09]}>
        <IPhoneScreen />
      </group>

      {/* ── Camera island (top left bump) ── */}
      <group position={[-0.33, 1.1, 0.115]}>
        {/* Square module */}
        <mesh>
          <boxGeometry args={[0.6, 0.6, 0.09]} />
          <meshStandardMaterial color="#b0aba4" roughness={0.06} metalness={0.92} transparent opacity={1} />
        </mesh>
        {/* Module border (slightly rounded effect) */}
        <RoundedBox args={[0.62, 0.62, 0.082]} radius={0.1} smoothness={8} position={[0, 0, 0.002]}>
          <meshStandardMaterial color="#a8a39c" roughness={0.06} metalness={0.95} transparent opacity={1} />
        </RoundedBox>

        {/* 3 Camera lenses: wide, ultra-wide, telephoto */}
        {[[-0.13, 0.13], [0.13, 0.13], [-0.13, -0.13]].map(([lx, ly], i) => (
          <group key={i} position={[lx, ly, 0.052]}>
            {/* Outer ring */}
            <mesh>
              <cylinderGeometry args={[0.105, 0.105, 0.03, 28]} />
              <meshStandardMaterial color="#1c1c1e" roughness={0.05} metalness={0.8} transparent opacity={1} />
            </mesh>
            {/* Lens glass */}
            <mesh position={[0, 0, 0.02]}>
              <cylinderGeometry args={[0.078, 0.078, 0.012, 28]} />
              <meshStandardMaterial color="#05050a" roughness={0.02} metalness={0.1} transparent opacity={1} />
            </mesh>
            {/* Lens reflection */}
            <mesh position={[-0.025, 0.025, 0.027]}>
              <circleGeometry args={[0.022, 16]} />
              <meshStandardMaterial color="#ffffff" transparent opacity={0.18} />
            </mesh>
          </group>
        ))}

        {/* LiDAR sensor (bottom right of module) */}
        <mesh position={[0.13, -0.13, 0.052]}>
          <cylinderGeometry args={[0.055, 0.055, 0.02, 20]} />
          <meshStandardMaterial color="#1a1a22" roughness={0.15} metalness={0.4} transparent opacity={1} />
        </mesh>
      </group>

      {/* ── Side buttons (right) ── */}
      {/* Power / side button */}
      <mesh position={[0.825, 0.3, 0]}>
        <boxGeometry args={[0.045, 0.42, 0.12]} />
        <meshStandardMaterial {...buttonProps} />
      </mesh>

      {/* ── Side buttons (left) ── */}
      {/* Mute switch */}
      <mesh position={[-0.825, 0.92, 0]}>
        <boxGeometry args={[0.045, 0.16, 0.11]} />
        <meshStandardMaterial {...buttonProps} />
      </mesh>
      {/* Volume up */}
      <mesh position={[-0.825, 0.56, 0]}>
        <boxGeometry args={[0.045, 0.26, 0.11]} />
        <meshStandardMaterial {...buttonProps} />
      </mesh>
      {/* Volume down */}
      <mesh position={[-0.825, 0.18, 0]}>
        <boxGeometry args={[0.045, 0.26, 0.11]} />
        <meshStandardMaterial {...buttonProps} />
      </mesh>

      {/* ── Bottom edge: USB-C port area ── */}
      <mesh position={[0, -1.595, 0]}>
        <boxGeometry args={[0.32, 0.04, 0.17]} />
        <meshStandardMaterial color="#0a0a0c" roughness={0.4} metalness={0.5} transparent opacity={1} />
      </mesh>
    </group>
  )
}

// ── Main export ────────────────────────────────────────────────────
const SHARD_COUNT = 28

export default function PhoneScene({ scrollProgressRef }) {
  const groupRef = useRef()

  const explodeDirs = useMemo(() =>
    Array.from({ length: SHARD_COUNT }, (_, i) => {
      const angle = (i / SHARD_COUNT) * Math.PI * 2
      return { x: Math.cos(angle) * 1.6, y: Math.sin(angle) * 1.6 }
    }), [])

  useFrame((state) => {
    if (!groupRef.current) return
    groupRef.current.rotation.y = (scrollProgressRef.current || 0) * Math.PI * 0.08
  })

  return (
    <group ref={groupRef}>
      {/* Always mounted — opacity controlled in useFrame for smooth bidirectional scroll */}
      <IntactPhone scrollProgressRef={scrollProgressRef} />
      {Array.from({ length: SHARD_COUNT }, (_, i) => (
        <PhoneShard
          key={i}
          seed={i * 31 + 7}
          explodeDir={explodeDirs[i]}
          scrollProgressRef={scrollProgressRef}
        />
      ))}
    </group>
  )
}
