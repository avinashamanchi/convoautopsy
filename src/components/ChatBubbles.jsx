import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

const BUBBLES = [
  {
    text: "Whatever, do what you want.",
    sender: "A",
    tag: "Stonewalling",
    tagColor: "#f87171",
    pos: [-2.8, 1.8, -1],
    side: 'left'
  },
  {
    text: "You always do this.",
    sender: "B",
    tag: "Criticism",
    tagColor: "#fbbf24",
    pos: [2.4, 0.8, -1.5],
    side: 'right'
  },
  {
    text: "I don't even care anymore.",
    sender: "A",
    tag: "Contempt",
    tagColor: "#a78bfa",
    pos: [-2.2, -0.6, -2],
    side: 'left'
  },
  {
    text: "That's not what I said.",
    sender: "B",
    tag: "Defensiveness",
    tagColor: "#34d399",
    pos: [2.8, -1.6, -1.2],
    side: 'right'
  },
  {
    text: "Fine.",
    sender: "A",
    tag: "Stonewalling",
    tagColor: "#f87171",
    pos: [-1.8, -2.4, -0.8],
    side: 'left'
  },
]

function Bubble({ data, scrollProgress, index }) {
  const groupRef = useRef()
  const startY = data.pos[1] - 3

  const floatOffset = useMemo(() => Math.random() * Math.PI * 2, [])

  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime

    // Entrance: appear after 25% scroll
    const enterProgress = Math.max(0, Math.min(1, (scrollProgress - 0.25 - index * 0.04) / 0.15))
    const eased = 1 - Math.pow(1 - enterProgress, 3)

    groupRef.current.position.set(
      data.pos[0],
      data.pos[1] + Math.sin(t * 0.5 + floatOffset) * 0.08,
      data.pos[2]
    )
    groupRef.current.position.y += (1 - eased) * -2
    groupRef.current.scale.setScalar(eased)
    groupRef.current.rotation.y = Math.sin(t * 0.3 + floatOffset) * 0.06
  })

  const bubbleColor = data.side === 'left' ? '#1a0f2e' : '#0f1a2e'
  const bubbleW = 1.8
  const bubbleH = 0.55

  return (
    <group ref={groupRef} scale={0}>
      {/* Bubble body */}
      <RoundedBox args={[bubbleW, bubbleH, 0.06]} radius={0.1} smoothness={4} position={[0, 0, 0]}>
        <meshStandardMaterial
          color={bubbleColor}
          roughness={0.3}
          metalness={0.5}
          transparent
          opacity={0.92}
        />
      </RoundedBox>

      {/* Bubble border glow */}
      <RoundedBox args={[bubbleW + 0.02, bubbleH + 0.02, 0.055]} radius={0.11} smoothness={4}>
        <meshStandardMaterial
          color={data.tagColor}
          emissive={data.tagColor}
          emissiveIntensity={0.3}
          transparent
          opacity={0.25}
        />
      </RoundedBox>

      {/* Message text */}
      <Text
        position={[0, 0.05, 0.04]}
        fontSize={0.1}
        color="#e2e0ea"
        anchorX="center"
        anchorY="middle"
        maxWidth={1.5}
        font="https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZ2IHTWEBlwu8Q.woff2"
      >
        {data.text}
      </Text>

      {/* Tag pill */}
      <group position={[data.side === 'left' ? 0.55 : -0.55, -0.36, 0.04]}>
        <RoundedBox args={[0.65, 0.18, 0.03]} radius={0.09} smoothness={4}>
          <meshStandardMaterial
            color={data.tagColor}
            emissive={data.tagColor}
            emissiveIntensity={0.5}
            transparent
            opacity={0.9}
          />
        </RoundedBox>
        <Text
          position={[0, 0, 0.025]}
          fontSize={0.075}
          color="#000000"
          anchorX="center"
          anchorY="middle"
          font="https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZ2IHTWEBlwu8Q.woff2"
          fontWeight={700}
        >
          {data.tag}
        </Text>
      </group>

      {/* Sender dot */}
      <mesh position={[data.side === 'left' ? -bubbleW / 2 - 0.15 : bubbleW / 2 + 0.15, 0, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial
          color={data.tagColor}
          emissive={data.tagColor}
          emissiveIntensity={0.6}
        />
      </mesh>
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
