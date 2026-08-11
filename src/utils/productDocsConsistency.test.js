import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const fromRoot = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('approved monetization documentation', () => {
  it('keeps Private Trends free and documents the exact Free and Pro reset windows', async () => {
    const [spec, plan] = await Promise.all([
      fromRoot('docs/superpowers/specs/2026-08-07-convoautopsy-25k-monetization-design.md'),
      fromRoot('docs/superpowers/plans/2026-08-07-convoautopsy-25k-foundation.md'),
    ])
    const combined = `${spec}\n${plan}`
    const proSection = spec.split('ConvoAutopsy Pro provides:')[1]?.split('These are fair-use ceilings')[0] ?? ''
    const taskSix = plan.split('### Task 6:')[1]?.split('### Task 7:')[0] ?? ''
    const taskSixStepFive = taskSix.split('**Step 5:')[1]?.split('**Step 6:')[0] ?? ''

    expect(spec).toContain('Free remote allowances reset on a rolling 30-day window.')
    expect(spec).toContain('Pro remote allowances reset at the start of each UTC calendar month.')
    expect(spec).toMatch(/Private Trends[^\n]*free/i)
    expect(proSection).toMatch(/75 remote AI analyses and 150 remote AI response drafts/i)
    expect(proSection).toMatch(/report history without an artificial count cap/i)
    expect(proSection).not.toMatch(/trend|expanded response|tone variant|exportable|product updates/i)

    expect(plan).toContain('Private Trends is a free local feature')
    expect(plan).toContain('Free remote allowance is 3 analyses and 6 response drafts per rolling 30-day window; Pro allowance is 75 analyses and 150 response drafts per UTC calendar month.')
    expect(plan).toContain('Step 5: Implement free local-only trend aggregation')
    expect(taskSixStepFive).toMatch(/available to Free and Pro users/i)
    expect(taskSixStepFive).not.toMatch(/upgrade|entitlement|gate/i)

    expect(combined).not.toMatch(/entitlement month|rolling 30-day entitlement window/i)
    expect(combined).not.toMatch(/trend aggregation and Pro gate|upgrade\?source=trends/i)
  })
})
