import { useEffect, useRef } from 'react'

export default function AiConsentModal({ onAgree, onDecline, isRunning, returnFocusRef }) {
  const agreeRef = useRef(null)
  const declineRef = useRef(null)

  useEffect(() => {
    const trigger = returnFocusRef?.current
    agreeRef.current?.focus()
    return () => trigger?.focus()
  }, [returnFocusRef])

  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && !isRunning) {
      event.preventDefault()
      onDecline()
      return
    }
    if (event.key !== 'Tab' || isRunning) return

    const controls = [agreeRef.current, declineRef.current]
    const currentIndex = controls.indexOf(document.activeElement)
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? controls.length - 1 : currentIndex - 1)
      : (currentIndex === controls.length - 1 ? 0 : currentIndex + 1)
    event.preventDefault()
    controls[nextIndex]?.focus()
  }

  return (
    <div className="ai-consent-backdrop" role="presentation">
      <div className="ai-consent-modal" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title" onKeyDown={handleKeyDown}>
        <h2 id="ai-consent-title">Before AI-assisted analysis</h2>
        <p>Names are replaced with Person labels. Message text is sent to Groq through ConvoAutopsy&apos;s server. ConvoAutopsy does not intentionally store that text. Automated output can be wrong. On-device analysis is available without sharing.</p>
        <div className="ai-consent-actions">
          <button ref={agreeRef} onClick={onAgree} disabled={isRunning}>{isRunning ? 'Starting AI analysis…' : 'Agree and continue'}</button>
          <button ref={declineRef} onClick={onDecline} disabled={isRunning}>Use on-device analysis</button>
        </div>
      </div>
    </div>
  )
}
