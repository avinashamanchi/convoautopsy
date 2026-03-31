import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

const TAG_COLORS = {
  Stonewalling: { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', text: '#fca5a5' },
  Criticism:    { bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.3)',   text: '#fcd34d' },
  Contempt:     { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', text: '#c4b5fd' },
  Defensiveness:{ bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.25)', text: '#6ee7b7' },
  Neutral:      { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', text: '#9ca3af' },
}
const EGO_COLORS = { Child: '#f472b6', Parent: '#fbbf24', Adult: '#34d399' }

const SCORE_COLOR = (s) => s >= 75 ? '#f87171' : s >= 50 ? '#fbbf24' : '#34d399'

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AnalysisResult({ result, timestamp, onBack }) {
  const panelRef = useRef()
  const scoreRef = useRef()

  useEffect(() => {
    if (!panelRef.current) return
    gsap.fromTo(panelRef.current,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }
    )
    if (scoreRef.current) {
      gsap.fromTo({ val: 0 }, { val: result.overall_tension_score }, {
        duration: 1.2, delay: 0.3, ease: 'power2.out',
        onUpdate: function () {
          if (scoreRef.current) scoreRef.current.textContent = Math.round(this.targets()[0].val)
        }
      })
    }
  }, [result])

  const score = result.overall_tension_score
  const scoreColor = SCORE_COLOR(score)

  return (
    <div className="ar-wrap" ref={panelRef}>
      <div className="ar-topbar">
        <button className="ar-back-btn" onClick={onBack}>← New analysis</button>
        {timestamp && <span className="ar-date">{formatDate(timestamp)}</span>}
      </div>

      <div className="ar-header">
        <div className="ar-label">autopsy report</div>
        <div className="ar-scores">
          <div className="ar-score-card">
            <div className="ar-score-num" ref={scoreRef} style={{ color: scoreColor }}>0</div>
            <div className="ar-score-subline">tension score</div>
            <div className="ar-score-bar">
              <div className="ar-score-fill" style={{ width: `${score}%`, background: `linear-gradient(90deg, ${scoreColor}99, ${scoreColor})` }} />
            </div>
          </div>
          <div className="ar-score-card">
            <div className="ar-conflict-mode">{result.conflict_mode}</div>
            <div className="ar-score-subline">conflict mode</div>
            <div className="ar-mode-pills">
              {result.conflict_mode.split(' vs ').map((m, i) => (
                <span key={i} className="ar-mode-pill" style={{ background: i === 0 ? 'rgba(248,113,113,0.12)' : 'rgba(167,139,250,0.12)', color: i === 0 ? '#fca5a5' : '#c4b5fd', border: `1px solid ${i === 0 ? 'rgba(248,113,113,0.25)' : 'rgba(167,139,250,0.25)'}` }}>{m}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="ar-timeline">
        {result.messages.map((msg, i) => {
          const colors = TAG_COLORS[msg.gottman_flag] || TAG_COLORS.Neutral
          return (
            <div key={i} className="ar-message">
              <div className="ar-sender">{msg.sender}</div>
              <div className="ar-bubble" style={{ background: colors.bg, borderColor: colors.border }}>
                <div className="ar-text">"{msg.text}"</div>
                <div className="ar-meta">
                  <span className="ar-tag" style={{ color: colors.text }}>{msg.gottman_flag}</span>
                  <span className="ar-ego" style={{ color: EGO_COLORS[msg.ego_state] || '#9ca3af' }}>{msg.ego_state} state</span>
                </div>
                <div className="ar-hidden">
                  <span className="ar-hidden-label">hidden meaning</span>
                  <span className="ar-hidden-text">{msg.hidden_meaning}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="ar-footer">
        <span className="ar-powered">analyzed with gottman · tki · transactional analysis</span>
      </div>
    </div>
  )
}
