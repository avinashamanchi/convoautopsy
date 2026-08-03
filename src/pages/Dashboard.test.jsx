import { describe, expect, it } from 'vitest'
import { analysisSourceMessage } from '../utils/analysisSourceMessage'

describe('analysisSourceMessage', () => {
  it('distinguishes a missing AI configuration from a remote outage', () => {
    expect(analysisSourceMessage('local', 'NOT_CONFIGURED')).toBe('AI-assisted analysis is not configured—showing the on-device estimate.')
    expect(analysisSourceMessage('local', 'REMOTE_UNAVAILABLE')).toBe('AI service unavailable—showing the on-device estimate.')
  })

  it('does not mislabel intentional local or consent-declined analysis as an outage', () => {
    expect(analysisSourceMessage('local', 'LOCAL_REQUESTED')).toBe('On-device estimate.')
    expect(analysisSourceMessage('local', null)).toBe('On-device estimate.')
    expect(analysisSourceMessage('ai', null)).toBe('AI-assisted analysis')
  })
})
