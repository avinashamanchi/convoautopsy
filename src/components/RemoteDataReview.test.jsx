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
    messages: [{ sender: 'Person A', text: 'Email sam@example.com', possibleInterpretation: 'Alex may want a reply.' }],
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

it('shows participant mapping, residual identifiers, and every outbound free-text field as editable', () => {
  renderReview()

  expect(container.textContent).toContain('Review exact text sent for AI')
  expect(container.textContent).toContain('Alex → Person A')
  expect(container.textContent).toMatch(/pseudonymous.*not anonymous/i)
  expect(container.querySelector('[aria-label="Outgoing text for Person A message 1"]').value).toBe('Email sam@example.com')
  expect(container.querySelector('[aria-label="Outgoing possible interpretation for Person A message 1"]').value).toBe('Alex may want a reply.')
})

it('confirms one immutable snapshot and ignores later source or DOM mutation', () => {
  const onConfirm = vi.fn()
  const { snapshot } = renderReview({ onConfirm })
  const text = container.querySelector('[aria-label="Outgoing text for Person A message 1"]')
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(text, 'Edited exact outbound text')
    text.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const confirm = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Confirm exact data')
  act(() => { confirm.click(); confirm.click() })

  expect(onConfirm).toHaveBeenCalledTimes(1)
  const confirmed = onConfirm.mock.calls[0][0]
  expect(confirmed.messages[0].text).toBe('Edited exact outbound text')
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
