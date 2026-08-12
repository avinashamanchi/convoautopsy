import { useEffect, useRef, useState } from 'react'
import {
  HERO_DEMO_STAGES,
  initialHeroDemoStage,
  nextHeroDemoStage,
} from './heroDemoMachine'

const LABELS = {
  exchange: 'Exchange',
  evidence: 'Evidence',
  patterns: 'Estimate',
  response: 'Response',
}

const STATUS = {
  exchange: 'Start with the words that were actually written.',
  evidence: 'Separate observable wording from interpretation.',
  patterns: 'Review hedged pattern estimates without assigning intent.',
  response: 'Consider a response option, then review and edit it yourself.',
}

export default function HeroLiveDemo() {
  const rootRef = useRef(null)
  const reducedMotion = typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const [stage, setStage] = useState(() => initialHeroDemoStage(reducedMotion))
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  const [pausedByUser, setPausedByUser] = useState(false)
  const playing = !reducedMotion && visible && !pausedByUser

  useEffect(() => {
    const node = rootRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.35 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!playing || !visible || reducedMotion) return undefined
    const timer = window.setTimeout(() => setStage((current) => nextHeroDemoStage(current)), 2200)
    return () => window.clearTimeout(timer)
  }, [playing, reducedMotion, stage, visible])

  function selectStage(nextStage) {
    setPausedByUser(true)
    setStage(nextStage)
  }

  function replay() {
    setStage(initialHeroDemoStage(reducedMotion))
    setPausedByUser(false)
  }

  return (
    <section
      ref={rootRef}
      className="hero-live-demo"
      role="region"
      aria-label="Conversation reflection demo"
      data-demo-stage={stage}
    >
      <div className="hld-utility">
        <span><i aria-hidden="true" /> Reviewed sample walkthrough</span>
        <span>Local presentation · no analysis request</span>
      </div>

      <div className="hld-stage-tabs" aria-label="Walkthrough stages">
        {HERO_DEMO_STAGES.map((item, index) => (
          <button
            type="button"
            key={item}
            data-step={`0${index + 1}`}
            aria-pressed={stage === item}
            onClick={() => selectStage(item)}
          >
            {LABELS[item]}
          </button>
        ))}
      </div>

      <div className="hld-film-frame">
        <div className="hld-frame-header">
          <span>CONVO / SAMPLE 01</span>
          <span>EDUCATIONAL REFLECTION</span>
        </div>

        <div className="hld-frame-body">
          {stage === 'exchange' && (
            <div className="hld-exchange">
              <p className="hld-panel-label">Reviewed fictional exchange</p>
              <div className="hld-bubble hld-bubble-a"><span>PERSON A</span><p>“I felt left out when the plan changed and I didn’t hear from you.”</p></div>
              <div className="hld-bubble hld-bubble-b"><span>PERSON B</span><p>“You always make this into something bigger. I was busy.”</p></div>
              <div className="hld-bubble hld-bubble-a"><span>PERSON A</span><p>“I’m trying to explain why it hurt.”</p></div>
            </div>
          )}

          {stage === 'evidence' && (
            <div className="hld-evidence">
              <p className="hld-panel-label">Observable wording first</p>
              <div><span>01</span><blockquote>“You <mark>always</mark> make this into something bigger.”</blockquote><small>Absolute wording</small></div>
              <div><span>02</span><blockquote>“I was <mark>busy</mark>.”</blockquote><small>Context offered</small></div>
              <div><span>03</span><blockquote>“I’m trying to explain <mark>why it hurt</mark>.”</blockquote><small>Impact statement</small></div>
            </div>
          )}

          {stage === 'patterns' && (
            <div className="hld-patterns">
              <p className="hld-panel-label">Possible pattern estimate</p>
              <article><span>WORDING LENS</span><strong>May resemble criticism</strong><p>The absolute phrase focuses on a repeated character judgment rather than this single event.</p></article>
              <article><span>RESPONSE LENS</span><strong>Could reflect defensiveness</strong><p>The reply offers context before acknowledging the other person’s stated impact.</p></article>
              <em>These are educational possibilities—not a diagnosis, fact, or claim about intent.</em>
            </div>
          )}

          {stage === 'response' && (
            <div className="hld-response">
              <p className="hld-panel-label">Response option</p>
              <span className="hld-draft-tag">CALM · CURIOUS · EDITABLE</span>
              <blockquote>
                “I hear that the change made you feel left out. I was caught up, but I don’t want to dismiss the impact. Can we talk about what would help next time?”
              </blockquote>
              <div><span>01</span>Acknowledge the stated impact</div>
              <div><span>02</span>Add context without erasing it</div>
              <div><span>03</span>Invite a concrete next step</div>
              <em>Review and edit before using. You decide what fits the real conversation.</em>
            </div>
          )}
        </div>
      </div>

      <div className="hld-controls">
        <p aria-live="polite">{STATUS[stage]}</p>
        <div>
          <button type="button" onClick={() => setPausedByUser((current) => !current)} disabled={reducedMotion}>
            {playing ? 'Pause demo' : 'Play demo'}
          </button>
          <button type="button" onClick={replay}>Replay</button>
        </div>
      </div>
    </section>
  )
}
