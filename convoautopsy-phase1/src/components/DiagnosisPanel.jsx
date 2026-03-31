import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { downloadReceipt } from '../services/receiptGenerator'
import './DiagnosisPanel.css'

const DEMO_DATA = {
  overall_tension_score: 85,
  conflict_mode: 'Competing vs. Avoiding',
  messages: [
    { id: 1, sender: 'Person A', text: 'Whatever, do what you want.', gottman_flag: 'Stonewalling', ego_state: 'Child', hidden_meaning: 'I am overwhelmed and have no emotional bandwidth left to engage.' },
    { id: 2, sender: 'Person B', text: 'You always do this.', gottman_flag: 'Criticism', ego_state: 'Parent', hidden_meaning: 'I feel unheard and am resorting to generalizations to force you to listen.' },
    { id: 3, sender: 'Person A', text: "I don't even care anymore.", gottman_flag: 'Contempt', ego_state: 'Child', hidden_meaning: 'I am deeply hurt but mocking you feels safer than admitting it.' },
    { id: 4, sender: 'Person B', text: "That's not what I said.", gottman_flag: 'Defensiveness', ego_state: 'Adult', hidden_meaning: 'I sense unfairness in this accusation and want to correct the record.' },
  ],
}

const TAG_COLORS = {
  Stonewalling:  { bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.28)', text: '#fca5a5' },
  Criticism:     { bg: 'rgba(251,191,36,0.09)',  border: 'rgba(251,191,36,0.28)',  text: '#fde68a' },
  Contempt:      { bg: 'rgba(167,139,250,0.11)', border: 'rgba(167,139,250,0.28)', text: '#ddd6fe' },
  Defensiveness: { bg: 'rgba(52,211,153,0.09)',  border: 'rgba(52,211,153,0.24)',  text: '#6ee7b7' },
  Neutral:       { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.10)', text: 'rgba(240,239,244,0.5)' },
}

const EGO_COLORS = { Child: '#f472b6', Parent: '#fbbf24', Adult: '#34d399' }

function KineticTag({ tag }) {
  const spanRef = useRef()

  useEffect(() => {
    if (!spanRef.current) return

    if (tag === 'Defensiveness') {
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 2.2 })
      tl.to(spanRef.current, { x: -1.8, duration: 0.04, ease: 'none' })
        .to(spanRef.current, { x: 1.8, duration: 0.04, ease: 'none' })
        .to(spanRef.current, { x: -1.2, duration: 0.04, ease: 'none' })
        .to(spanRef.current, { x: 0.8, duration: 0.04, ease: 'none' })
        .to(spanRef.current, { x: 0, duration: 0.06, ease: 'power2.out' })
      return () => tl.kill()
    }

    if (tag === 'Contempt') {
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8 })
      tl.fromTo(spanRef.current,
        { fontWeight: 400, opacity: 0.7, letterSpacing: '0.04em' },
        { fontWeight: 700, opacity: 1, letterSpacing: '0.09em', duration: 1.1, ease: 'power2.inOut' }
      ).to(spanRef.current, {
        fontWeight: 400, opacity: 0.7, letterSpacing: '0.04em', duration: 1.1, ease: 'power2.inOut'
      })
      return () => tl.kill()
    }

    if (tag === 'Stonewalling') {
      gsap.to(spanRef.current, {
        opacity: 0.4, duration: 1.6, ease: 'power1.inOut', repeat: -1, yoyo: true,
      })
      return () => gsap.killTweensOf(spanRef.current)
    }
  }, [tag])

  const colors = TAG_COLORS[tag] || TAG_COLORS.Neutral

  return (
    <span ref={spanRef} className="dp-tag" style={{ color: colors.text, display: 'inline-block' }}>
      {tag}
    </span>
  )
}

export default function DiagnosisPanel({ visible, data }) {
  const result = data || DEMO_DATA
  const panelRef = useRef()
  const scoreRef = useRef()
  const barRef = useRef()
  const rowsRef = useRef([])
  const [hasAnimated, setHasAnimated] = useState(false)

  const modeParts = result.conflict_mode?.split(/\s+vs\.?\s+/i) || ['Competing', 'Avoiding']

  useEffect(() => { setHasAnimated(false) }, [data])

  useEffect(() => {
    if (!panelRef.current) return

    if (visible && !hasAnimated) {
      setHasAnimated(true)

      gsap.fromTo(panelRef.current,
        { opacity: 0, y: 50, scale: 0.96, filter: 'blur(8px)' },
        { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.8, ease: 'power3.out' }
      )

      if (scoreRef.current) {
        gsap.fromTo({ val: 0 }, { val: result.overall_tension_score }, {
          duration: 1.6, delay: 0.5, ease: 'power2.out',
          onUpdate: function () {
            if (scoreRef.current) scoreRef.current.textContent = Math.round(this.targets()[0].val)
          }
        })
      }

      if (barRef.current) {
        gsap.fromTo(barRef.current,
          { width: '0%' },
          { width: `${result.overall_tension_score}%`, duration: 1.6, delay: 0.5, ease: 'power2.out' }
        )
      }

      const validRows = rowsRef.current.filter(Boolean)
      if (validRows.length) {
        gsap.fromTo(validRows,
          { opacity: 0, x: -18, filter: 'blur(3px)' },
          { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.55, ease: 'power2.out', stagger: 0.1, delay: 0.7 }
        )
      }
    } else if (!visible && hasAnimated) {
      gsap.to(panelRef.current, { opacity: 0, y: 20, duration: 0.35, ease: 'power2.in' })
    }
  }, [visible, hasAnimated, result])

  rowsRef.current = []

  const scoreColor = result.overall_tension_score >= 75 ? '#f87171'
    : result.overall_tension_score >= 50 ? '#fbbf24' : '#34d399'

  return (
    <div className="diagnosis-panel" ref={panelRef} style={{ opacity: 0 }}>
      <div className="dp-header">
        <div className="dp-title-row">
          <span className="dp-label">Autopsy Report</span>
          <span className="dp-timestamp">{data ? 'just now' : 'demo'}</span>
        </div>

        <div className="dp-scores">
          <div className="dp-score-card">
            <div className="dp-score-num" ref={scoreRef} style={{ color: scoreColor }}>0</div>
            <div className="dp-score-label">Tension Score</div>
            <div className="dp-score-bar">
              <div className="dp-score-fill" ref={barRef} style={{
                width: '0%',
                background: `linear-gradient(90deg, ${scoreColor}88, ${scoreColor})`,
              }} />
            </div>
          </div>

          <div className="dp-score-card">
            <div className="dp-mode-tags">
              <span className="dp-mode-pill competing">{modeParts[0]}</span>
              <span className="dp-mode-vs">vs</span>
              <span className="dp-mode-pill avoiding">{modeParts[1] || '?'}</span>
            </div>
            <div className="dp-score-label">Conflict Mode · TKI</div>
          </div>
        </div>
      </div>

      <div className="dp-timeline">
        {result.messages.slice(0, 8).map((msg, i) => {
          const colors = TAG_COLORS[msg.gottman_flag] || TAG_COLORS.Neutral
          return (
            <div key={msg.id || i} className="dp-message" ref={el => { if (el) rowsRef.current[i] = el }}>
              <div className="dp-msg-sender">{msg.sender}</div>
              <div className="dp-msg-bubble" style={{ background: colors.bg, borderColor: colors.border }}>
                <div className="dp-msg-text">"{msg.text}"</div>
                <div className="dp-msg-meta">
                  <KineticTag tag={msg.gottman_flag} />
                  <span className="dp-ego" style={{ color: EGO_COLORS[msg.ego_state] || '#34d399' }}>
                    {msg.ego_state} state
                  </span>
                </div>
                <div className="dp-hidden">
                  <span className="dp-hidden-label">Hidden meaning</span>
                  <span className="dp-hidden-text">{msg.hidden_meaning}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {result.messages.length > 8 && (
        <div className="dp-more-count">+ {result.messages.length - 8} more messages analyzed</div>
      )}

      <div className="dp-footer">
        <button className="dp-share-btn" onClick={() => downloadReceipt(result)}>Download receipt</button>
        <span className="dp-powered">powered by claude + gottman</span>
      </div>
    </div>
  )
}
