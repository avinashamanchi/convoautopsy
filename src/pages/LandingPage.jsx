import React, { useRef, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import PhoneScene from '../components/PhoneScene'
import DiagnosisPanel from '../components/DiagnosisPanel'
import { analyzeConversation, DEMO_TEXT, DEMO_RESULT } from '../utils/analyzeConversation'
import './LandingPage.css'

gsap.registerPlugin(ScrollTrigger)

const GITHUB_URL = 'https://github.com/avinashamanchi/convoautopsy'

class CanvasErrorBoundary extends React.Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(e) { console.error('3D Canvas error:', e) }
  render() { if (this.state.hasError) return null; return this.props.children }
}

const TAG_COLORS = {
  Stonewalling: '#f87171', Criticism: '#fbbf24',
  Contempt: '#a78bfa', Defensiveness: '#34d399', Neutral: '#9ca3af',
}
const scoreColor = (s) => s >= 70 ? '#f87171' : s >= 45 ? '#fbbf24' : '#34d399'

// ── NavBar ─────────────────────────────────────────────────────────
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

// ── Hero ───────────────────────────────────────────────────────────
function HeroSection({ user, onGetStarted }) {
  const headRef = useRef()
  const subRef = useRef()
  const ctaRef = useRef()
  const statsRef = useRef()

  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.2 })
    tl.fromTo(headRef.current,
        { opacity: 0, y: 50, filter: 'blur(12px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.1, ease: 'power3.out' })
      .fromTo(subRef.current,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.85, ease: 'power2.out' }, '-=0.55')
      .fromTo(ctaRef.current,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, '-=0.45')
      .fromTo(statsRef.current,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '-=0.35')
  }, [])

  return (
    <div className="lp-hero">
      <div className="lp-hero-left">
        <div className="lp-eyebrow">
          <span className="lp-eyebrow-dot" />
          AI-powered conversation diagnostics
        </div>

        <h1 ref={headRef} className="lp-h1">
          Know exactly<br />
          <span className="lp-gradient-text">what went wrong.</span>
        </h1>

        <p ref={subRef} className="lp-hero-sub">
          ConvoAutopsy analyzes any conversation and tells you who escalated it,
          why it broke down — and exactly what to say next.
        </p>

        <div ref={ctaRef} className="lp-hero-ctas">
          <button className="lp-btn-primary" onClick={onGetStarted}>
            {user ? 'Go to dashboard' : 'Try Demo — Free'}
          </button>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="lp-btn-ghost">
            View GitHub ↗
          </a>
        </div>

        <div ref={statsRef} className="lp-hero-stats">
          <div className="lp-stat">
            <span className="lp-stat-num">4</span>
            <span className="lp-stat-label">Frameworks</span>
          </div>
          <div className="lp-stat-divider" />
          <div className="lp-stat">
            <span className="lp-stat-num">100</span>
            <span className="lp-stat-label">Point Scale</span>
          </div>
          <div className="lp-stat-divider" />
          <div className="lp-stat">
            <span className="lp-stat-num">∞</span>
            <span className="lp-stat-label">Instant Analysis</span>
          </div>
          <div className="lp-stat-divider" />
          <div className="lp-stat">
            <span className="lp-stat-num">3×</span>
            <span className="lp-stat-label">Tailored Responses</span>
          </div>
        </div>
      </div>

      {/* Right side is empty — 3D canvas shows through transparent hero */}
      <div className="lp-hero-right" />
    </div>
  )
}

// ── How It Works ───────────────────────────────────────────────────
const STEPS = [
  { n: '01', icon: '📋', title: 'Paste Your Conversation', body: 'Format as Name: Message, one per line. Texts, DMs, emails — anything works. Names are anonymized to Person A and B automatically.' },
  { n: '02', icon: '🧠', title: 'AI Analyzes Patterns', body: "Powered by Gottman's Four Horsemen, Thomas-Kilmann conflict modes, and Transactional Analysis — the same frameworks therapists use in session." },
  { n: '03', icon: '📊', title: 'Get Your Diagnosis', body: 'Every message gets flagged. Tension scored 0–100. Hidden meanings revealed. Then craft the perfect response in 3 steps.' },
]

function HowItWorksSection() {
  const ref = useRef()
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray('.hiw-card', ref.current).forEach((el, i) => {
        gsap.fromTo(el, { opacity: 0, y: 40 }, {
          opacity: 1, y: 0, duration: 0.65, delay: i * 0.12, ease: 'power2.out',
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
          <p className="lp-section-sub">From raw conversation to clinical breakdown in under 10 seconds.</p>
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

// ── Live Demo ──────────────────────────────────────────────────────
function LiveDemoSection({ onGetStarted }) {
  const [text, setText] = useState(DEMO_TEXT)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [visibleCount, setVisibleCount] = useState(0)
  const [scoreDisplay, setScoreDisplay] = useState(0)
  const [showBar, setShowBar] = useState(false)
  const sectionRef = useRef()
  const hasRunRef = useRef(false)
  const runningRef = useRef(false)

  const runDemo = async (inputText = text, preResult = null) => {
    if (runningRef.current) return
    runningRef.current = true
    setLoading(true)
    setResult(null)
    setVisibleCount(0)
    setScoreDisplay(0)
    setShowBar(false)
    setErr('')

    let analysisResult = preResult
    if (!analysisResult) {
      await new Promise(r => setTimeout(r, 1100))
      try {
        const r = await analyzeConversation(inputText)
        if (!r || !r.messages?.length) {
          setErr("Couldn't parse — use Name: Message format.")
          setLoading(false)
          runningRef.current = false
          return
        }
        analysisResult = r
      } catch {
        setErr('Analysis failed.')
        setLoading(false)
        runningRef.current = false
        return
      }
    }

    setLoading(false)
    setResult(analysisResult)

    // Animate score
    let cur = 0
    const target = analysisResult.overall_tension_score
    const tick = () => {
      cur = Math.min(cur + 2, target)
      setScoreDisplay(cur)
      if (cur < target) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    setTimeout(() => setShowBar(true), 80)

    // Stream messages
    for (let i = 0; i < analysisResult.messages.length; i++) {
      await new Promise(r => setTimeout(r, 160))
      setVisibleCount(i + 1)
    }
    runningRef.current = false
  }

  // Auto-trigger on scroll into view (first time only)
  useEffect(() => {
    if (!sectionRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasRunRef.current) {
          hasRunRef.current = true
          runDemo(DEMO_TEXT, DEMO_RESULT)
        }
      },
      { threshold: 0.25 }
    )
    observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  const sc = result ? scoreColor(result.overall_tension_score) : '#9ca3af'

  return (
    <section className="lp-section lp-section-alt lp-demo-section" ref={sectionRef}>
      <div className="lp-container">
        <div className="lp-section-header">
          <span className="lp-eyebrow">
            <span className="lp-eyebrow-dot" />
            live demo
          </span>
          <h2 className="lp-h2">See it work in real time.</h2>
          <p className="lp-section-sub">Watch the AI analyze a real conversation — or paste your own.</p>
        </div>

        <div className="demo-grid">
          <div className="demo-input-col">
            <div className="demo-col-label">conversation input</div>
            <textarea
              className="demo-textarea"
              value={text}
              onChange={e => {
                setText(e.target.value)
                setResult(null)
                setErr('')
                hasRunRef.current = false
              }}
              rows={12}
              placeholder={"Alex: I told you I'd be there by 7.\nJordan: You never listen…"}
            />
            {err && <div className="demo-err">{err}</div>}
            <div className="demo-row">
              <button className="demo-reset-btn" onClick={() => {
                setText(DEMO_TEXT)
                setResult(null)
                setErr('')
                hasRunRef.current = false
              }}>Reset example</button>
              <button
                className="lp-btn-primary demo-analyze-btn"
                onClick={() => { hasRunRef.current = true; runDemo(text) }}
                disabled={loading || !text.trim()}
              >
                {loading
                  ? <span className="demo-btn-loading"><span/><span/><span/>Analyzing…</span>
                  : 'Analyze →'}
              </button>
            </div>
          </div>

          <div className="demo-result-pane">
            {!result && !loading && (
              <div className="demo-empty-state">
                <div className="demo-empty-icon">🔬</div>
                <p>Clinical analysis appears here.<br />Scroll down slightly to trigger the live demo.</p>
              </div>
            )}
            {loading && (
              <div className="demo-loading-state">
                <div className="demo-ai-brain">
                  <div className="demo-brain-ring" />
                  <div className="demo-brain-ring demo-brain-ring-2" />
                  <span className="demo-brain-icon">🧠</span>
                </div>
                <p className="demo-loading-text">Analyzing conversation patterns…</p>
                <div className="demo-loading-steps">
                  <span className="demo-step-active">Parsing messages</span>
                  <span className="demo-step-sep">→</span>
                  <span>Gottman flags</span>
                  <span className="demo-step-sep">→</span>
                  <span>Ego states</span>
                  <span className="demo-step-sep">→</span>
                  <span>Tension score</span>
                </div>
              </div>
            )}
            {result && (
              <>
                <div className="demo-result-inner">
                  <div className="demo-result-header">
                    <span className="demo-result-tag">autopsy report</span>
                    <span className="demo-live-badge">● LIVE</span>
                  </div>
                  <div className="demo-score-row">
                    <div>
                      <div className="demo-score-label">tension score</div>
                      <div className="demo-score-big" style={{ color: sc }}>{scoreDisplay}</div>
                    </div>
                    <div className="demo-right-meta">
                      <div className="demo-conflict">{result.conflict_mode}</div>
                    </div>
                  </div>
                  <div className="demo-score-bar-wrap">
                    <div className="demo-score-bar-fill" style={{
                      width: showBar ? `${result.overall_tension_score}%` : '0%',
                      background: `linear-gradient(90deg, ${sc}80, ${sc})`
                    }} />
                  </div>
                  <div className="demo-msgs">
                    {result.messages.slice(0, 6).map((m, i) => (
                      <div key={i} className={`demo-msg ${i < visibleCount ? 'visible' : ''}`} style={{ transitionDelay: `${i * 40}ms` }}>
                        <span className="demo-msg-sender">{m.sender}</span>
                        <span className="demo-msg-text">"{m.text.slice(0, 44)}{m.text.length > 44 ? '…' : ''}"</span>
                        <span className="demo-msg-tag" style={{
                          color: TAG_COLORS[m.gottman_flag] || '#9ca3af',
                          background: `${TAG_COLORS[m.gottman_flag] || '#9ca3af'}1a`,
                          border: `1px solid ${TAG_COLORS[m.gottman_flag] || '#9ca3af'}35`
                        }}>{m.gottman_flag}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="demo-signup-strip">
                  <p>Save this analysis and access the Response Crafter</p>
                  <button className="demo-signup-btn" onClick={onGetStarted}>Get started free →</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Use Cases ──────────────────────────────────────────────────────
const USE_CASES = [
  {
    id: 'relationship',
    label: 'Relationships',
    icon: '💔',
    convo: [
      { sender: 'Jordan', text: "You never listen to anything I say. This is exactly what I'm talking about.", tag: 'Criticism', tagColor: '#fbbf24' },
      { sender: 'Alex', text: "That's not what happened. Stop twisting my words.", tag: 'Defensiveness', tagColor: '#34d399' },
      { sender: 'Jordan', text: "Whatever. I'm done trying.", tag: 'Stonewalling', tagColor: '#f87171' },
      { sender: 'Alex', text: "You always do this. You always shut down when it gets real.", tag: 'Criticism', tagColor: '#fbbf24' },
    ],
    score: 82,
    mode: 'Competing vs Avoiding',
    scoreColor: '#f87171',
    insight: "Jordan opens with a Four Horsemen-level criticism ('you never'), triggering Alex's defensive ego state. The conversation collapses into stonewalling before any real issue gets addressed.",
  },
  {
    id: 'workplace',
    label: 'Workplace',
    icon: '💼',
    convo: [
      { sender: 'Manager', text: "Why wasn't this finished? I said EOD Friday.", tag: 'Criticism', tagColor: '#fbbf24' },
      { sender: 'Employee', text: "I had three other priority projects. Nobody told me this was urgent.", tag: 'Defensiveness', tagColor: '#34d399' },
      { sender: 'Manager', text: "That's not an excuse. This is a pattern.", tag: 'Contempt', tagColor: '#a78bfa' },
      { sender: 'Employee', text: "Fine. I'll have it done tomorrow.", tag: 'Stonewalling', tagColor: '#f87171' },
    ],
    score: 71,
    mode: 'Competing',
    scoreColor: '#fbbf24',
    insight: "The manager leads with criticism rather than inquiry, triggering employee defensiveness. 'That's not an excuse' signals contempt — the most toxic Gottman pattern. The 'Fine' response is classic stonewalling under pressure.",
  },
  {
    id: 'dating',
    label: 'Dating',
    icon: '🌹',
    convo: [
      { sender: 'Sam', text: "Are you even interested in this, or are you just going through the motions?", tag: 'Criticism', tagColor: '#fbbf24' },
      { sender: 'Riley', text: "I'm here, aren't I? I don't know what you want from me.", tag: 'Defensiveness', tagColor: '#34d399' },
      { sender: 'Sam', text: "I want you to actually try. I feel like I'm the only one putting in effort.", tag: 'Neutral', tagColor: '#9ca3af' },
      { sender: 'Riley', text: "I don't want to talk about this right now.", tag: 'Stonewalling', tagColor: '#f87171' },
    ],
    score: 58,
    mode: 'Avoiding',
    scoreColor: '#fbbf24',
    insight: "Sam's question contains an embedded accusation ('just going through the motions'), which triggers Riley's Adult-state defensiveness. Sam's third message is actually healthy — but it arrives too late after Riley has already shut down.",
  },
  {
    id: 'family',
    label: 'Family',
    icon: '🏠',
    convo: [
      { sender: 'Parent', text: "You need to grow up. You're not a child anymore.", tag: 'Contempt', tagColor: '#a78bfa' },
      { sender: 'Child', text: "I'm trying my best! You never acknowledge anything I do right.", tag: 'Criticism', tagColor: '#fbbf24' },
      { sender: 'Parent', text: "I told you this would happen if you didn't listen.", tag: 'Criticism', tagColor: '#fbbf24' },
      { sender: 'Child', text: "I can't do anything right in your eyes. Whatever.", tag: 'Stonewalling', tagColor: '#f87171' },
    ],
    score: 76,
    mode: 'Competing vs Avoiding',
    scoreColor: '#f87171',
    insight: "Parent opens from a critical Parent ego state ('you need to grow up') which activates the Child's defensive response. Both parties then compete in criticism before the Child stonewalls — a generational conflict pattern.",
  },
]

function UseCasesSection() {
  const [active, setActive] = useState('relationship')
  const ref = useRef()
  const cardRef = useRef()

  const current = USE_CASES.find(u => u.id === active)

  useEffect(() => {
    if (cardRef.current) {
      gsap.fromTo(cardRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
      )
    }
  }, [active])

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(ref.current, { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 0.7, ease: 'power2.out',
        scrollTrigger: { trigger: ref.current, start: 'top 85%', toggleActions: 'play none none reverse' }
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section className="lp-section lp-section-dark" ref={ref}>
      <div className="lp-container">
        <div className="lp-section-header">
          <span className="lp-eyebrow">use cases</span>
          <h2 className="lp-h2">Works for every kind of conflict</h2>
          <p className="lp-section-sub">Real conversation patterns. Real psychological frameworks. Real insights.</p>
        </div>

        <div className="uc-tabs">
          {USE_CASES.map(u => (
            <button
              key={u.id}
              className={`uc-tab ${active === u.id ? 'active' : ''}`}
              onClick={() => setActive(u.id)}
            >
              <span className="uc-tab-icon">{u.icon}</span>
              <span>{u.label}</span>
            </button>
          ))}
        </div>

        <div className="uc-card" ref={cardRef}>
          <div className="uc-card-grid">
            <div className="uc-convo-col">
              <div className="uc-convo-label">conversation</div>
              <div className="uc-messages">
                {current.convo.map((m, i) => (
                  <div key={i} className="uc-message">
                    <div className="uc-msg-sender">{m.sender}</div>
                    <div className="uc-msg-bubble">
                      <p className="uc-msg-text">"{m.text}"</p>
                      <span className="uc-msg-tag" style={{
                        color: m.tagColor,
                        background: `${m.tagColor}18`,
                        border: `1px solid ${m.tagColor}30`
                      }}>{m.tag}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="uc-analysis-col">
              <div className="uc-analysis-header">
                <div className="uc-analysis-label">autopsy report</div>
                <div className="uc-score-row">
                  <div className="uc-score-block">
                    <span className="uc-score-num" style={{ color: current.scoreColor }}>{current.score}</span>
                    <span className="uc-score-sub">tension</span>
                  </div>
                  <div className="uc-mode-pill">{current.mode}</div>
                </div>
                <div className="uc-score-bar">
                  <div className="uc-score-fill" style={{ width: `${current.score}%`, background: `linear-gradient(90deg, ${current.scoreColor}60, ${current.scoreColor})` }} />
                </div>
              </div>
              <div className="uc-insight">
                <div className="uc-insight-label">clinical insight</div>
                <p className="uc-insight-text">{current.insight}</p>
              </div>
              <div className="uc-flags-row">
                {current.convo.filter((m, i, arr) => arr.findIndex(x => x.tag === m.tag) === i).map(m => (
                  <span key={m.tag} className="uc-flag" style={{ color: m.tagColor, background: `${m.tagColor}15`, border: `1px solid ${m.tagColor}25` }}>
                    {m.tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Why Section ────────────────────────────────────────────────────
const WHY = [
  { icon: '💬', title: 'Stop going in circles', body: 'Understand what actually happened in any argument. Get the clinical verdict with specific message-by-message breakdowns — not just a gut feeling.' },
  { icon: '🪞', title: 'See your own patterns', body: "Identify your conflict mode before it repeats. Find out if you're the one stonewalling, criticizing, or avoiding — and what to do about it." },
  { icon: '✍️', title: 'Know what to say next', body: 'The Response Crafter turns your analysis into 3 tailored message options — matched to your goal, tone, and the specific patterns detected.' },
]

function WhySection() {
  const ref = useRef()
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray('.why-card', ref.current).forEach((el, i) => {
        gsap.fromTo(el, { opacity: 0, y: 32 }, {
          opacity: 1, y: 0, duration: 0.6, delay: i * 0.1, ease: 'power2.out',
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

// ── Response Crafter Showcase ──────────────────────────────────────
function ResponseCrafterShowcase({ onGetStarted }) {
  const ref = useRef()
  const [activeStep, setActiveStep] = useState(1)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(ref.current, { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 0.7, ease: 'power2.out',
        scrollTrigger: { trigger: ref.current, start: 'top 82%', toggleActions: 'play none none reverse' }
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  const SHOWCASE_STEPS = [
    {
      step: 1, label: 'Choose who you are',
      preview: (
        <div className="rcs-preview-who">
          <div className="rcs-who-btn active">
            <span className="rcs-who-av">A</span>
            <span>Person A</span>
            <span className="rcs-who-count">3 messages</span>
          </div>
          <div className="rcs-who-btn">
            <span className="rcs-who-av">B</span>
            <span>Person B</span>
            <span className="rcs-who-count">3 messages</span>
          </div>
        </div>
      )
    },
    {
      step: 2, label: 'Set your goal',
      preview: (
        <div className="rcs-preview-grid">
          {[['🤝','Resolve conflict'],['🛑','Set a boundary'],['💬','Express feelings'],['🔍','Seek understanding'],['🙏','Apologize'],['✏️','Request change']].map(([icon, label]) => (
            <div key={label} className={`rcs-tile ${label === 'Resolve conflict' ? 'active' : ''}`}>
              <span>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )
    },
    {
      step: 3, label: 'Pick your tone',
      preview: (
        <div className="rcs-preview-grid rcs-tone-grid">
          {[['🫂','Empathetic'],['💪','Assertive'],['🕊️','De-escalating'],['🎯','Direct'],['⚖️','Diplomatic']].map(([icon, label]) => (
            <div key={label} className={`rcs-tile ${label === 'De-escalating' ? 'active' : ''}`}>
              <span>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )
    },
    {
      step: 4, label: 'Get 3 tailored responses',
      preview: (
        <div className="rcs-preview-responses">
          {[
            { hint: "Drops defenses first", text: "Let's both slow down. I don't want to fight — I care about this, which is why I'm still here." },
            { hint: "Breaks the attack-defend cycle", text: "I'm going to stop defending myself. I think we're both hurt. What if we focused on what we need?" },
            { hint: "Buys time without abandoning", text: "Can we take a short pause and come back? I'm not walking away — I want this to go somewhere." },
          ].map((r, i) => (
            <div key={i} className="rcs-response">
              <div className="rcs-response-top">
                <span className="rcs-hint">{r.hint}</span>
                <span className="rcs-copy-mock">Copy</span>
              </div>
              <p>{r.text}</p>
            </div>
          ))}
        </div>
      )
    },
  ]

  return (
    <section className="lp-section lp-section-alt" ref={ref}>
      <div className="lp-container">
        <div className="lp-section-header">
          <span className="lp-eyebrow">response crafter</span>
          <h2 className="lp-h2">Know exactly what to say.</h2>
          <p className="lp-section-sub">After the analysis, a 4-step wizard generates 3 tailored response options — matched to your goal and tone.</p>
        </div>

        <div className="rcs-layout">
          <div className="rcs-steps">
            {SHOWCASE_STEPS.map(s => (
              <button
                key={s.step}
                className={`rcs-step-btn ${activeStep === s.step ? 'active' : ''}`}
                onClick={() => setActiveStep(s.step)}
              >
                <div className="rcs-step-dot">{activeStep > s.step ? '✓' : s.step}</div>
                <span>{s.label}</span>
              </button>
            ))}
          </div>

          <div className="rcs-preview-card">
            <div className="rcs-preview-label">
              Step {activeStep} — {SHOWCASE_STEPS[activeStep - 1].label}
            </div>
            <div className="rcs-preview-content">
              {SHOWCASE_STEPS[activeStep - 1].preview}
            </div>
          </div>
        </div>

        <div className="rcs-cta-row">
          <p className="rcs-cta-text">Available after every analysis — no extra setup needed.</p>
          <button className="lp-btn-primary" onClick={onGetStarted}>Try it now →</button>
        </div>
      </div>
    </section>
  )
}

// ── Frameworks Section ─────────────────────────────────────────────
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
    <section className="lp-section lp-section-dark" ref={ref}>
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

// ── Tech Stack ─────────────────────────────────────────────────────
const TECH = [
  { label: 'React 19',              color: '#61dafb' },
  { label: 'Vite 8',               color: '#fbbf24' },
  { label: 'Three.js',             color: '#eeeeee' },
  { label: 'React Three Fiber',    color: '#a78bfa' },
  { label: 'GSAP ScrollTrigger',   color: '#88ce02' },
  { label: 'Framer Motion',        color: '#f472b6' },
  { label: 'Groq API',             color: '#e879f9' },
  { label: 'LLaMA 3.3 70B',        color: '#34d399' },
  { label: 'Gottman Method',       color: '#f87171' },
  { label: 'Thomas-Kilmann',       color: '#fbbf24' },
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

// ── CTA Banner ─────────────────────────────────────────────────────
function CTABanner({ user, onGetStarted }) {
  return (
    <div className="lp-cta-banner">
      <div className="lp-container">
        <h2 className="lp-h2">
          Your situationship<br />
          <span className="lp-gradient-text">needs a diagnosis.</span>
        </h2>
        <p>Stop analyzing screenshots alone. Get the actual science-backed breakdown — and know exactly what to say next.</p>
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

// ── Footer ─────────────────────────────────────────────────────────
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

// ── MAIN EXPORT ────────────────────────────────────────────────────
export default function LandingPage({ user, onGetStarted, onGoToDashboard }) {
  const scrollProgressRef = useRef(0)

  useEffect(() => {
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: '.lp-hero',
        start: 'top top',
        end: 'bottom top',
        onUpdate: (self) => {
          scrollProgressRef.current = self.progress
        }
      })
    })
    return () => ctx.revert()
  }, [])

  return (
    <div className="lp-root">
      {/* Fixed 3D canvas — visible through hero transparent bg */}
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

      {/* Hero — transparent so 3D canvas shows through */}
      <HeroSection user={user} onGetStarted={onGetStarted} />

      {/* Solid-background sections cover the fixed canvas */}
      <HowItWorksSection />
      <LiveDemoSection onGetStarted={onGetStarted} />
      <UseCasesSection />
      <WhySection />
      <ResponseCrafterShowcase onGetStarted={onGetStarted} />
      <FrameworksSection />
      <TechStackSection />
      <CTABanner user={user} onGetStarted={onGetStarted} />
      <Footer />
    </div>
  )
}
