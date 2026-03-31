import { useState } from 'react'
import { craftResponse, GOAL_OPTIONS, TONE_OPTIONS, getPersonSenders } from '../utils/craftResponse'

export default function ResponseCrafter({ result, conversationText }) {
  const [step, setStep] = useState(1)
  const [sender, setSender] = useState('')
  const [goal, setGoal] = useState('')
  const [tone, setTone] = useState('')
  const [responses, setResponses] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(null)
  const [error, setError] = useState('')

  const senders = getPersonSenders(result)

  const generate = async (selectedTone) => {
    setLoading(true)
    setError('')
    setStep(4)
    try {
      const r = await craftResponse({ sender, goal, tone: selectedTone, result, conversationText })
      setResponses(r)
    } catch {
      setError('Failed to generate responses. Try again.')
    }
    setLoading(false)
  }

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 2200)
  }

  const reset = () => { setStep(1); setSender(''); setGoal(''); setTone(''); setResponses(null); setError('') }

  const STEP_LABELS = ['Who', 'Goal', 'Tone', 'Responses']

  return (
    <div className="rc-root">
      <div className="rc-header">
        <div className="rc-title-row">
          <span className="rc-title">Craft Your Response</span>
          <span className="rc-subtitle">Get AI-tailored ideas based on the analysis</span>
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
                <div className="rc-question">3 options for {sender}</div>
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
