import { useMemo, useRef, useState } from 'react'

function clone(value) {
  if (Array.isArray(value)) return value.map(clone)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]))
  }
  return value
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

export default function RemoteDataReview({ snapshot, isConfirming, onConfirm, onCancel }) {
  const [draft, setDraft] = useState(() => clone(snapshot))
  const confirmedRef = useRef(false)
  const titleId = useMemo(() => `remote-review-${crypto.randomUUID?.() ?? 'title'}`, [])

  const updateMessage = (index, field, value) => {
    setDraft((current) => ({
      ...current,
      messages: current.messages.map((message, messageIndex) => (
        messageIndex === index ? { ...message, [field]: value } : message
      )),
    }))
  }

  const confirm = () => {
    if (confirmedRef.current || isConfirming) return
    confirmedRef.current = true
    onConfirm(freeze(clone(draft)))
  }

  return (
    <div className="remote-review-backdrop" role="presentation">
      <section className="remote-review" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>Review exact text sent for AI</h2>
        <p>
          Person labels are pseudonymous, not anonymous. Review and redact residual identifiers such as
          emails, phone numbers, third-party names, and identifying context before continuing.
        </p>

        {draft.participants?.length > 0 && (
          <div className="remote-review-mappings" aria-label="Participant label mappings">
            <strong>Participant mappings</strong>
            {draft.participants.map((participant) => (
              <div key={`${participant.sourceLabel}-${participant.outboundLabel}`}>
                {participant.sourceLabel} → {participant.outboundLabel}
              </div>
            ))}
          </div>
        )}

        {(draft.sender || draft.goal || draft.tone) && (
          <dl className="remote-review-settings">
            {draft.sender && <><dt>Responding as</dt><dd>{draft.sender}</dd></>}
            {draft.goal && <><dt>Goal</dt><dd>{draft.goal}</dd></>}
            {draft.tone && <><dt>Tone</dt><dd>{draft.tone}</dd></>}
          </dl>
        )}

        <div className="remote-review-messages">
          {draft.messages.map((message, index) => (
            <fieldset key={`${message.sender}-${index}`} disabled={isConfirming}>
              <legend>{message.sender} · message {index + 1}</legend>
              <label>
                Outgoing message text
                <textarea
                  aria-label={`Outgoing text for ${message.sender} message ${index + 1}`}
                  value={message.text}
                  onChange={(event) => updateMessage(index, 'text', event.target.value)}
                  disabled={isConfirming}
                />
              </label>
              {Object.prototype.hasOwnProperty.call(message, 'possibleInterpretation') && (
                <label>
                  Outgoing possible interpretation
                  <textarea
                    aria-label={`Outgoing possible interpretation for ${message.sender} message ${index + 1}`}
                    value={message.possibleInterpretation}
                    onChange={(event) => updateMessage(index, 'possibleInterpretation', event.target.value)}
                    disabled={isConfirming}
                  />
                </label>
              )}
            </fieldset>
          ))}
        </div>

        <div className="remote-review-actions">
          <button type="button" onClick={confirm} disabled={isConfirming}>
            {isConfirming ? 'Sending reviewed data…' : 'Confirm exact data'}
          </button>
          <button type="button" onClick={onCancel}>Cancel remote request</button>
        </div>
      </section>
    </div>
  )
}
