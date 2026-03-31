import { useRef, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import PhoneScene from './components/PhoneScene'
import ChatBubbles from './components/ChatBubbles'
import DiagnosisPanel from './components/DiagnosisPanel'
import './App.css'

gsap.registerPlugin(ScrollTrigger)

export default function App() {
  const titleRef = useRef()
  const subRef = useRef()
  const ctaRef = useRef()
  const [scrollProgress, setScrollProgress] = useState(0)
  const [bubblesVisible, setBubblesVisible] = useState(false)
  const [diagnosisVisible, setDiagnosisVisible] = useState(false)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(titleRef.current,
        { opacity: 0, y: 60, filter: 'blur(12px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.2, ease: 'power3.out', delay: 0.3 }
      )
      gsap.fromTo(subRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 1, ease: 'power2.out', delay: 0.7 }
      )
      gsap.fromTo(ctaRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out', delay: 1.1 }
      )

      ScrollTrigger.create({
        trigger: '#scroll-container',
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          setScrollProgress(self.progress)
          setBubblesVisible(self.progress > 0.25)
          setDiagnosisVisible(self.progress > 0.6)
        }
      })

      gsap.utils.toArray('.reveal-section').forEach((el) => {
        gsap.fromTo(el,
          { opacity: 0, y: 50 },
          {
            opacity: 1, y: 0, duration: 0.9, ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 80%', toggleActions: 'play none none reverse' }
          }
        )
      })
    })
    return () => ctx.revert()
  }, [])

  return (
    <div id="scroll-container">
      <div className="canvas-sticky">
        <Canvas
          camera={{ position: [0, 0, 6], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 5, 5]} intensity={1.2} color="#ffffff" />
          <directionalLight position={[-5, -3, -2]} intensity={0.5} color="#8b5cf6" />
          <pointLight position={[0, 3, 3]} intensity={0.8} color="#c4b5fd" />
          <PhoneScene scrollProgress={scrollProgress} />
          <ChatBubbles scrollProgress={scrollProgress} visible={bubblesVisible} />
          <Environment preset="city" />
        </Canvas>
      </div>

      {/* Hero */}
      <section className="section hero-section">
        <div className="hero-content">
          <div className="eyebrow">AI-powered social diagnostics</div>
          <h1 ref={titleRef} className="hero-title">
            Convo<span className="accent">Autopsy</span>
          </h1>
          <p ref={subRef} className="hero-sub">
            Paste any conversation. Get a clinical breakdown of exactly what went wrong — and who caused it.
          </p>
          <div ref={ctaRef} className="cta-group">
            <button className="btn-primary">Run the autopsy</button>
            <span className="cta-hint">No account needed · Free</span>
          </div>
        </div>
      </section>

      {/* Shatter scroll space */}
      <div className="scroll-spacer" />

      {/* Bubbles section */}
      <section className="section bubbles-section reveal-section">
        <div className="section-text right-aligned">
          <div className="eyebrow">Message by message</div>
          <h2>Every text gets a verdict</h2>
          <p>Watch your conversation explode in 3D space. Each bubble gets tagged with Gottman's Four Horsemen — Stonewalling, Contempt, Criticism, or Defensiveness.</p>
        </div>
      </section>

      {/* Psychology section */}
      <section className="section psychology-section reveal-section">
        <div className="section-text left-aligned">
          <div className="eyebrow">Peer-reviewed frameworks</div>
          <h2>Not vibes.<br />Science.</h2>
          <p>Powered by Gottman's Four Horsemen, Thomas-Kilmann Conflict Mode, and Transactional Analysis. The same tools therapists use — applied to your group chat.</p>
          <div className="framework-pills">
            <span className="pill">Gottman 4 Horsemen</span>
            <span className="pill">TKI Conflict Mode</span>
            <span className="pill">Ego State Analysis</span>
            <span className="pill">Tension Score</span>
          </div>
        </div>
      </section>

      {/* Diagnosis panel */}
      <section className="section diagnosis-section reveal-section">
        <DiagnosisPanel visible={diagnosisVisible} />
      </section>

      {/* Share section */}
      <section className="section share-section reveal-section">
        <div className="section-text centered">
          <div className="eyebrow">Spotify Wrapped for your drama</div>
          <h2>Download your receipt</h2>
          <p>Every autopsy generates a shareable 9:16 graphic. Post it. Let the people decide.</p>
          <button className="btn-secondary">See example receipt</button>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section final-cta reveal-section">
        <div className="section-text centered">
          <p className="final-headline">Your situationship needs a diagnosis.</p>
          <button className="btn-primary btn-large">Start the autopsy</button>
        </div>
      </section>
    </div>
  )
}
