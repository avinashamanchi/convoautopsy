import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import './DiagnosisPanel.css'

const MESSAGES = [
  { sender: 'Person A', text: 'Whatever, do what you want.', tag: 'Stonewalling', ego: 'Child', hidden: 'I am hurt but refuse to engage.' },
  { sender: 'Person B', text: 'You always do this.', tag: 'Criticism', ego: 'Parent', hidden: 'I feel unheard and resort to blame.' },
  { sender: 'Person A', text: "I don't even care anymore.", tag: 'Contempt', ego: 'Child', hidden: 'I care deeply but feel powerless.' },
  { sender: 'Person B', text: "That's not what I said.", tag: 'Defensiveness', ego: 'Adult', hidden: 'I feel attacked and shut down.' },
]

const TAG_COLORS = {
  Stonewalling: { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', text: '#fca5a5' },
  Criticism: { bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)', text: '#fcd34d' },
  Contempt: { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', text: '#c4b5fd' },
  Defensiveness: { bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.25)', text: '#6ee7b7' },
}

const EGO_COLORS = {
  Child: '#f472b6',
  Parent: '#fbbf24',
  Adult: '#34d399',
}

export default function DiagnosisPanel({ visible }) {
  const panelRef = useRef()
  const scoreRef = useRef()

  useEffect(() => {
    if (!panelRef.current) return
    if (visible) {
      gsap.fromTo(panelRef.current,
        { opacity: 0, y: 40, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' }
      )
      // Animate tension score counting up
      if (scoreRef.current) {
        gsap.fromTo({ val: 0 }, { val: 85 }, {
          duration: 1.4,
          delay: 0.4,
          ease: 'power2.out',
          onUpdate: function() {
            if (scoreRef.current) scoreRef.current.textContent = Math.round(this.targets()[0].val)
          }
        })
      }
    } else {
      gsap.to(panelRef.current, { opacity: 0, duration: 0.3 })
    }
  }, [visible])

  return (
    <div className="diagnosis-panel" ref={panelRef} style={{ opacity: 0 }}>
      {/* Header */}
      <div className="dp-header">
        <div className="dp-title-row">
          <span className="dp-label">autopsy report</span>
          <span className="dp-timestamp">just now</span>
        </div>
        <div className="dp-scores">
          <div className="dp-score-card tension">
            <div className="dp-score-num" ref={scoreRef}>0</div>
            <div className="dp-score-label">tension score</div>
            <div className="dp-score-bar">
              <div className="dp-score-fill" style={{ width: visible ? '85%' : '0%' }} />
            </div>
          </div>
          <div className="dp-score-card mode">
            <div className="dp-mode-tags">
              <span className="dp-mode-pill competing">Competing</span>
              <span className="dp-mode-vs">vs</span>
              <span className="dp-mode-pill avoiding">Avoiding</span>
            </div>
            <div className="dp-score-label">conflict mode</div>
          </div>
        </div>
      </div>

      {/* Message timeline */}
      <div className="dp-timeline">
        {MESSAGES.map((msg, i) => {
          const colors = TAG_COLORS[msg.tag]
          return (
            <div key={i} className="dp-message">
              <div className="dp-msg-sender">{msg.sender}</div>
              <div className="dp-msg-bubble" style={{ background: colors.bg, borderColor: colors.border }}>
                <div className="dp-msg-text">"{msg.text}"</div>
                <div className="dp-msg-meta">
                  <span className="dp-tag" style={{ color: colors.text }}>{msg.tag}</span>
                  <span className="dp-ego" style={{ color: EGO_COLORS[msg.ego] }}>{msg.ego} state</span>
                </div>
                <div className="dp-hidden">
                  <span className="dp-hidden-label">hidden meaning</span>
                  <span className="dp-hidden-text">{msg.hidden}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="dp-footer">
        <button className="dp-share-btn">Download receipt</button>
        <span className="dp-powered">powered by claude + gottman</span>
      </div>
    </div>
  )
}
