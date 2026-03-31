import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, RoundedBox, Html } from '@react-three/drei'
import { motion } from 'framer-motion'
import * as THREE from 'three'

const BUBBLES = [
  {
    text: "Whatever, do what you want.",
    sender: "A", tag: "Stonewalling", tagColor: "#f87171",
    pos: [-2.7, 1.75, -1.0], side: 'left', floatSpeed: 0.48, floatAmp: 0.09,
  },
  {
    text: "You always do this.",
    sender: "B", tag: "Criticism", tagColor: "#fbbf24",
    pos: [2.5, 0.85, -1.4], side: 'right', floatSpeed: 0.55, floatAmp: 0.07,
  },
  {
    text: "I don't even care anymore.",
    sender: "A", tag: "Contempt", tagColor: "#a78bfa",
    pos: [-2.3, -0.55, -1.8], side: 'left', floatSpeed: 0.42, floatAmp: 0.11,
  },
  {
    text: "That's not what I said.",
    sender: "B", tag: "Defensiveness", tagColor: "#34d399",
    pos: [2.7, -1.55, -1.1], side: 'right', floatSpeed: 0.62, floatAmp: 0.08,
  },
  {
    text: "Fine.",
    sender: "A", tag: "Stonewalling", tagColor: "#f87171",
    pos: [-1.6, -2.4, -0.7], side: 'left', floatSpeed: 0.38, floatAmp: 0.06,
  },
]

const TAG_COLORS = {
  Stonewalling: { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.35)', text: '#fca5a5' },
  Criticism:    { bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.30)',  text: '#fde68a' },
  Contempt:     { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.35)', text: '#ddd6fe' },
  Defensiveness:{ bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.28)',  text: '#6ee7b7' },
}

function KinematicLabel({ tag }) {
  const defensivenessAnim = {
    x: tag === 'Defensiveness' ? [0, -1.4, 1.4, -1.0, 1.0, -0.5, 0.5, 0] : 0,
    transition: tag === 'Defensiveness'
      ? { duration: 0.42, repeat: Infinity, repeatDelay: 2.5, ease: 'easeInOut' }
      : {}
  }

  const contemptStyle = tag === 'Contempt'
    ? { animation: 'contempt-weight 2.8s ease-in-out infinite' }
    : {}

  const colors = TAG_COLORS[tag] || TAG_COLORS.Stonewalling

  return (
    <div style={{
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
      padding: '5px 10px',
      display: 'inline-flex',
      alignItems: 'center',
    }}>
      <motion.span
        animate={defensivenessAnim}
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: colors.text,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontFamily: "'DM Sans', sans-serif",
          whiteSpace: 'nowrap',
          ...contemptStyle,
        }}
      >
        {tag}
      </motion.span>
    </div>
  )
}

function Bubble({ data, scrollProgress, index }) {
  const groupRef = useRef()
  const materialsRef = useRef([])
  const floatOffset = useMemo(() => Math.random() * Math.PI * 2, [])

  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime

    // Bubbles enter around 0.24, staggered
    const enterStart = 0.24 + index * 0.025
    const raw = (scrollProgress - enterStart) / 0.12
    const enterP = Math.max(0, Math.min(1, raw))

    let eased
    if (enterP < 0.6) {
      eased = 3.375 * enterP * enterP * enterP
    } else {
      const p = enterP - 1
      eased = 1 + p * p * p * ((1.7 + 1) * p + 1.7)
    }
    const clampedEased = Math.min(1, Math.max(0, eased))

    const floatY = Math.sin(t * data.floatSpeed + floatOffset) * data.floatAmp
    const floatX = Math.cos(t * data.floatSpeed * 0.6 + floatOffset) * data.floatAmp * 0.4

    groupRef.current.position.set(
      data.pos[0] + floatX,
      data.pos[1] + floatY + (1 - clampedEased) * -2.5,
      data.pos[2]
    )
    groupRef.current.scale.setScalar(clampedEased)
    groupRef.current.rotation.y = Math.sin(t * 0.28 + floatOffset) * 0.05

    const parallaxZ = scrollProgress * data.pos[2] * -0.3
    groupRef.current.position.z = data.pos[2] + parallaxZ

    // Fade out as diagnosis section approaches (~0.55+)
    const fadeOut = scrollProgress > 0.52
      ? Math.max(0, 1 - (scrollProgress - 0.52) / 0.10)
      : 1

    if (materialsRef.current.length === 0) {
      groupRef.current.traverse(child => {
        if (child.isMesh && child.material) {
          materialsRef.current.push({
            mat: child.material,
            baseOpacity: child.userData.baseOpacity ?? child.material.opacity,
          })
        }
      })
    }
    for (const { mat, baseOpacity } of materialsRef.current) {
      mat.opacity = fadeOut * baseOpacity
    }
  })

  const bubbleColor = data.side === 'left' ? '#120a24' : '#0a1220'
  const W = 2.0
  const H = 0.6

  return (
    <group ref={groupRef} scale={0}>
      <RoundedBox args={[W, H, 0.065]} radius={0.11} smoothness={4} position={[0, 0, 0]}>
        <meshStandardMaterial color={bubbleColor} roughness={0.28} metalness={0.55} transparent opacity={0.93} />
      </RoundedBox>

      <RoundedBox args={[W + 0.022, H + 0.022, 0.058]} radius={0.12} smoothness={4}>
        <meshStandardMaterial color={data.tagColor} emissive={data.tagColor} emissiveIntensity={0.35} transparent opacity={0.22} />
      </RoundedBox>

      <Text
        position={[0, 0.07, 0.045]}
        fontSize={0.108}
        color="#e8e6f0"
        anchorX="center"
        anchorY="middle"
        maxWidth={1.72}
        font="https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZ2IHTWEBlwu8Q.woff2"
      >
        {data.text}
      </Text>

      <mesh
        position={[data.side === 'left' ? -(W / 2 + 0.18) : (W / 2 + 0.18), 0, 0]}
        userData={{ baseOpacity: 1 }}
      >
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={data.tagColor} emissive={data.tagColor} emissiveIntensity={0.65} transparent opacity={1} />
      </mesh>

      <Html
        position={[data.side === 'left' ? 0.45 : -0.45, -0.38, 0.045]}
        center
        distanceFactor={8}
        zIndexRange={[10, 20]}
        style={{ pointerEvents: 'none' }}
      >
        <style>{`
          @keyframes contempt-weight {
            0%, 100% { font-weight: 300; opacity: 0.7; }
            45%, 55%  { font-weight: 700; opacity: 1; letter-spacing: 0.1em; }
          }
        `}</style>
        <KinematicLabel tag={data.tag} />
      </Html>
    </group>
  )
}

export default function ChatBubbles({ scrollProgress, visible }) {
  if (!visible) return null

  return (
    <group>
      {BUBBLES.map((b, i) => (
        <Bubble key={i} data={b} scrollProgress={scrollProgress} index={i} />
      ))}
    </group>
  )
}
