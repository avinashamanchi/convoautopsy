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
        <p>After a separate exact-data review, AI analysis sends to ConvoAutopsy&apos;s Cloudflare service: schema version, consent version, an installation token, and each reviewed message sender and message text. The service forwards only each reviewed message sender and message text to Groq.</p>
        <p>AI response drafting sends to the same Cloudflare service: schema version, consent version, the installation token, your chosen response sender, goal, and tone, the analysis mode, intensity score, and conflict mode, plus each message sender, edited message text, pattern, ego state, and edited possible interpretation. The service forwards the content and drafting fields to Groq. It does not forward schema version, consent version, the installation token, or analysis mode to Groq.</p>
        <p>Person labels are pseudonymous, not anonymous, so text can still identify people. Technical identifier values are not displayed in the exact-data review. ConvoAutopsy does not intentionally store conversation text. Automated output can be wrong. On-device analysis and drafts are available without sharing.</p>
        <p>Separately, in the native app, Free verification can send a pseudonymous RevenueCat app-user ID even without a subscription; purchase and entitlement checks can send that ID and purchase information to RevenueCat.</p>
        <div className="ai-consent-actions">
          <button ref={agreeRef} onClick={onAgree} disabled={isRunning}>{isRunning ? 'Starting AI analysis…' : 'Agree and continue'}</button>
          <button ref={declineRef} onClick={onDecline} disabled={isRunning}>Use on-device analysis</button>
        </div>
      </div>
    </div>
  )
}
