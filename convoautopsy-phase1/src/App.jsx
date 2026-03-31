import { useRef, useEffect, useState, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import PhoneScene from './components/PhoneScene'
import ChatBubbles from './components/ChatBubbles'
import DiagnosisPanel from './components/DiagnosisPanel'
import InputModal from './components/InputModal'
import { analyzeConversation } from './services/analyzeConversation'
import { downloadReceipt } from './services/receiptGenerator'
import './App.css'

gsap.registerPlugin(ScrollTrigger)

export default function App() {
  const [scrollProgress, setScrollProgress] = useState(0)
  const [bubblesVisible, setBubblesVisible] = useState(false)
  const [diagnosisVisible, setDiagnosisVisible] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisData, setAnalysisData] = useState(null)

  const eyebrowRef = useRef()
  const titleRef = useRef()
  const subRef = useRef()
  const ctaRef = useRef()
  const heroRef = useRef()
  const scrollCueRef = useRef()
  const diagnosisSectionRef = useRef()

  const openModal = useCallback(() => setModalOpen(true), [])

  const handleAnalyze = useCallback(async (text) => {
    setAnalysisLoading(true)
    try {
      const result = await analyzeConversation(text)
      setAnalysisData(result)
      setModalOpen(false)

      setTimeout(() => {
        diagnosisSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 350)
    } catch (err) {
      // Re-throw so InputModal can show the error
      throw err
    } finally {
      setAnalysisLoading(false)
    }
  }, [])

  useEffect(() => {
    const ctx = gsap.context(() => {

      // ── Hero entrance ──────────────────────────────────────────────
      const heroTl = gsap.timeline({ delay: 0.25 })
      heroTl
        .fromTo(eyebrowRef.current,
          { opacity: 0, y: 14, filter: 'blur(6px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out' }
        )
        .fromTo(titleRef.current,
          { opacity: 0, y: 70, filter: 'blur(16px)', letterSpacing: '0.1em' },
          { opacity: 1, y: 0, filter: 'blur(0px)', letterSpacing: '-0.02em', duration: 1.2, ease: 'power4.out' },
          '-=0.35'
        )
        .fromTo(subRef.current,
          { opacity: 0, y: 28 },
          { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' },
          '-=0.55'
        )
        .fromTo(ctaRef.current,
          { opacity: 0, y: 18, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'back.out(1.5)' },
          '-=0.45'
        )

      // ── Hero fade-out on scroll ────────────────────────────────────
      if (heroRef.current) {
        gsap.to(heroRef.current, {
          opacity: 0,
          y: -60,
          filter: 'blur(8px)',
          ease: 'power2.in',
          scrollTrigger: {
            trigger: heroRef.current,
            start: 'top top',
            end: '+=35%',
            scrub: 0.6,
          }
        })
      }

      // ── Scroll cue hide ────────────────────────────────────────────
      if (scrollCueRef.current) {
        gsap.to(scrollCueRef.current, {
          opacity: 0,
          ease: 'power2.in',
          scrollTrigger: {
            trigger: '#scroll-root',
            start: '2% top',
            end: '5% top',
            scrub: true,
          }
        })
      }

      // ── Master scroll tracker ──────────────────────────────────────
      // 7 sections × 100vh + 100vh spacer = ~800vh total
      ScrollTrigger.create({
        trigger: '#scroll-root',
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          setScrollProgress(self.progress)
          setBubblesVisible(self.progress > 0.20 && self.progress < 0.62)
          setDiagnosisVisible(self.progress > 0.52)
        }
      })

      // ── Section reveals ────────────────────────────────────────────
      gsap.utils.toArray('.reveal-up').forEach(el => {
        gsap.fromTo(el,
          { opacity: 0, y: 50, filter: 'blur(4px)' },
          {
            opacity: 1, y: 0, filter: 'blur(0px)',
            duration: 0.9, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 83%', toggleActions: 'play none none reverse' }
          }
        )
      })

      gsap.utils.toArray('.parallax-right').forEach(el => {
        gsap.fromTo(el,
          { opacity: 0, x: 70 },
          {
            opacity: 1, x: 0, duration: 1.0, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none reverse' }
          }
        )
      })

      gsap.utils.toArray('.parallax-left').forEach(el => {
        gsap.fromTo(el,
          { opacity: 0, x: -70 },
          {
            opacity: 1, x: 0, duration: 1.0, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none reverse' }
          }
        )
      })

      gsap.utils.toArray('.stagger-group').forEach(container => {
        const items = container.querySelectorAll('.stagger-item')
        if (!items.length) return
        gsap.fromTo(items,
          { opacity: 0, y: 20, scale: 0.9 },
          {
            opacity: 1, y: 0, scale: 1,
            duration: 0.45, ease: 'back.out(1.4)',
            stagger: 0.08,
            scrollTrigger: { trigger: container, start: 'top 86%', toggleActions: 'play none none reverse' }
          }
        )
      })

      gsap.utils.toArray('.final-headline').forEach(el => {
        gsap.fromTo(el,
          { opacity: 0, scale: 0.93, filter: 'blur(10px)' },
          {
            opacity: 1, scale: 1, filter: 'blur(0px)',
            duration: 1.2, ease: 'power4.out',
            scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' }
          }
        )
      })
    })

    return () => ctx.revert()
  }, [])

  // Demo receipt fallback data
  const demoReceiptData = {
    overall_tension_score: 85,
    conflict_mode: 'Competing vs. Avoiding',
    messages: [
      { id: 1, sender: 'Person A', text: 'Whatever, do what you want.', gottman_flag: 'Stonewalling', ego_state: 'Child', hidden_meaning: 'I am overwhelmed and have no emotional bandwidth left to engage.' },
      { id: 2, sender: 'Person B', text: 'You always do this.', gottman_flag: 'Criticism', ego_state: 'Parent', hidden_meaning: 'I feel unheard and am resorting to generalizations to force you to listen.' },
      { id: 3, sender: 'Person A', text: "I don't even care anymore.", gottman_flag: 'Contempt', ego_state: 'Child', hidden_meaning: 'I am deeply hurt but mocking you feels safer than admitting it.' },
      { id: 4, sender: 'Person B', text: "That's not what I said.", gottman_flag: 'Defensiveness', ego_state: 'Adult', hidden_meaning: 'I sense unfairness in this accusation and want to correct the record.' },
    ],
  }

  return (
    <div id="scroll-root">

      {/* Sticky WebGL canvas */}
      <div className="canvas-sticky">
        <Canvas
          camera={{ position: [0, 0, 6], fov: 45 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          dpr={[1, 2]}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={0.35} />
          <directionalLight position={[5, 5, 5]} intensity={1.3} color="#ffffff" />
          <directionalLight position={[-4, -3, -2]} intensity={0.6} color="#8b5cf6" />
          <pointLight position={[0, 3, 3]} intensity={1.0} color="#c4b5fd" />
          <pointLight position={[3, -2, 2]} intensity={0.45} color="#f472b6" />
          <PhoneScene scrollProgress={scrollProgress} />
          <ChatBubbles scrollProgress={scrollProgress} visible={bubblesVisible} />
          <Environment preset="city" />
        </Canvas>
      </div>

      {/* Input Modal */}
      <InputModal
        open={modalOpen}
        onClose={() => !analysisLoading && setModalOpen(false)}
        onAnalyze={handleAnalyze}
        loading={analysisLoading}
      />

      {/* ── 1. Hero ── */}
      <section className="section hero-section">
        <div className="hero-content" ref={heroRef}>
          <div className="eyebrow" ref={eyebrowRef} style={{ opacity: 0 }}>
            AI-powered social diagnostics
          </div>
          <h1 ref={titleRef} className="hero-title" style={{ opacity: 0 }}>
            Convo<span className="accent">Autopsy</span>
          </h1>
          <p ref={subRef} className="hero-sub" style={{ opacity: 0 }}>
            Paste any conversation. Get a clinical breakdown of exactly what went wrong — and who caused it.
          </p>
          <div ref={ctaRef} className="cta-group" style={{ opacity: 0 }}>
            <button className="btn-primary" onClick={openModal}>Run the autopsy</button>
            <span className="cta-hint">No account needed · Free</span>
          </div>
        </div>

        <div className="scroll-cue" ref={scrollCueRef}>
          <div className="scroll-cue-track"><div className="scroll-cue-dot" /></div>
          <span className="scroll-cue-label">scroll</span>
        </div>
      </section>

      {/* Scroll space — phone animates through here */}
      <div className="scroll-spacer" />

      {/* ── 2. Bubbles section ── */}
      <section className="section bubbles-section">
        <div className="section-text right-aligned parallax-right">
          <div className="eyebrow">Message by message</div>
          <h2>Every text<br />gets a verdict</h2>
          <p className="reveal-up">
            Watch your conversation explode in 3D space. Each bubble is tagged with Gottman's Four Horsemen. Defensive messages vibrate. Contemptuous ones shift weight.
          </p>
          <div className="framework-pills stagger-group">
            {['🧱 Stonewalling', '🗡️ Criticism', '👑 Contempt', '🛡️ Defensiveness'].map(p => (
              <span key={p} className="pill stagger-item">{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Psychology section ── */}
      <section className="section psychology-section">
        <div className="section-text left-aligned parallax-left">
          <div className="eyebrow">Peer-reviewed frameworks</div>
          <h2>Not vibes.<br /><em>Science.</em></h2>
          <p className="reveal-up">
            Powered by Gottman's Four Horsemen, Thomas-Kilmann Conflict Mode, and Transactional Analysis. The same tools therapists use — applied to your group chat.
          </p>
          <div className="framework-pills stagger-group">
            {['Gottman 4 Horsemen', 'TKI Conflict Mode', 'Ego State Analysis', 'Tension Score'].map(p => (
              <span key={p} className="pill stagger-item">{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. Diagnosis section ── */}
      <section className="section diagnosis-section" ref={diagnosisSectionRef}>
        <div className="parallax-right" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          <DiagnosisPanel visible={diagnosisVisible} data={analysisData} />
        </div>
      </section>

      {/* ── 5. Share section ── */}
      <section className="section share-section">
        <div className="section-text centered reveal-up">
          <div className="eyebrow">Spotify Wrapped for your drama</div>
          <h2>Download your receipt</h2>
          <p>Every autopsy generates a shareable 9:16 graphic. Post it. Let the people decide.</p>
          <button className="btn-secondary" onClick={() => downloadReceipt(analysisData || demoReceiptData)}>
            {analysisData ? 'Download your receipt' : 'See example receipt'}
          </button>
        </div>
      </section>

      {/* ── 6. Final CTA ── */}
      <section className="section final-cta">
        <div className="section-text centered">
          <p className="final-headline">Your situationship<br />needs a diagnosis.</p>
          <button className="btn-primary btn-large reveal-up" onClick={openModal}>Start the autopsy</button>
        </div>
      </section>

    </div>
  )
}
