import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

/* ─────────────────────────────────────────────────────────────────
   TIMING — phone lives across ALL scroll sections
   Total scroll: ~700vh → progress 0 to 1
   Hero:       0.00 – 0.14
   Spacer:     0.14 – 0.28
   Bubbles:    0.28 – 0.42
   Psychology: 0.42 – 0.57
   Diagnosis:  0.57 – 0.71
   Share:      0.71 – 0.85
   CTA:        0.85 – 1.00
   ───────────────────────────────────────────────────────────────── */
const SHATTER_START       = 0.38   // phone starts cracking (psychology section)
const SHATTER_FULL        = 0.42   // phone body gone, shards only
const SHATTER_END         = 0.62   // shards fully dispersed
const SHARDS_GONE         = 0.72   // unmount shards

const SHARD_COUNT = 30

/* ── Helpers ──────────────────────────────────────────────────────── */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/* ── Single shard ─────────────────────────────────────────────── */
function PhoneShard({ index, total, progress, explodeVec, startPos, rotSpeed, size }) {
  const meshRef = useRef()
  const delay = (index / total) * 0.04

  useFrame(() => {
    if (!meshRef.current) return

    const raw = (progress - SHATTER_START - delay) / (SHATTER_END - SHATTER_START)
    const p = Math.max(0, Math.min(1, raw))
    const eased = 1 - Math.pow(1 - p, 3)

    meshRef.current.position.set(
      startPos.x + explodeVec.x * eased,
      startPos.y + explodeVec.y * eased,
      startPos.z + explodeVec.z * eased
    )

    meshRef.current.rotation.set(
      rotSpeed.x * eased,
      rotSpeed.y * eased,
      rotSpeed.z * eased
    )

    // Visible during shatter, fade out late
    const fadeIn  = Math.min(1, p * 6)
    const fadeOut = 1 - smoothstep(0.5, 1.0, eased)
    meshRef.current.material.opacity = fadeIn * fadeOut
  })

  return (
    <mesh ref={meshRef} position={[startPos.x, startPos.y, startPos.z]}>
      <boxGeometry args={[size.w, size.h, size.d]} />
      <meshPhysicalMaterial
        color="#c4b5fd"
        roughness={0.08}
        transmission={0.88}
        thickness={0.4}
        ior={1.5}
        transparent
        opacity={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/* ── Intact phone ─────────────────────────────────────────────── */
function IntactPhone({ progress }) {
  const groupRef = useRef()
  const materialsRef = useRef([])

  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime

    // ── Phase 1 (0–0.14): idle float, right side ──
    // ── Phase 2 (0.14–0.28): drift to center, rotate ──
    // ── Phase 3 (0.28–0.42): wobble + move left, getting "examined" ──
    // ── Phase 4 (0.38+): crack and fade ──

    const idleFloat = Math.sin(t * 0.5) * 0.08

    // X position: starts at 0.9 (right), drifts center then left
    const xStart = 0.9
    const xDrift = -smoothstep(0.10, 0.35, progress) * 1.8
    const posX = xStart + xDrift

    // Y position: drifts down gently across sections
    const yDrift = -smoothstep(0.0, 0.40, progress) * 1.5
    const posY = idleFloat + yDrift

    // Z: comes slightly forward mid-journey
    const posZ = smoothstep(0.10, 0.25, progress) * 1.2 - smoothstep(0.30, 0.42, progress) * 0.8

    groupRef.current.position.set(posX, posY, posZ)

    // Rotation: progressive tilt as sections scroll
    const baseRotY = Math.sin(t * 0.35) * 0.08
    const scrollRotY = smoothstep(0.10, 0.40, progress) * 0.8
    const scrollRotX = -smoothstep(0.20, 0.40, progress) * 0.3
    const scrollRotZ = smoothstep(0.30, 0.42, progress) * 0.15

    groupRef.current.rotation.set(
      Math.sin(t * 0.25) * 0.03 + scrollRotX,
      baseRotY + scrollRotY,
      scrollRotZ
    )

    // Scale: slightly larger as it approaches, then shrinks before shatter
    const scaleUp = 1 + smoothstep(0.12, 0.25, progress) * 0.15
    const scaleCrack = 1 - smoothstep(0.35, 0.42, progress) * 0.2
    groupRef.current.scale.setScalar(scaleUp * scaleCrack)

    // Vibrate when cracking (0.36+)
    if (progress > 0.34) {
      const vibAmt = smoothstep(0.34, 0.42, progress) * 0.03
      groupRef.current.position.x += (Math.random() - 0.5) * vibAmt
      groupRef.current.position.y += (Math.random() - 0.5) * vibAmt
    }

    // Opacity: fade starting at shatter
    const opacity = 1 - smoothstep(SHATTER_START, SHATTER_FULL, progress)

    if (materialsRef.current.length === 0) {
      groupRef.current.traverse(child => {
        if (child.isMesh && child.material) {
          materialsRef.current.push({
            mat: child.material,
            baseOpacity: child.material.opacity,
          })
        }
      })
    }
    for (const { mat, baseOpacity } of materialsRef.current) {
      mat.opacity = opacity * baseOpacity
    }
  })

  return (
    <group ref={groupRef} position={[0.9, 0, 0]}>
      {/* Body — frosted glass */}
      <RoundedBox args={[1.5, 3.1, 0.12]} radius={0.12} smoothness={6}>
        <meshPhysicalMaterial
          color="#e2d9f3"
          roughness={0.05}
          transmission={0.78}
          thickness={0.5}
          ior={1.55}
          transparent
          opacity={1}
          side={THREE.DoubleSide}
        />
      </RoundedBox>

      {/* Screen */}
      <mesh position={[0, 0, 0.068]}>
        <planeGeometry args={[1.26, 2.82]} />
        <meshStandardMaterial color="#05000e" roughness={0.05} metalness={0.2} transparent opacity={1} />
      </mesh>

      {/* Screen glow */}
      <mesh position={[0, 0, 0.074]}>
        <planeGeometry args={[1.26, 2.82]} />
        <meshStandardMaterial color="#5b21b6" emissive="#3b0764" emissiveIntensity={1.1} transparent opacity={0.18} />
      </mesh>

      {/* Chat bubbles on screen */}
      {[
        { y: 0.85, x: -0.22, color: '#5b21b6' },
        { y: 0.32, x:  0.22, color: '#1e1b4b' },
        { y: -0.20, x: -0.22, color: '#5b21b6' },
        { y: -0.72, x:  0.22, color: '#1e1b4b' },
      ].map((b, i) => (
        <mesh key={i} position={[b.x, b.y, 0.082]}>
          <boxGeometry args={[0.66, 0.17, 0.005]} />
          <meshStandardMaterial color={b.color} transparent opacity={0.92} />
        </mesh>
      ))}

      {/* Dynamic island */}
      <mesh position={[0, 1.44, 0.082]}>
        <boxGeometry args={[0.28, 0.1, 0.005]} />
        <meshStandardMaterial color="#020008" transparent opacity={1} />
      </mesh>

      {/* Power button */}
      <mesh position={[0.77, 0.28, 0]}>
        <boxGeometry args={[0.025, 0.26, 0.07]} />
        <meshStandardMaterial color="#8b8fa8" metalness={0.9} roughness={0.15} transparent opacity={1} />
      </mesh>

      {/* Volume buttons */}
      {[0.12, -0.12].map((dy, i) => (
        <mesh key={i} position={[-0.77, dy, 0]}>
          <boxGeometry args={[0.025, 0.16, 0.07]} />
          <meshStandardMaterial color="#8b8fa8" metalness={0.9} roughness={0.15} transparent opacity={1} />
        </mesh>
      ))}
    </group>
  )
}

/* ── Root scene ───────────────────────────────────────────────────── */
export default function PhoneScene({ scrollProgress }) {
  const groupRef = useRef()

  const shardData = useMemo(() => {
    return Array.from({ length: SHARD_COUNT }, (_, i) => {
      const angle = (i / SHARD_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
      const r = 2.0 + Math.random() * 2.0
      return {
        startPos: new THREE.Vector3(
          (Math.random() - 0.5) * 1.4 - 0.5,
          (Math.random() - 0.5) * 2.9 - 0.8,
          (Math.random() - 0.5) * 0.1
        ),
        explodeVec: new THREE.Vector3(
          Math.cos(angle) * r,
          Math.sin(angle) * r,
          (Math.random() - 0.3) * 4.0
        ),
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7
        ),
        size: {
          w: 0.2 + Math.random() * 0.5,
          h: 0.25 + Math.random() * 0.65,
          d: 0.03,
        },
      }
    })
  }, [])

  useFrame(() => {
    if (!groupRef.current) return
    groupRef.current.rotation.y = scrollProgress * Math.PI * 0.05
  })

  const showPhone = scrollProgress < SHATTER_FULL
  const showShards = scrollProgress >= SHATTER_START && scrollProgress < SHARDS_GONE

  return (
    <group ref={groupRef}>
      {showPhone && <IntactPhone progress={scrollProgress} />}

      {showShards && shardData.map((d, i) => (
        <PhoneShard
          key={i}
          index={i}
          total={SHARD_COUNT}
          progress={scrollProgress}
          startPos={d.startPos}
          explodeVec={d.explodeVec}
          rotSpeed={d.rotSpeed}
          size={d.size}
        />
      ))}
    </group>
  )
}
