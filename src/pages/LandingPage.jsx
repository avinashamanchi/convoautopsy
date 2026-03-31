import React, { useRef, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import PhoneScene from '../components/PhoneScene'
import DiagnosisPanel from '../components/DiagnosisPanel'
import { analyzeConversation, DEMO_TEXT } from '../utils/analyzeConversation'
import './LandingPage.css'

gsap.registerPlugin(ScrollTrigger)

const GITHUB_URL = 'https://github.com/avinashamanchi/convoautopsy'

class CanvasErrorBoundary extends React.Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(e) { console.error('3D Canvas error:', e) }
  render() { if (this.state.hasError) return null; return this.props.children }
}

// ── TAG helpers ───────────────────────────────────────────────────
const TAG_COLORS = {
  Stonewalling: '#f87171', Criticism: '#fbbf24',
  Contempt: '#a78bfa', Defensiveness: '#34d399', Neutral: '#9ca3af',
}
const scoreColor = (s) => s >= 70 ? '#f87171' : s >= 45 ? '#fbbf24' : '#34d399'

// ════════════════════════════════════════════════════════════════
// ── SUB-SECTIONS
// ════════════════════════════════════════════════════════════════

// ── Nav ──────────────────────────────────────────────────────────
function NavBar({ user, onGetStarted, onGoToDashboard }) {
  return (
    <nav className="lp-nav">
      <div className="lp-nav-bg" />
      <div className="lp-nav-inner">
        <div className="lp-logo">Convo<span>Autopsy</span></div>
        <div className="lp-nav-links">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="lp-nav-gh">
            GitHub ↗
          </a>
          <button className="lp-nav-cta" onClick={user ? onGoToDashboard : onGetStarted}>
            {user ? 'My Analyses' : 'Get started'}
          </button>
        </div>
      </div>
    </nav>
  )
}

// ── Hero ──────────────────────────────────────────────────────────
function HeroSection({ user, onGetStarted, scrollProgressRef, bubblesVisible }) {
  const headRef = useRef()
  const subRef = useRef()
  const ctaRef = useRef()
  const badgeRef = useRef()

  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.25 })
    tl.fromTo(headRef.current, { opacity: 0, y: 44, filter: 'blur(10px)' },
                               { opacity: 1, y: 0,  filter: 'blur(0px)',  duration: 1.1, ease: 'power3.out' })
      .fromTo(subRef.current,  { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.85, ease: 'power2.out' }, '-=0.55')
      .fromTo(ctaRef.current,  { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7,  ease: 'power2.out' }, '-=0.45')
      .fromTo(badgeRef.current,{ opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6,  ease: 'power2.out' }, '-=0.35')
  }, [])

  return (
    <div className="lp-hero">
      {/* Left: copy */}
      <div className="lp-hero-left">
        <div className="lp-eyebrow">
          <span className="lp-eyebrow-dot" />
          AI-powered relationship diagnostics
        </div>
        <h1 ref={headRef} className="lp-h1">
          Convo<br />
          <span className="lp-accent">Autopsy</span>
        </h1>
        <p ref={subRef} className="lp-hero-sub">
          Analyze and break down any conversation with AI. Understand tone, intent, and conflict patterns — and get a clinical verdict on who caused it.
        </p>
        <div ref={ctaRef} className="lp-hero-ctas">
          <button className="lp-btn-primary" onClick={onGetStarted}>
            {user ? 'Go to dashboard' : 'Try Demo — Free'}
          </button>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="lp-btn-ghost">
            View GitHub ↗
          </a>
        </div>
        <div ref={badgeRef} className="lp-hero-badges">
          <span className="lp-badge">Free forever</span>
          <span className="lp-badge">No account needed to demo</span>
          <span className="lp-badge">Open source</span>
        </div>
      </div>

      {/* Right: 3D phone lives in fixed canvas (see LandingPage root) */}
      <div className="lp-hero-right" />
    </div>
  )
}

// ── How it works ──────────────────────────────────────────────────
const STEPS = [
  { n: '01', icon: '📋', title: 'Paste Your Conversation', body: 'Format as Name: Message, one per line. Texts, DMs, emails — anything works. Your names are anonymised to Person A and B.' },
  { n: '02', icon: '🧠', title: 'AI Analyzes Patterns',    body: 'Powered by Gottman\'s Four Horsemen, Thomas-Kilmann conflict modes, and Transactional Analysis — the same frameworks therapists use.' },
  { n: '03', icon: '📊', title: 'Get Your Diagnosis',      body: 'Every message gets flagged. Tension scored 0–100. Hidden meanings revealed. The receipt generated — shareable and undeniable.' },
]

function HowItWorksSection() {
  const ref = useRef()
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray('.hiw-card', ref.current).forEach((el, i) => {
        gsap.fromTo(el, { opacity: 0, y: 36 }, {
          opacity: 1, y: 0, duration: 0.65, delay: i * 0.1, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' }
        })
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section className="lp-section" ref={ref}>
      <div className="lp-container">
        <div className="lp-section-header">
          <span className="lp-eyebrow">how it works</span>
          <h2 className="lp-h2">Three steps to clarity</h2>
        </div>
        <div className="lp-three-col">
          {STEPS.map(s => (
            <div key={s.n} className="hiw-card lp-card">
              <div className="hiw-num">{s.n}</div>
              <div className="hiw-icon">{s.icon}</div>
              <h3 className="hiw-title">{s.title}</h3>
              <p className="hiw-body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Live demo ─────────────────────────────────────────────────────
function LiveDemoSection({ onGetStarted }) {
  const [text, setText] = useState(DEMO_TEXT)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const resultRef = useRef()

  const analyze = async () => {
    if (!text.trim()) return
    setLoading(true); setErr(''); setResult(null)
    try {
      const r = await analyzeConversation(text)
      if (!r || !r.messages?.length) { setErr("Couldn't parse — use Name: Message format."); setLoading(false); return }
      setResult(r)
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80)
    } catch { setErr('Analysis failed. Try again.') }
    setLoading(false)
  }

  const sc = result ? scoreColor(result.overall_tension_score) : '#9ca3af'

  return (
    <section className="lp-section lp-section-alt">
      <div className="lp-container">
        <div className="lp-section-header">
          <span className="lp-eyebrow">live demo</span>
          <h2 className="lp-h2">Try it right now</h2>
          <p className="lp-section-sub">No account needed. Paste any conversation and see the full AI analysis instantly.</p>
        </div>

        <div className="demo-grid">
          {/* Input */}
          <div>
            <div className="demo-col-label">Your conversation</div>
            <textarea
              className="demo-textarea"
              value={text}
              onChange={e => { setText(e.target.value); setResult(null); setErr('') }}
              rows={12}
              placeholder={'Alex: I told you I\'d be there by 7.\nJordan: You never listen…'}
            />
            {err && <div className="demo-err">{err}</div>}
            <div className="demo-row">
              <button className="demo-reset-btn" onClick={() => { setText(DEMO_TEXT); setResult(null) }}>Reset example</button>
              <button
                className="lp-btn-primary"
                onClick={analyze}
                disabled={loading || !text.trim()}
                style={{ flex: 1 }}
              >
                {loading
                  ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <span className="demo-loading-dots"><span/><span/><span/></span>Analyzing…
                    </span>
                  : 'Analyze →'}
              </button>
            </div>
          </div>

          {/* Result */}
          <div className="demo-result-pane" ref={resultRef}>
            {!result && !loading && (
              <div className="demo-empty-state">
                <div className="demo-empty-icon">🔬</div>
                <p>Your clinical analysis will appear here.<br />Paste a conversation and click Analyze.</p>
              </div>
            )}
            {loading && (
              <div className="demo-loading-state">
                <div className="demo-loading-dots"><span/><span/><span/></div>
                <p>Analyzing conversation patterns…</p>
              </div>
            )}
            {result && (
              <>
                <div className="demo-result-inner">
                  <div className="demo-result-tag">autopsy report</div>
                  <div className="demo-score-row">
                    <div>
                      <div className="demo-score-label">tension score</div>
                      <div className="demo-score-big" style={{ color: sc }}>{result.overall_tension_score}</div>
                    </div>
                    <div className="demo-conflict">{result.conflict_mode}</div>
                  </div>
                  <div className="demo-score-bar-wrap">
                    <div className="demo-score-bar-fill" style={{ width: `${result.overall_tension_score}%`, background: `linear-gradient(90deg, ${sc}80, ${sc})` }} />
                  </div>
                  <div className="demo-msgs">
                    {result.messages.slice(0, 5).map((m, i) => (
                      <div key={i} className="demo-msg">
                        <span className="demo-msg-sender">{m.sender}</span>
                        <span className="demo-msg-text">"{m.text.slice(0, 42)}{m.text.length > 42 ? '…' : ''}"</span>
                        <span className="demo-msg-tag" style={{
                          color: TAG_COLORS[m.gottman_flag] || '#9ca3af',
                          background: `${TAG_COLORS[m.gottman_flag] || '#9ca3af'}1a`,
                          border: `1px solid ${TAG_COLORS[m.gottman_flag] || '#9ca3af'}30`
                        }}>{m.gottman_flag}</span>
                      </div>
                    ))}
                    {result.messages.length > 5 && <div className="demo-more">+{result.messages.length - 5} more messages</div>}
                  </div>
                </div>
                <div className="demo-signup-strip">
                  <p>Sign up to save and revisit this analysis</p>
                  <button className="demo-signup-btn" onClick={onGetStarted}>Save analysis →</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Why it matters ────────────────────────────────────────────────
const WHY = [
  { icon: '💬', title: 'Relationships', body: 'Understand what actually happened in any argument. Stop going in circles. Get the clinical verdict with receipts.' },
  { icon: '🪞', title: 'Self-Awareness', body: "See your own communication patterns before they repeat. Identify your conflict mode — and whether you're the problem." },
  { icon: '📈', title: 'Communication', body: 'Improve how you express yourself and understand others. Turn relationship tension into insight you can actually act on.' },
]

function WhySection() {
  const ref = useRef()
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray('.why-card', ref.current).forEach((el, i) => {
        gsap.fromTo(el, { opacity: 0, y: 28 }, {
          opacity: 1, y: 0, duration: 0.6, delay: i * 0.1, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' }
        })
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section className="lp-section lp-section-accent" ref={ref}>
      <div className="lp-container">
        <div className="lp-section-header">
          <span className="lp-eyebrow">why it matters</span>
          <h2 className="lp-h2">More than pattern matching</h2>
          <p className="lp-section-sub">ConvoAutopsy applies the same frameworks therapists use — to the texts you've been staring at all night.</p>
        </div>
        <div className="lp-three-col">
          {WHY.map(c => (
            <div key={c.title} className="why-card lp-card">
              <div className="why-icon">{c.icon}</div>
              <h3 className="why-title">{c.title}</h3>
              <p className="why-body">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Frameworks breakdown ──────────────────────────────────────────
const FRAMEWORKS = [
  {
    tag: 'Gottman', tagColor: '#f87171', tagBg: 'rgba(248,113,113,0.12)',
    name: "Four Horsemen",
    desc: "John Gottman's research-backed predictors of relationship failure — each identified in your messages.",
    flags: ['Criticism','Contempt','Defensiveness','Stonewalling'],
    flagColor: '#f87171',
  },
  {
    tag: 'TKI', tagColor: '#fbbf24', tagBg: 'rgba(251,191,36,0.1)',
    name: "Conflict Modes",
    desc: "Thomas-Kilmann Instrument identifies your conflict style from five possible modes of engagement.",
    flags: ['Competing','Avoiding','Accommodating','Collaborating','Compromising'],
    flagColor: '#fbbf24',
  },
  {
    tag: 'TA', tagColor: '#a78bfa', tagBg: 'rgba(167,139,250,0.12)',
    name: "Ego States",
    desc: "Transactional Analysis reveals which ego state drives each message — and the hidden transaction beneath it.",
    flags: ['Parent','Adult','Child'],
    flagColor: '#a78bfa',
  },
]

function FrameworksSection() {
  const ref = useRef()
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray('.fw-card', ref.current).forEach((el, i) => {
        gsap.fromTo(el, { opacity: 0, y: 28 }, {
          opacity: 1, y: 0, duration: 0.6, delay: i * 0.12, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' }
        })
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section className="lp-section" ref={ref}>
      <div className="lp-container">
        <div className="lp-section-header">
          <span className="lp-eyebrow">peer-reviewed frameworks</span>
          <h2 className="lp-h2">Not vibes. Science.</h2>
          <p className="lp-section-sub">The same frameworks therapists use in session — applied to your conversations, automatically.</p>
        </div>
        <div className="lp-frameworks">
          {FRAMEWORKS.map(fw => (
            <div key={fw.tag} className="fw-card">
              <span className="fw-tag" style={{ color: fw.tagColor, background: fw.tagBg }}>{fw.tag}</span>
              <div className="fw-name">{fw.name}</div>
              <p className="fw-desc">{fw.desc}</p>
              <div className="fw-flags">
                {fw.flags.map(f => (
                  <span key={f} className="fw-flag" style={{ color: fw.flagColor, background: `${fw.flagColor}15`, border: `1px solid ${fw.flagColor}30` }}>{f}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Sample result (static demo panel) ────────────────────────────
function SampleResultSection() {
  const ref = useRef()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: ref.current,
        start: 'top 80%',
        onEnter: () => setVisible(true),
        onLeaveBack: () => setVisible(false),
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section className="lp-section lp-section-alt" ref={ref}>
      <div className="lp-container">
        <div className="lp-section-header">
          <span className="lp-eyebrow">sample output</span>
          <h2 className="lp-h2">What your report looks like</h2>
        </div>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <DiagnosisPanel visible={visible} />
        </div>
      </div>
    </section>
  )
}

// ── Tech stack ────────────────────────────────────────────────────
const TECH = [
  { label: 'React 19',           color: '#61dafb' },
  { label: 'Vite 8',             color: '#fbbf24' },
  { label: 'Three.js',           color: '#eeeeee' },
  { label: 'React Three Fiber',  color: '#a78bfa' },
  { label: 'GSAP ScrollTrigger', color: '#88ce02' },
  { label: 'Framer Motion',      color: '#f472b6' },
  { label: 'Groq API',           color: '#e879f9' },
  { label: 'LLaMA 3.3 70B',      color: '#34d399' },
  { label: 'Gottman Method',     color: '#f87171' },
  { label: 'Thomas-Kilmann',     color: '#fbbf24' },
  { label: 'Transactional Analysis', color: '#c4b5fd' },
]

function TechStackSection() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <div className="lp-section-header">
          <span className="lp-eyebrow">tech stack</span>
          <h2 className="lp-h2">Built with modern tools</h2>
          <p className="lp-section-sub">Production-ready frontend architecture with AI analysis powered by Groq's inference API.</p>
        </div>
        <div className="tech-grid">
          {TECH.map(t => (
            <span key={t.label} className="tech-pill" style={{ color: t.color, borderColor: `${t.color}35`, background: `${t.color}0e` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── CTA Banner ────────────────────────────────────────────────────
function CTABanner({ user, onGetStarted }) {
  return (
    <div className="lp-cta-banner">
      <div className="lp-container">
        <h2 className="lp-h2">
          Your situationship<br />
          <span className="lp-accent">needs a diagnosis.</span>
        </h2>
        <p>Stop analyzing screenshots alone. Get the actual science-backed breakdown.</p>
        <div className="lp-cta-btns">
          <button className="lp-btn-primary lp-btn-large" onClick={onGetStarted}>
            {user ? 'Back to dashboard' : 'Start for free →'}
          </button>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="lp-btn-ghost">
            View source ↗
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Footer ────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-logo">Convo<span>Autopsy</span></div>
        <div className="lp-footer-links">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="https://github.com/avinashamanchi" target="_blank" rel="noopener noreferrer">Built by Avi Amanchi</a>
        </div>
        <div className="lp-footer-copy">© 2026 ConvoAutopsy</div>
      </div>
    </footer>
  )
}

// ════════════════════════════════════════════════════════════════
// ── MAIN EXPORT
// ════════════════════════════════════════════════════════════════
export default function LandingPage({ user, onGetStarted, onGoToDashboard }) {
  const scrollProgressRef = useRef(0)
  const [bubblesVisible, setBubblesVisible] = useState(false)

  useEffect(() => {
    // Scroll trigger on hero — drives the 3D phone shatter
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: '.lp-hero',
        start: 'top top',
        end: 'bottom top',   // shatters as hero scrolls out
        onUpdate: (self) => {
          scrollProgressRef.current = self.progress
          setBubblesVisible(self.progress > 0.3)
        }
      })
    })
    return () => ctx.revert()
  }, [])

  return (
    <div className="lp-root">
      {/* Fixed 3D canvas — visible through hero's transparent bg */}
      <div className="lp-canvas-fixed">
        <CanvasErrorBoundary>
          <Canvas
            camera={{ position: [0, 0, 6.5], fov: 42 }}
            gl={{ antialias: true, alpha: true }}
            style={{ background: 'transparent' }}
          >
            <ambientLight intensity={0.6} />
            <hemisphereLight color="#c4b5fd" groundColor="#0a001f" intensity={0.5} />
            <directionalLight position={[5, 6, 5]}  intensity={1.4} color="#ffffff" />
            <directionalLight position={[-4,-2,-3]} intensity={0.5} color="#8b5cf6" />
            <pointLight position={[0, 3, 3]} intensity={0.9} color="#c4b5fd" />
            <pointLight position={[2,-2, 2]} intensity={0.4} color="#f472b6" />
            <PhoneScene scrollProgressRef={scrollProgressRef} />
          </Canvas>
        </CanvasErrorBoundary>
      </div>

      <NavBar user={user} onGetStarted={onGetStarted} onGoToDashboard={onGoToDashboard} />

      {/* Hero: transparent — 3D canvas shows through */}
      <HeroSection
        user={user}
        onGetStarted={onGetStarted}
        scrollProgressRef={scrollProgressRef}
        bubblesVisible={bubblesVisible}
      />

      {/* All sections below have solid backgrounds — canvas hidden behind */}
      <HowItWorksSection />
      <LiveDemoSection onGetStarted={onGetStarted} />
      <WhySection />
      <FrameworksSection />
      <SampleResultSection />
      <TechStackSection />
      <CTABanner user={user} onGetStarted={onGetStarted} />
      <Footer />
    </div>
  )
}
