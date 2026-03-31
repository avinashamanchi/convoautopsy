import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import html2canvas from 'html2canvas'

const TAG_COLORS = {
  Stonewalling: { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', text: '#fca5a5' },
  Criticism:    { bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.3)',   text: '#fcd34d' },
  Contempt:     { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', text: '#c4b5fd' },
  Defensiveness:{ bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.25)', text: '#6ee7b7' },
  Neutral:      { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', text: '#9ca3af' },
}
const EGO_COLORS = { Child: '#f472b6', Parent: '#fbbf24', Adult: '#34d399' }
const SCORE_COLOR = (s) => s >= 75 ? '#f87171' : s >= 50 ? '#fbbf24' : '#34d399'

// Intensity class for kinematic typography
const KINEMATIC_CLASS = {
  Contempt:     'ar-kinematic-shake',
  Stonewalling: 'ar-kinematic-fade',
  Criticism:    'ar-kinematic-pulse',
  Defensiveness:'ar-kinematic-jitter',
  Neutral:      '',
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AnalysisResult({ result, timestamp, onBack }) {
  const panelRef = useRef()
  const scoreRef = useRef()
  const receiptRef = useRef()
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)

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

  const handleExport = async () => {
    if (!receiptRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: '#070708',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      const link = document.createElement('a')
      link.download = `convoautopsy-${Date.now()}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      setExported(true)
      setTimeout(() => setExported(false), 2500)
    } catch (e) {
      console.error('Export failed:', e)
    }
    setExporting(false)
  }

  const score = result.overall_tension_score
  const scoreColor = SCORE_COLOR(score)

  return (
    <div className="ar-wrap" ref={panelRef}>
      <div className="ar-topbar">
        <button className="ar-back-btn" onClick={onBack}>← New analysis</button>
        <div className="ar-topbar-right">
          {timestamp && <span className="ar-date">{formatDate(timestamp)}</span>}
          <button
            className={`ar-export-btn ${exported ? 'ar-export-done' : ''}`}
            onClick={handleExport}
            disabled={exporting}
            title="Export as shareable receipt"
          >
            {exporting ? '⏳' : exported ? '✓ Saved!' : '↓ Save receipt'}
          </button>
        </div>
      </div>

      {/* Visible analysis UI */}
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
          const kinematic = KINEMATIC_CLASS[msg.gottman_flag] || ''
          return (
            <div key={i} className="ar-message">
              <div className="ar-sender">{msg.sender}</div>
              <div className={`ar-bubble ${kinematic}`} style={{ background: colors.bg, borderColor: colors.border }}>
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

      {/* Off-screen receipt for html2canvas export — 9:16 portrait card */}
      <div
        ref={receiptRef}
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '540px',
          height: '960px',
          background: 'linear-gradient(160deg, #0d0b14 0%, #070708 40%, #0a0010 100%)',
          padding: '48px 40px',
          fontFamily: "'DM Sans', sans-serif",
          color: '#f0eff4',
          display: 'flex',
          flexDirection: 'column',
          gap: '0',
          overflow: 'hidden',
        }}
      >
        {/* Receipt header */}
        <div style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.6)', marginBottom: '8px' }}>
          autopsy report
        </div>
        <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '28px', color: '#f0eff4', marginBottom: '4px', letterSpacing: '-0.02em' }}>
          Convo<span style={{ color: '#a78bfa', fontStyle: 'italic' }}>Autopsy</span>
        </div>
        {timestamp && (
          <div style={{ fontSize: '12px', color: 'rgba(240,239,244,0.35)', marginBottom: '36px' }}>
            {formatDate(timestamp)}
          </div>
        )}

        {/* Score block */}
        <div style={{
          background: 'rgba(10,8,20,0.8)',
          border: '1px solid rgba(167,139,250,0.2)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'rgba(240,239,244,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
                tension score
              </div>
              <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: '72px', color: scoreColor, lineHeight: 1, fontWeight: 400 }}>
                {score}
              </div>
            </div>
            <div style={{
              background: 'rgba(167,139,250,0.1)',
              border: '1px solid rgba(167,139,250,0.2)',
              borderRadius: '10px',
              padding: '8px 14px',
              fontSize: '12px',
              color: 'rgba(240,239,244,0.7)',
              maxWidth: '160px',
              textAlign: 'center',
            }}>
              {result.conflict_mode}
            </div>
          </div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${score}%`, background: `linear-gradient(90deg, ${scoreColor}80, ${scoreColor})`, borderRadius: '2px' }} />
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
          {result.messages.slice(0, 6).map((msg, i) => {
            const c = TAG_COLORS[msg.gottman_flag] || TAG_COLORS.Neutral
            return (
              <div key={i} style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: '10px',
                padding: '10px 14px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', color: 'rgba(240,239,244,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {msg.sender}
                  </span>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: c.text,
                    background: `${c.border}20`,
                    padding: '2px 8px',
                    borderRadius: '100px',
                  }}>
                    {msg.gottman_flag}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(240,239,244,0.75)', fontStyle: 'italic', lineHeight: 1.5 }}>
                  "{msg.text.slice(0, 60)}{msg.text.length > 60 ? '…' : ''}"
                </div>
              </div>
            )
          })}
        </div>

        {/* Receipt footer */}
        <div style={{
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '11px', color: 'rgba(240,239,244,0.25)', letterSpacing: '0.06em' }}>
            gottman · tki · transactional analysis
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(167,139,250,0.5)', letterSpacing: '0.06em' }}>
            convoautopsy.app
          </span>
        </div>
      </div>
    </div>
  )
}
