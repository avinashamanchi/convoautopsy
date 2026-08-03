export default function AiConsentModal({ onAgree, onDecline, isRunning }) {
  return (
    <div className="ai-consent-backdrop" role="presentation">
      <div className="ai-consent-modal" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title">
        <h2 id="ai-consent-title">Before AI-assisted analysis</h2>
        <p>Names are replaced with Person labels. Message text is sent to Groq through ConvoAutopsy&apos;s server. ConvoAutopsy does not intentionally store that text. Automated output can be wrong. On-device analysis is available without sharing.</p>
        <div className="ai-consent-actions">
          <button onClick={onAgree} disabled={isRunning}>{isRunning ? 'Starting AI analysis…' : 'Agree and continue'}</button>
          <button onClick={onDecline} disabled={isRunning}>Use on-device analysis</button>
        </div>
      </div>
    </div>
  )
}
