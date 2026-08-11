import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEMO_RESULT,
  analyzeConversation,
  localAnalyze,
  parseConversation,
  prepareAnalysisReview,
} from './analyzeConversation'
import { readBoundedJson } from './fetchBoundedJson'

const baseOptions = {
  allowRemote: true,
  consentVersion: '2026-08-07.2',
  installationToken: 'installation-token-0001',
}

function reviewedOptions(text, overrides = {}) {
  return { ...baseOptions, ...overrides, reviewedSnapshot: prepareAnalysisReview(text) }
}

function remoteAnalysisFor(messages, possibleInterpretation = 'This may be a tentative interpretation.') {
  return {
    schemaVersion: 1,
    mode: 'ai',
    intensityScore: 12,
    conflictMode: 'Collaborating',
    messages: messages.map(({ sender, text: messageText }) => ({
      sender,
      text: messageText,
      pattern: 'Neutral',
      egoState: 'Adult',
      possibleInterpretation,
    })),
  }
}

function remoteAnalysisResponse(analysis, requestId = 'remote-result') {
  return Response.json({ analysis, requestId }, { headers: { 'x-request-id': requestId } })
}
const directProviderHost = ['api', 'groq', 'com'].join('.')
const clientKeyName = ['VITE', 'GROQ', 'API', 'KEY'].join('_')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('analyzeConversation', () => {
  it('keeps every deterministic and demo interpretation explicitly hedged and context-dependent', () => {
    const local = localAnalyze([
      'A: You always ignore me.',
      'B: Whatever, do what you want.',
      "C: That's not what I said.",
      "D: I'm done.",
      'E: Thanks for checking in.',
    ].join('\n'))
    expect(local).not.toBeNull()
    expect(new Set(local.messages.map((message) => message.gottman_flag))).toEqual(new Set([
      'Criticism', 'Contempt', 'Defensiveness', 'Stonewalling', 'Neutral',
    ]))

    for (const interpretation of [
      ...local.messages.map((message) => message.hidden_meaning),
      ...DEMO_RESULT.messages.map((message) => message.hidden_meaning),
    ]) {
      expect(interpretation).toMatch(/\b(?:may|might|could)\b/i)
      expect(interpretation).toMatch(/context can change/i)
      expect(interpretation).not.toMatch(/\bI (?:am|feel|care|need)\b/i)
    }
  })

  it('rejects conversations that would require labels beyond Person Z', () => {
    const input = Array.from({ length: 27 }, (_, index) => `Person${index}: Message ${index}`).join('\n')

    expect(parseConversation(input)).toEqual([])
  })

  it('normalizes Unicode names and redacts canonically equivalent mentions', () => {
    const parsed = parseConversation('Jose\u0301: José, please listen.\nBOB: Okay.\nbob: I will.')

    expect(parsed).toEqual([
      { sender: 'Person A', rawName: 'José', text: 'José, please listen.' },
      { sender: 'Person B', rawName: 'BOB', text: 'Okay.' },
      { sender: 'Person B', rawName: 'bob', text: 'I will.' },
    ])
  })

  it('uses the Worker remote-analysis bound of 280 Unicode code points', async () => {
    const boundedInput = `Alice: ${'🫠'.repeat(280)}`
    const oversizedInput = `Alice: ${'🫠'.repeat(281)}`
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    const fetch = vi.fn().mockResolvedValue(Response.json({
      analysis: {
        schemaVersion: 1,
        mode: 'ai',
        intensityScore: 1,
        conflictMode: 'Collaborating',
        messages: [{ sender: 'Person A', text: '🫠'.repeat(280), pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'Calm.' }],
      },
      requestId: 'unicode-request',
    }, { headers: { 'x-request-id': 'unicode-request' } }))
    vi.stubGlobal('fetch', fetch)

    await expect(analyzeConversation(boundedInput, reviewedOptions(boundedInput))).resolves.toMatchObject({ source: 'ai' })
    await expect(analyzeConversation(oversizedInput, reviewedOptions(oversizedInput))).resolves.toMatchObject({ source: 'local', fallbackReason: 'REMOTE_INPUT_LIMIT' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects an eleventh reviewed message before any remote request', async () => {
    const input = Array.from({ length: 11 }, (_, index) => `Alice: message ${index + 1}`).join('\n')
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await expect(analyzeConversation(input, reviewedOptions(input))).resolves.toMatchObject({
      source: 'local',
      fallbackReason: 'REMOTE_INPUT_LIMIT',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('accepts a remote result at exactly 10 messages, 280 Unicode code points of text, and 150 of interpretation', async () => {
    const input = Array.from({ length: 10 }, () => `Alice: ${'🧠'.repeat(280)}`).join('\n')
    const reviewed = prepareAnalysisReview(input).messages
    const exactResult = remoteAnalysisFor(reviewed, '🧠'.repeat(150))
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(remoteAnalysisResponse(exactResult, 'exact-remote-result')))

    await expect(analyzeConversation(input, reviewedOptions(input))).resolves.toMatchObject({
      source: 'ai',
      fallbackReason: null,
      result: { messages: expect.arrayContaining([expect.objectContaining({ hidden_meaning: '🧠'.repeat(150) })]) },
    })
  })

  it.each([
    ['an eleventh output message', (reviewed) => remoteAnalysisFor([...reviewed, reviewed[0]])],
    ['a 281-code-point output text', (reviewed) => remoteAnalysisFor([{ ...reviewed[0], text: '🧠'.repeat(281) }])],
    ['a 151-code-point interpretation', (reviewed) => remoteAnalysisFor(reviewed, '🧠'.repeat(151))],
    ['an extra result key', (reviewed) => ({ ...remoteAnalysisFor(reviewed), internalNote: 'must not cross the boundary' })],
    ['an extra message key', (reviewed) => ({
      ...remoteAnalysisFor(reviewed),
      messages: [{ ...remoteAnalysisFor(reviewed).messages[0], confidence: 0.9 }],
    })],
    ['a wrong field type', (reviewed) => ({ ...remoteAnalysisFor(reviewed), intensityScore: '12' })],
  ])('rejects remote analysis with %s instead of returning it to persistence', async (_case, makeInvalidResult) => {
    const input = _case === 'an eleventh output message'
      ? Array.from({ length: 10 }, (_, index) => `Alice: message ${index + 1}`).join('\n')
      : _case === 'a 281-code-point output text'
        ? `Alice: ${'🧠'.repeat(280)}`
        : 'Alice: Hello'
    const reviewed = prepareAnalysisReview(input).messages
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(remoteAnalysisResponse(makeInvalidResult(reviewed))))

    await expect(analyzeConversation(input, reviewedOptions(input))).resolves.toMatchObject({
      source: 'local',
      fallbackReason: 'REMOTE_UNAVAILABLE',
      result: { analysis_mode: 'local' },
    })
  })

  it.each([
    ['substitutes a sender', (reviewed) => remoteAnalysisFor([{ ...reviewed[0], sender: 'Person B' }, reviewed[1]])],
    ['substitutes text', (reviewed) => remoteAnalysisFor([{ ...reviewed[0], text: 'Different text' }, reviewed[1]])],
    ['reorders messages', (reviewed) => remoteAnalysisFor([reviewed[1], reviewed[0]])],
  ])('rejects a remote result that %s relative to the reviewed snapshot', async (_case, makeInvalidResult) => {
    const input = 'Alice: First message\nBob: Second message'
    const reviewed = prepareAnalysisReview(input).messages
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(remoteAnalysisResponse(makeInvalidResult(reviewed))))

    await expect(analyzeConversation(input, reviewedOptions(input))).resolves.toMatchObject({
      source: 'local',
      fallbackReason: 'REMOTE_UNAVAILABLE',
      result: { analysis_mode: 'local' },
    })
  })

  it('sends anonymized, participant-redacted messages to the analysis proxy without authorization', async () => {
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example/base')
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      analysis: {
        schemaVersion: 1,
        mode: 'ai',
        intensityScore: 42,
        conflictMode: 'Competing',
        messages: [
          { sender: 'Person A', text: '[Person], please listen.', pattern: 'Criticism', egoState: 'Parent', possibleInterpretation: 'Needs to be heard.' },
          { sender: 'Person B', text: 'Okay.', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'This may be agreement.' },
        ],
      },
      requestId: 'request-1',
    }), { status: 200, headers: { 'x-request-id': 'request-1' } }))
    vi.stubGlobal('fetch', fetch)

    const input = 'Alice: Bob, please listen.\nBob: Okay.'
    const output = await analyzeConversation(input, reviewedOptions(input))

    expect(fetch).toHaveBeenCalledWith('https://proxy.example/v1/analyses', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }))
    const request = JSON.parse(fetch.mock.calls[0][1].body)
    expect(request).toEqual({
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken: 'installation-token-0001',
      messages: [
        { sender: 'Person A', text: '[Person], please listen.' },
        { sender: 'Person B', text: 'Okay.' },
      ],
    })
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
    expect(output).toMatchObject({
      source: 'ai',
      fallbackReason: null,
      result: { overall_tension_score: 42, conflict_mode: 'Competing', analysis_mode: 'ai' },
    })
  })

  it('uses the local analyzer without fetching when remote use is declined', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    const output = await analyzeConversation('Alice: Please listen.', { allowRemote: false })

    expect(fetch).not.toHaveBeenCalled()
    expect(output).toMatchObject({ source: 'local', fallbackReason: 'NOT_CONFIGURED', result: { analysis_mode: 'local' } })
  })

  it('rejects a reviewed snapshot when required message text is missing instead of coercing it', async () => {
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const reviewedSnapshot = prepareAnalysisReview('Alice: Hello')
    delete reviewedSnapshot.messages[0].text

    await expect(analyzeConversation('Alice: Hello', { ...baseOptions, reviewedSnapshot }))
      .resolves.toMatchObject({ source: 'local', fallbackReason: 'NOT_CONFIGURED' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects public cleartext proxy URLs without fetching while allowing localhost development', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.stubEnv('VITE_AI_PROXY_URL', 'http://proxy.example')
    await expect(analyzeConversation('Alice: Hi', reviewedOptions('Alice: Hi'))).resolves.toMatchObject({ fallbackReason: 'NOT_CONFIGURED' })
    expect(fetch).not.toHaveBeenCalled()

    vi.stubEnv('VITE_AI_PROXY_URL', 'http://localhost:8787')
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ analysis: { schemaVersion: 1, mode: 'ai', intensityScore: 1, conflictMode: 'Collaborating', messages: [{ sender: 'Person A', text: 'Hi', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'Calm.' }] }, requestId: 'id' }), { status: 200, headers: { 'x-request-id': 'id' } }))
    await analyzeConversation('Alice: Hi', reviewedOptions('Alice: Hi'))
    expect(fetch).toHaveBeenCalledWith('http://localhost:8787/v1/analyses', expect.any(Object))
  })

  it('returns a remote-unavailable local result on a hung request but propagates caller cancellation', async () => {
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    await expect(analyzeConversation('Alice: Hi', reviewedOptions('Alice: Hi', { timeoutMs: 1 }))).resolves.toMatchObject({ source: 'local', fallbackReason: 'REMOTE_UNAVAILABLE', result: { analysis_mode: 'local' } })

    const controller = new AbortController()
    const pending = analyzeConversation('Alice: Hi', reviewedOptions('Alice: Hi', { signal: controller.signal, timeoutMs: 50 }))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('keeps the deadline through response-body consumption and caps upstream bytes', async () => {
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    const stalled = new ReadableStream({ start() { /* deliberately never closes */ } })
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(stalled, { status: 200 }))
      .mockResolvedValueOnce(new Response('x'.repeat(256 * 1024 + 1), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    await expect(analyzeConversation('Alice: Hi', reviewedOptions('Alice: Hi', { timeoutMs: 5 }))).resolves.toMatchObject({ fallbackReason: 'REMOTE_UNAVAILABLE' })
    await expect(analyzeConversation('Alice: Hi', reviewedOptions('Alice: Hi'))).resolves.toMatchObject({ fallbackReason: 'REMOTE_UNAVAILABLE' })
  })

  it('rejects oversized bodies without waiting for an uncooperative stream cancel', async () => {
    const never = new Promise(() => {})
    const settleWithin = (promise) => Promise.race([
      promise.then(
        value => ({ status: 'fulfilled', value }),
        error => ({ status: 'rejected', error }),
      ),
      new Promise(resolve => setTimeout(() => resolve({ status: 'timeout' }), 30)),
    ])
    const cancellation = new Promise(() => {})
    const declaredBody = new ReadableStream({ cancel: () => never })
    const streamedBody = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(2)) },
      cancel: () => never,
    })

    const declared = await settleWithin(readBoundedJson(
      new Response(declaredBody, { headers: { 'content-length': '2' } }),
      cancellation,
      1,
    ))
    const streamed = await settleWithin(readBoundedJson(new Response(streamedBody), cancellation, 1))

    expect(declared).toMatchObject({ status: 'rejected', error: expect.any(Error) })
    expect(streamed).toMatchObject({ status: 'rejected', error: expect.any(Error) })
  })

  it('contains no browser-provider endpoint or client key reference', async () => {
    const source = await readFile(new URL('./analyzeConversation.js', import.meta.url), 'utf8')
    expect(source).not.toContain(directProviderHost)
    expect(source).not.toContain(clientKeyName)
  })

  it('requires an exact nonempty matching request ID header', async () => {
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    const body = JSON.stringify({
      analysis: {
        schemaVersion: 1,
        mode: 'ai',
        intensityScore: 1,
        conflictMode: 'Collaborating',
        messages: [{ sender: 'Person A', text: 'Hello', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'Possibly calm.' }],
      },
      requestId: 'analysis-request-id',
    })
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(body, { status: 200 }))
      .mockResolvedValueOnce(new Response(body, { status: 200, headers: { 'x-request-id': '' } }))
      .mockResolvedValueOnce(new Response(body, { status: 200, headers: { 'x-request-id': 'different' } }))
      .mockResolvedValueOnce(new Response(body, { status: 200, headers: { 'x-request-id': 'analysis-request-id' } }))
    vi.stubGlobal('fetch', fetch)

    for (let index = 0; index < 3; index += 1) {
      await expect(analyzeConversation('Alex: Hello', reviewedOptions('Alex: Hello'))).resolves.toMatchObject({ source: 'local', fallbackReason: 'REMOTE_UNAVAILABLE' })
    }
    await expect(analyzeConversation('Alex: Hello', reviewedOptions('Alex: Hello'))).resolves.toMatchObject({ source: 'ai' })
  })
})
