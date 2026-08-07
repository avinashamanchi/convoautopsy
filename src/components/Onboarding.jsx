import { useState } from 'react'
import { markOnboarded } from '../utils/storage'

const STEPS = [
  {
    step: '01',
    title: 'Welcome to ConvoAutopsy',
    body: 'An educational tool for reflecting on wording patterns before you reply.',
    detail: 'It offers estimates inspired by communication frameworks. Results may be incomplete or wrong and do not determine intent or relationship facts.',
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
    title: 'Review an educational estimate',
    body: 'Messages may receive descriptive labels for:',
    bullets: [
      'Gottman flag — Criticism, Contempt, Defensiveness, or Stonewalling',
      'Ego state — Parent, Adult, or Child mode',
      'Possible interpretation — one reflection to review, not the sender\'s intent',
      'Intensity estimate — 0 to 100',
    ],
    icon: '📊',
  },
  {
    step: '04',
    title: 'Choose what to save',
    body: 'Saved analyses stay in this browser until you delete its data.',
    detail: 'Revisit descriptive pattern estimates for reflection. They do not establish blame or facts about another person.',
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
