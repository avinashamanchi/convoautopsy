import { useState, useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import './InputModal.css'

const PLACEHOLDER = `Alex: I just think it's interesting how you never text first
Jordan: Here we go again
Alex: See? That's exactly what I mean
Jordan: Whatever, do what you want
Alex: You always do this
Jordan: I'm done talking about this`

const LOADING_MSGS = [
  'Parsing messages…',
  'Mapping ego states…',
  'Detecting the Four Horsemen…',
  'Scoring tension levels…',
  'Writing the diagnosis…',
]

export default function InputModal({ open, onClose, onAnalyze, loading }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [loadingMsg, setLoadingMsg] = useState(0)
  const overlayRef = useRef()
  const panelRef = useRef()
  const loadingInterval = useRef()

  useEffect(() => {
    if (!overlayRef.current || !panelRef.current) return

    if (open) {
      gsap.to(overlayRef.current, {
        opacity: 1, duration: 0.3, ease: 'power2.out',
        onStart: () => { overlayRef.current.style.pointerEvents = 'auto' }
      })
      gsap.fromTo(panelRef.current,
        { y: 50, opacity: 0, scale: 0.97 },
        { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'power3.out', delay: 0.08 }
      )
    } else {
      gsap.to(overlayRef.current, {
        opacity: 0, duration: 0.2, ease: 'power2.in',
        onComplete: () => { if (overlayRef.current) overlayRef.current.style.pointerEvents = 'none' }
      })
      gsap.to(panelRef.current, { y: 20, opacity: 0, duration: 0.15, ease: 'power2.in' })
    }
  }, [open])

  useEffect(() => {
    if (loading) {
      setLoadingMsg(0)
      loadingInterval.current = setInterval(() => {
        setLoadingMsg(prev => (prev + 1) % LOADING_MSGS.length)
      }, 1600)
    } else {
      clearInterval(loadingInterval.current)
    }
    return () => clearInterval(loadingInterval.current)
  }, [loading])

  const handleSubmit = async () => {
    if (!text.trim() || loading) return
    setError('')
    try {
      await onAnalyze(text)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
  }

  const lineCount = text.split('\n').filter(l => l.trim()).length

  return (
    <div className="input-overlay" ref={overlayRef} style={{ opacity: 0, pointerEvents: 'none' }}
      onClick={(e) => { if (e.target === overlayRef.current && !loading) onClose() }}>
      <div className="input-panel" ref={panelRef} style={{ opacity: 0 }}>

        {!loading ? (
          <>
            <div className="input-header">
              <div>
                <div className="input-label">New Autopsy</div>
                <div className="input-sublabel">Paste a conversation below. Use "Name: message" format.</div>
              </div>
              <button className="input-close" onClick={onClose} aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="input-textarea-wrap">
              <textarea
                className="input-textarea"
                value={text}
                onChange={e => { setText(e.target.value); setError('') }}
                onKeyDown={handleKeyDown}
                placeholder={PLACEHOLDER}
                spellCheck={false}
                autoFocus
              />
              {lineCount > 0 && (
                <div className="input-char-count">{lineCount} lines</div>
              )}
            </div>

            {error && <div className="input-error">{error}</div>}

            <div className="input-footer">
              <span className="input-hint">⌘+Enter to analyze</span>
              <button
                className={`btn-primary ${text.trim().length < 10 ? 'btn-disabled' : ''}`}
                onClick={handleSubmit}
                disabled={text.trim().length < 10}
              >
                Run the autopsy
              </button>
            </div>
          </>
        ) : (
          <div className="input-loading">
            <div className="input-loading-pulse">
              <div className="pulse-ring" />
              <div className="pulse-ring delay-1" />
              <div className="pulse-ring delay-2" />
              <div className="pulse-core" />
            </div>
            <p className="input-loading-msg" key={loadingMsg}>{LOADING_MSGS[loadingMsg]}</p>
            <div className="input-loading-bar">
              <div className="input-loading-fill" />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
