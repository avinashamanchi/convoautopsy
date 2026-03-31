import { useState } from 'react'
import { markOnboarded } from '../utils/storage'

const STEPS = [
  {
    step: '01',
    title: 'Welcome to ConvoAutopsy',
    body: 'The only tool that diagnoses your conversations like a clinician. No judgment — just science.',
    detail: 'Powered by Gottman\'s Four Horsemen, Thomas-Kilmann conflict modes, and Transactional Analysis ego states. The same frameworks therapists use, applied to your texts.',
    icon: '🔬',
  },
  {
    step: '02',
    title: 'Paste any conversation',
    body: 'Format it as Name: Message — one per line.',
    detail: null,
    example: `Alex: I told you I'd be there by 7.\nJordan: You never listen to anything.\nAlex: That's not what I said.`,
    icon: '💬',
  },
  {
    step: '03',
    title: 'Get the full diagnosis',
    body: 'Every message is analyzed for:',
    bullets: [
      'Gottman flag — Criticism, Contempt, Defensiveness, or Stonewalling',
      'Ego state — Parent, Adult, or Child mode',
      'Hidden meaning — what they actually meant',
      'Tension score — 0 to 100',
    ],
    icon: '📊',
  },
  {
    step: '04',
    title: 'Your receipts never expire',
    body: 'Every autopsy is saved to your account automatically.',
    detail: 'Come back weeks later and your analyses are still here. Build a case. Track patterns. Know exactly who the problem is.',
    icon: '💾',
  },
]

export default function Onboarding({ username, onDone }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  const handleNext = () => {
    if (isLast) { markOnboarded(username); onDone() }
    else setStep(s => s + 1)
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          {STEPS.map((_, i) => (
            <div key={i} className={`onboarding-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} onClick={() => i < step && setStep(i)} />
          ))}
        </div>

        <div className="onboarding-step-label">{current.step} / 0{STEPS.length}</div>
        <div className="onboarding-icon">{current.icon}</div>
        <h2 className="onboarding-title">{current.title}</h2>
        <p className="onboarding-body">{current.body}</p>

        {current.detail && <p className="onboarding-detail">{current.detail}</p>}

        {current.example && (
          <div className="onboarding-example">
            {current.example.split('\n').map((line, i) => (
              <div key={i} className="onboarding-example-line">{line}</div>
            ))}
          </div>
        )}

        {current.bullets && (
          <ul className="onboarding-bullets">
            {current.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}

        <div className="onboarding-actions">
          {step > 0 && (
            <button className="onboarding-back" onClick={() => setStep(s => s - 1)}>Back</button>
          )}
          <button className="onboarding-next" onClick={handleNext}>
            {isLast ? 'Start analyzing →' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
