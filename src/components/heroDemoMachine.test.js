import { describe, expect, it } from 'vitest'
import {
  HERO_DEMO_STAGES,
  initialHeroDemoStage,
  nextHeroDemoStage,
} from './heroDemoMachine'

describe('ConvoAutopsy hero demo state', () => {
  it('moves through the complete reflection story in order', () => {
    expect(HERO_DEMO_STAGES).toEqual(['exchange', 'evidence', 'patterns', 'response'])
    expect(nextHeroDemoStage('exchange')).toBe('evidence')
    expect(nextHeroDemoStage('evidence')).toBe('patterns')
    expect(nextHeroDemoStage('patterns')).toBe('response')
    expect(nextHeroDemoStage('response')).toBe('exchange')
  })

  it('starts reduced-motion visitors on the completed response option', () => {
    expect(initialHeroDemoStage(true)).toBe('response')
    expect(initialHeroDemoStage(false)).toBe('exchange')
  })
})
