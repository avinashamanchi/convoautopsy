import { useEffect, useRef, useState } from 'react'
import { craftResponse, GOAL_OPTIONS, TONE_OPTIONS, getPersonSenders } from '../utils/craftResponse'
import { getAiConsent } from '../utils/aiConsent'

export default function ResponseCrafter({ result, conversationText }) {
  const [step, setStep] = useState(1)
  const [sender, setSender] = useState('')
  const [goal, setGoal] = useState('')
  const [tone, setTone] = useState('')
  const [responses, setResponses] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(null)
  const [error, setError] = useState('')
  const [responseSource, setResponseSource] = useState(null)
  const requestRef = useRef(null)
  const requestGeneration = useRef(0)
  const copyGeneration = useRef(0)
  const copyTimer = useRef(null)

  useEffect(() => {
    requestGeneration.current += 1
    const generation = requestGeneration.current
    requestRef.current?.abort()
    requestRef.current = null
    copyGeneration.current += 1
    clearTimeout(copyTimer.current)
    queueMicrotask(() => {
      if (generation !== requestGeneration.current) return
      setStep(1)
      setSender('')
      setGoal('')
      setTone('')
      setResponses(null)
      setResponseSource(null)
      setCopied(null)
      setError('')
      setLoading(false)
    })
    return () => {
      requestGeneration.current += 1
      requestRef.current?.abort()
      copyGeneration.current += 1
      clearTimeout(copyTimer.current)
    }
  }, [result, conversationText])

  const senders = getPersonSenders(result)

  const generate = async (selectedTone) => {
    requestGeneration.current += 1
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    const generation = requestGeneration.current
    setLoading(true)
    setError('')
    setStep(4)
    try {
      const consent = getAiConsent()
      const r = await craftResponse(
        { sender, goal, tone: selectedTone, result, conversationText },
        consent
          ? { allowRemote: true, consentVersion: consent.version, installationToken: consent.installationToken, signal: controller.signal }
          : { allowRemote: false, signal: controller.signal },
      )
      if (generation !== requestGeneration.current || controller.signal.aborted) return
      setResponses(r.drafts)
      setResponseSource(r)
    } catch (error) {
      if (generation !== requestGeneration.current || controller.signal.aborted || error?.name === 'AbortError') return
      setError('Failed to generate responses. Try again.')
    }
    if (generation === requestGeneration.current) {
      requestRef.current = null
      setLoading(false)
    }
  }

  const handleCopy = async (id, text) => {
    const generation = ++copyGeneration.current
    clearTimeout(copyTimer.current)
    setCopied(null)
    setError('')
    try {
      await navigator.clipboard.writeText(text)
      if (generation !== copyGeneration.current) return
      setCopied(id)
      copyTimer.current = setTimeout(() => {
        if (generation === copyGeneration.current) setCopied(null)
      }, 2200)
    } catch {
      if (generation === copyGeneration.current) setError('Copy failed. Select and copy the draft manually.')
    }
  }

  const reset = () => {
    requestGeneration.current += 1
    requestRef.current?.abort()
    requestRef.current = null
    copyGeneration.current += 1
    clearTimeout(copyTimer.current)
    setLoading(false)
    setCopied(null)
    setStep(1)
    setSender('')
    setGoal('')
    setTone('')
    setResponses(null)
    setResponseSource(null)
    setError('')
  }

  const STEP_LABELS = ['Who', 'Goal', 'Tone', 'Responses']

  return (
    <div className="rc-root">
      <div className="rc-header">
        <div className="rc-title-row">
          <span className="rc-title">Craft Your Response</span>
          <span className="rc-subtitle">Get tailored ideas based on the analysis</span>
        </div>
        <div className="rc-progress">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className={`rc-prog-step ${i + 1 === step ? 'active' : i + 1 < step ? 'done' : ''}`}>
              <div className="rc-prog-dot">{i + 1 < step ? '✓' : i + 1}</div>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rc-body">
        {step === 1 && (
          <div className="rc-step-content">
            <div className="rc-question">Who do you want to respond as?</div>
            <div className="rc-who-options">
              {senders.map(s => (
                <button key={s} className="rc-who-btn" onClick={() => { setSender(s); setStep(2) }}>
                  <div className="rc-who-avatar">{s.split(' ').pop()}</div>
                  <div className="rc-who-label">{s}</div>
                  <div className="rc-who-pattern">
                    {result?.messages?.filter(m => m.sender === s).length || 0} messages
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="rc-step-content">
            <div className="rc-question">What's your goal with this response?</div>
            <div className="rc-grid-6">
              {GOAL_OPTIONS.map(g => (
                <button key={g.id} className={`rc-option-tile ${goal === g.id ? 'selected' : ''}`}
                  onClick={() => { setGoal(g.id); setStep(3) }}>
                  <span className="rc-tile-icon">{g.icon}</span>
                  <span className="rc-tile-label">{g.label}</span>
                </button>
              ))}
            </div>
            <button className="rc-back-btn" onClick={() => setStep(1)}>← Back</button>
          </div>
        )}

        {step === 3 && (
          <div className="rc-step-content">
            <div className="rc-question">What tone do you want?</div>
            <div className="rc-grid-5">
              {TONE_OPTIONS.map(t => (
                <button key={t.id} className={`rc-option-tile ${tone === t.id ? 'selected' : ''}`}
                  onClick={() => { setTone(t.id); generate(t.id) }}>
                  <span className="rc-tile-icon">{t.icon}</span>
                  <span className="rc-tile-label">{t.label}</span>
                </button>
              ))}
            </div>
            <button className="rc-back-btn" onClick={() => setStep(2)}>← Back</button>
          </div>
        )}

        {step === 4 && (
          <div className="rc-step-content">
            {loading && (
              <div className="rc-loading">
                <div className="rc-dots"><span/><span/><span/></div>
                <p>Crafting your responses…</p>
              </div>
            )}
            {error && <div className="rc-error">{error}</div>}
            {!loading && responses && (
              <>
                <div className="rc-question">{responses.length} {responses.length === 1 ? 'option' : 'options'} for {sender}</div>
                <div className={`rc-source rc-source-${responseSource?.source || 'local'}`}>
                  {responseSource?.source === 'ai'
                    ? 'AI-assisted draft'
                    : responseSource?.fallbackReason === 'REMOTE_UNAVAILABLE'
                      ? 'AI service unavailable—showing on-device drafts.'
                      : 'On-device drafts'}
                </div>
                <div className="rc-responses-list">
                  {responses.map(r => (
                    <div key={r.id} className="rc-response-card">
                      <div className="rc-response-top">
                        <span className="rc-hint">{r.hint}</span>
                        <button className={`rc-copy-btn ${copied === r.id ? 'copied' : ''}`}
                          onClick={() => handleCopy(r.id, r.text)}>
                          {copied === r.id ? '✓ Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="rc-response-text">{r.text}</p>
                    </div>
                  ))}
                </div>
                <button className="rc-retry-btn" onClick={reset}>Try different settings →</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
