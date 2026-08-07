import { useEffect, useMemo, useRef, useState } from 'react'
import {
  countCodePoints,
  REMOTE_ANALYSIS_MAX_MESSAGE_CHARACTERS,
  REMOTE_ANALYSIS_MAX_MESSAGES,
  REMOTE_RESPONSE_MAX_INTERPRETATION_CHARACTERS,
} from '../utils/textLimits'

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

function reviewableSnapshot(snapshot) {
  const allowed = ['participants', 'sender', 'goal', 'tone', 'analysis', 'messages']
  return Object.fromEntries(allowed
    .filter(key => Object.prototype.hasOwnProperty.call(snapshot ?? {}, key))
    .map(key => [key, clone(snapshot[key])]))
}

export default function RemoteDataReview({ snapshot, isConfirming, onConfirm, onCancel }) {
  const [draft, setDraft] = useState(() => reviewableSnapshot(snapshot))
  const confirmedRef = useRef(false)
  const dialogRef = useRef(null)
  const headingRef = useRef(null)
  const returnFocusRef = useRef(null)
  const titleId = useMemo(() => `remote-review-${crypto.randomUUID?.() ?? 'title'}`, [])
  const messages = Array.isArray(draft.messages) ? draft.messages : []
  const invalidMessageCount = messages.length === 0 || messages.length > REMOTE_ANALYSIS_MAX_MESSAGES
  const hasInvalidFields = messages.some((message) => (
    typeof message?.text !== 'string'
    || !message.text.trim()
    || countCodePoints(message.text) > REMOTE_ANALYSIS_MAX_MESSAGE_CHARACTERS
    || (Object.prototype.hasOwnProperty.call(message ?? {}, 'possibleInterpretation') && (
      typeof message.possibleInterpretation !== 'string'
      || !message.possibleInterpretation.trim()
      || countCodePoints(message.possibleInterpretation) > REMOTE_RESPONSE_MAX_INTERPRETATION_CHARACTERS
    ))
  ))
  const hasInvalidReview = invalidMessageCount || hasInvalidFields

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    headingRef.current?.focus()
    return () => {
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus()
    }
  }, [])

  const updateMessage = (index, field, value) => {
    setDraft((current) => ({
      ...current,
      messages: current.messages.map((message, messageIndex) => (
        messageIndex === index ? { ...message, [field]: value } : message
      )),
    }))
  }

  const confirm = () => {
    if (confirmedRef.current || isConfirming || hasInvalidReview) return
    confirmedRef.current = true
    onConfirm(freeze(clone(draft)))
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const controls = [...(dialogRef.current?.querySelectorAll('textarea, button') ?? [])]
      .filter(control => !control.disabled)
    if (controls.length === 0) return
    const currentIndex = controls.indexOf(document.activeElement)
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? controls.length - 1 : currentIndex - 1)
      : (currentIndex < 0 || currentIndex === controls.length - 1 ? 0 : currentIndex + 1)
    event.preventDefault()
    controls[nextIndex]?.focus()
  }

  return (
    <div className="remote-review-backdrop" role="presentation">
      <section ref={dialogRef} className="remote-review" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
        <h2 ref={headingRef} id={titleId} tabIndex={-1}>Review exact text sent for AI</h2>
        <p>
          Person labels are pseudonymous, not anonymous. Review and redact residual identifiers such as
          emails, phone numbers, third-party names, and identifying context before continuing.
        </p>
        <p className="remote-review-technical">
          ConvoAutopsy&apos;s server also receives schema version, consent version, and an installation token.
          Identifier values are not displayed in this review, and these technical fields are not forwarded to Groq.
        </p>
        {messages.length === 0 && <p role="alert">At least one reviewed message is required for remote AI.</p>}
        {messages.length > REMOTE_ANALYSIS_MAX_MESSAGES && <p role="alert">Remote AI can review up to 10 messages at a time.</p>}

        {draft.participants?.length > 0 && (
          <div className="remote-review-mappings" aria-label="On-device participant mappings, not sent">
            <strong>On-device participant mappings (not sent)</strong>
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

        {draft.analysis && (
          <dl className="remote-review-settings remote-review-analysis">
            <dt>Server schema version</dt><dd>{draft.analysis.schemaVersion} (not forwarded to Groq)</dd>
            <dt>Analysis mode</dt><dd>{draft.analysis.mode} (not forwarded to Groq)</dd>
            <dt>Intensity score</dt><dd>{draft.analysis.intensityScore}</dd>
            <dt>Conflict mode</dt><dd>{draft.analysis.conflictMode}</dd>
          </dl>
        )}

        <div className="remote-review-messages">
          {messages.map((message, index) => (
            <fieldset key={`${message.sender}-${index}`} disabled={isConfirming}>
              <legend>{message.sender} · message {index + 1}</legend>
              <dl className="remote-review-settings remote-review-message-fields">
                <dt>Message sender</dt><dd>{message.sender}</dd>
                {Object.prototype.hasOwnProperty.call(message, 'pattern') && <><dt>Pattern</dt><dd>{message.pattern}</dd></>}
                {Object.prototype.hasOwnProperty.call(message, 'egoState') && <><dt>Ego state</dt><dd>{message.egoState}</dd></>}
              </dl>
              <label>
                Outgoing message text
                <textarea
                  aria-label={`Outgoing text for ${message.sender} message ${index + 1}`}
                  value={message.text}
                  onChange={(event) => updateMessage(index, 'text', event.target.value)}
                  disabled={isConfirming}
                />
                {!message.text.trim() && <span role="alert">Message text cannot be empty.</span>}
                {countCodePoints(message.text) > REMOTE_ANALYSIS_MAX_MESSAGE_CHARACTERS && <span role="alert">Message text must be 280 characters or fewer for remote AI.</span>}
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
                  {!message.possibleInterpretation.trim() && <span role="alert">Possible interpretation cannot be empty.</span>}
                  {countCodePoints(message.possibleInterpretation) > REMOTE_RESPONSE_MAX_INTERPRETATION_CHARACTERS && <span role="alert">Possible interpretation must be 150 characters or fewer for remote AI.</span>}
                </label>
              )}
            </fieldset>
          ))}
        </div>

        <div className="remote-review-actions">
          <button type="button" onClick={confirm} disabled={isConfirming || hasInvalidReview}>
            {isConfirming ? 'Sending reviewed data…' : 'Confirm exact data'}
          </button>
          <button type="button" onClick={onCancel}>Cancel remote request</button>
        </div>
      </section>
    </div>
  )
}
