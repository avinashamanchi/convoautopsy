/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import RemoteDataReview from './RemoteDataReview'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root
let container

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

function renderReview(props = {}) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const snapshot = {
    participants: [{ sourceLabel: 'Alex', outboundLabel: 'Person A' }],
    sender: 'Person A',
    goal: 'resolve',
    tone: 'empathetic',
    analysis: {
      schemaVersion: 1,
      mode: 'ai',
      intensityScore: 42,
      conflictMode: 'Collaborating',
    },
    messages: [{
      sender: 'Person A',
      text: 'Email sam@example.com',
      pattern: 'Criticism',
      egoState: 'Parent',
      possibleInterpretation: 'Alex may want a reply.',
    }],
    installationToken: 'RAW_INSTALLATION_TOKEN_MUST_NOT_RENDER',
  }
  act(() => root.render(
    <RemoteDataReview
      isConfirming={false}
      onCancel={() => {}}
      onConfirm={() => {}}
      snapshot={snapshot}
      {...props}
    />,
  ))
  return { snapshot }
}

it('shows every drafting decision and structured analysis field while only free text is editable', () => {
  renderReview()

  expect(container.textContent).toContain('Review exact text sent for AI')
  expect(container.textContent).toContain('Alex → Person A')
  expect(container.textContent).toMatch(/pseudonymous.*not anonymous/i)
  expect(container.textContent).toMatch(/responding as\s*Person A/i)
  expect(container.textContent).toMatch(/goal\s*resolve/i)
  expect(container.textContent).toMatch(/tone\s*empathetic/i)
  expect(container.textContent).toMatch(/analysis mode\s*ai/i)
  expect(container.textContent).toMatch(/intensity score\s*42/i)
  expect(container.textContent).toMatch(/conflict mode\s*Collaborating/i)
  expect(container.textContent).toMatch(/pattern\s*Criticism/i)
  expect(container.textContent).toMatch(/ego state\s*Parent/i)
  expect(container.textContent).toMatch(/schema version.*consent version.*installation token/is)
  expect(container.textContent).toMatch(/identifier values.*not displayed/i)
  expect(container.textContent).toMatch(/on-device participant mappings.*not sent/i)
  expect(container.textContent).toMatch(/server schema version.*not forwarded to Groq.*analysis mode.*not forwarded to Groq/is)
  expect(container.textContent).not.toContain('RAW_INSTALLATION_TOKEN_MUST_NOT_RENDER')
  expect(container.querySelector('[aria-label="Outgoing text for Person A message 1"]').value).toBe('Email sam@example.com')
  expect(container.querySelector('[aria-label="Outgoing possible interpretation for Person A message 1"]').value).toBe('Alex may want a reply.')
  expect(container.querySelectorAll('.remote-review-messages textarea')).toHaveLength(2)
})

it('confirms one immutable snapshot and ignores later source or DOM mutation', () => {
  const onConfirm = vi.fn()
  const { snapshot } = renderReview({ onConfirm })
  const text = container.querySelector('[aria-label="Outgoing text for Person A message 1"]')
  const interpretation = container.querySelector('[aria-label="Outgoing possible interpretation for Person A message 1"]')
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(text, 'Edited exact outbound text')
    text.dispatchEvent(new Event('input', { bubbles: true }))
    setter.call(interpretation, 'Edited possible interpretation')
    interpretation.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const confirm = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Confirm exact data')
  act(() => { confirm.click(); confirm.click() })

  expect(onConfirm).toHaveBeenCalledTimes(1)
  const confirmed = onConfirm.mock.calls[0][0]
  expect(confirmed.messages[0].text).toBe('Edited exact outbound text')
  expect(confirmed.messages[0].possibleInterpretation).toBe('Edited possible interpretation')
  expect(confirmed.analysis).toEqual({ schemaVersion: 1, mode: 'ai', intensityScore: 42, conflictMode: 'Collaborating' })
  expect(Object.isFrozen(confirmed)).toBe(true)
  expect(Object.isFrozen(confirmed.messages[0])).toBe(true)
  snapshot.messages[0].text = 'Mutated source'
  text.value = 'Mutated DOM'
  expect(confirmed.messages[0].text).toBe('Edited exact outbound text')
})

it('provides an accessible cancel action and disables edits while confirming', () => {
  const onCancel = vi.fn()
  renderReview({ isConfirming: true, onCancel })

  expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  expect(container.querySelector('[aria-label="Outgoing text for Person A message 1"]').disabled).toBe(true)
  const cancel = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Cancel remote request')
  act(() => cancel.click())
  expect(onCancel).toHaveBeenCalledTimes(1)
})

it('moves focus into the modal, traps Tab, cancels with Escape, and restores prior focus', () => {
  const trigger = document.createElement('button')
  trigger.textContent = 'Open exact review'
  document.body.append(trigger)
  trigger.focus()
  const onCancel = vi.fn()

  renderReview({ onCancel })

  const dialog = container.querySelector('[role="dialog"]')
  const heading = dialog.querySelector('h2')
  const firstTextarea = dialog.querySelector('textarea')
  const cancel = [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Cancel remote request')
  expect(document.activeElement).toBe(heading)

  act(() => heading.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', shiftKey: true })))
  expect(document.activeElement).toBe(cancel)
  act(() => cancel.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' })))
  expect(document.activeElement).toBe(firstTextarea)
  act(() => firstTextarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })))
  expect(onCancel).toHaveBeenCalledTimes(1)

  act(() => root.unmount())
  root = undefined
  expect(document.activeElement).toBe(trigger)
  trigger.remove()
})

it.each([
  ['more than 10 messages', Array.from({ length: 11 }, (_, index) => ({ sender: 'Person A', text: `Message ${index}` })), /up to 10 messages/i],
  ['a 281-code-point message', [{ sender: 'Person A', text: '🫠'.repeat(281) }], /message text must be 280 characters or fewer/i],
  ['an empty message', [{ sender: 'Person A', text: '   ' }], /message text cannot be empty/i],
  ['a 151-code-point interpretation', [{ sender: 'Person A', text: 'Hello', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: '🫠'.repeat(151) }], /possible interpretation must be 150 characters or fewer/i],
  ['an empty interpretation', [{ sender: 'Person A', text: 'Hello', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: ' ' }], /possible interpretation cannot be empty/i],
])('blocks confirmation for %s', (_case, messages, errorPattern) => {
  const onConfirm = vi.fn()
  renderReview({
    onConfirm,
    snapshot: { participants: [], messages },
  })

  const confirm = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Confirm exact data')
  expect(confirm.disabled).toBe(true)
  expect(container.querySelector('[role="alert"]')?.textContent).toMatch(errorPattern)
  act(() => confirm.click())
  expect(onConfirm).not.toHaveBeenCalled()
})

it('disables confirmation when an edit crosses a remote boundary and re-enables it after correction', () => {
  renderReview()
  const text = container.querySelector('[aria-label="Outgoing text for Person A message 1"]')
  const confirm = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Confirm exact data')
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set

  act(() => {
    setter.call(text, '🫠'.repeat(281))
    text.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(confirm.disabled).toBe(true)
  expect(container.textContent).toMatch(/message text must be 280 characters or fewer/i)

  act(() => {
    setter.call(text, 'Corrected')
    text.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(confirm.disabled).toBe(false)
})
