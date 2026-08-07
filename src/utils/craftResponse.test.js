import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { craftResponse, prepareResponseReview } from './craftResponse'

const legacyResult = {
  overall_tension_score: 42,
  conflict_mode: 'Competing',
  messages: [{ sender: 'Person A', text: 'Alice needs a pause.', gottman_flag: 'Criticism', ego_state: 'Parent', hidden_meaning: 'Needs a break.' }],
}

const baseOptions = {
  allowRemote: true,
  consentVersion: '2026-08-07.2',
  installationToken: 'installation-token-0001',
}

function reviewedOptions(params, overrides = {}) {
  return { ...baseOptions, ...overrides, reviewedSnapshot: prepareResponseReview(params) }
}
const directProviderHost = ['api', 'groq', 'com'].join('.')
const clientKeyName = ['VITE', 'GROQ', 'API', 'KEY'].join('_')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('craftResponse', () => {
  it('sends a bounded anonymous analysis to the response proxy without authorization', async () => {
    const params = {
      sender: 'Person A', goal: 'resolve', tone: 'empathetic', result: legacyResult,
      conversationText: 'Alice: Alice needs a pause.\nBob: Okay.',
    }
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example/base')
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response: { id: 'draft-1', text: 'Could we pause?', hint: 'Creates space' },
      requestId: 'request-2',
    }), { status: 200, headers: { 'x-request-id': 'request-2' } }))
    vi.stubGlobal('fetch', fetch)

    const output = await craftResponse(params, reviewedOptions(params))

    expect(fetch).toHaveBeenCalledWith('https://proxy.example/v1/responses', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }))
    const request = JSON.parse(fetch.mock.calls[0][1].body)
    expect(request).toMatchObject({
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken: 'installation-token-0001',
      sender: 'Person A',
      goal: 'resolve',
      tone: 'empathetic',
      analysis: { schemaVersion: 1, mode: 'ai', messages: [{ text: '[Person] needs a pause.' }] },
    })
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
    expect(output).toEqual({
      drafts: [{ id: 'draft-1', text: 'Could we pause?', hint: 'Creates space' }],
      source: 'ai',
      fallbackReason: null,
    })
  })

  it('uses local templates without fetching when remote use is declined', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    const output = await craftResponse({ sender: 'Person A', goal: 'resolve', tone: 'empathetic', result: legacyResult }, { allowRemote: false })

    expect(fetch).not.toHaveBeenCalled()
    expect(output).toMatchObject({ source: 'local', fallbackReason: 'NOT_CONFIGURED' })
    expect(output.drafts).toHaveLength(3)
  })

  it('rejects a reviewed snapshot when required interpretation text is missing instead of coercing it', async () => {
    const params = {
      sender: 'Person A', goal: 'resolve', tone: 'empathetic', result: legacyResult,
      conversationText: 'Alice: Alice needs a pause.',
    }
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const reviewedSnapshot = prepareResponseReview(params)
    delete reviewedSnapshot.messages[0].possibleInterpretation

    await expect(craftResponse(params, { ...baseOptions, reviewedSnapshot }))
      .resolves.toMatchObject({ source: 'local', fallbackReason: 'NOT_CONFIGURED' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['an eleventh message', snapshot => ({ ...snapshot, messages: Array.from({ length: 11 }, () => snapshot.messages[0]) })],
    ['a 281-code-point message', snapshot => ({ ...snapshot, messages: [{ ...snapshot.messages[0], text: '🫠'.repeat(281) }] })],
    ['a 151-code-point interpretation', snapshot => ({ ...snapshot, messages: [{ ...snapshot.messages[0], possibleInterpretation: '🫠'.repeat(151) }] })],
  ])('rejects response drafting with %s before any remote request', async (_case, mutate) => {
    const params = {
      sender: 'Person A', goal: 'resolve', tone: 'empathetic', result: legacyResult,
      conversationText: 'Alice: Alice needs a pause.',
    }
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const reviewedSnapshot = mutate(prepareResponseReview(params))

    await expect(craftResponse(params, { ...baseOptions, reviewedSnapshot }))
      .resolves.toMatchObject({ source: 'local', fallbackReason: 'REMOTE_INPUT_LIMIT' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses local analysis mode and redacts every response free-text field and old sender', async () => {
    const params = {
      sender: 'Alice', goal: 'resolve', tone: 'empathetic', conversationText: 'Alice: Hello Bob\nBob: Okay',
      result: { ...legacyResult, analysis_mode: 'local', messages: [{ sender: 'Alice', text: 'Bob needs space', gottman_flag: 'Criticism', ego_state: 'Parent', hidden_meaning: 'Alice feels unheard by Bob.' }] },
    }
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: { id: 'd', text: 'Pause.', hint: 'Pause' }, requestId: 'id' }), { status: 200, headers: { 'x-request-id': 'id' } }))
    vi.stubGlobal('fetch', fetch)
    await craftResponse(params, reviewedOptions(params))
    const json = JSON.stringify(JSON.parse(fetch.mock.calls[0][1].body))
    expect(json).not.toContain('Alice')
    expect(json).not.toContain('Bob')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ sender: 'Person A', analysis: { mode: 'local', messages: [{ sender: 'Person A', possibleInterpretation: '[Person] feels unheard by [Person].' }] } })
  })

  it('remaps canonically equivalent legacy sender labels before proxy validation', async () => {
    const params = {
      sender: 'Jose\u0301',
      goal: 'resolve',
      tone: 'empathetic',
      conversationText: 'José: Please listen.\nBob: Okay.',
      result: {
        ...legacyResult,
        messages: [{ ...legacyResult.messages[0], sender: 'Jose\u0301' }],
      },
    }
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    const fetch = vi.fn().mockResolvedValue(Response.json({
      response: { id: 'd', text: 'Pause.', hint: 'Pause' }, requestId: 'id',
    }, { headers: { 'x-request-id': 'id' } }))
    vi.stubGlobal('fetch', fetch)

    const output = await craftResponse(params, reviewedOptions(params))

    expect(output.source).toBe('ai')
    const request = JSON.parse(fetch.mock.calls[0][1].body)
    expect(request).toMatchObject({
      sender: 'Person A',
      analysis: { messages: [{ sender: 'Person A' }] },
    })
  })

  it('rejects public cleartext endpoints and times out hung response requests', async () => {
    const params = { sender: 'Person A', goal: 'resolve', tone: 'empathetic', result: legacyResult }
    const fetch = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetch)
    vi.stubEnv('VITE_AI_PROXY_URL', 'http://proxy.example')
    await expect(craftResponse(params, reviewedOptions(params))).resolves.toMatchObject({ fallbackReason: 'NOT_CONFIGURED' })
    expect(fetch).not.toHaveBeenCalled()
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    await expect(craftResponse(params, reviewedOptions(params, { timeoutMs: 1 }))).resolves.toMatchObject({ fallbackReason: 'REMOTE_UNAVAILABLE' })
  })

  it('keeps the deadline through response-body consumption and rejects oversized bodies', async () => {
    const params = { sender: 'Person A', goal: 'resolve', tone: 'empathetic', result: legacyResult }
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    const stalled = new ReadableStream({ start() { /* deliberately never closes */ } })
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(stalled, { status: 200 }))
      .mockResolvedValueOnce(new Response('x'.repeat(256 * 1024 + 1), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    await expect(craftResponse(params, reviewedOptions(params, { timeoutMs: 5 }))).resolves.toMatchObject({ fallbackReason: 'REMOTE_UNAVAILABLE' })
    await expect(craftResponse(params, reviewedOptions(params))).resolves.toMatchObject({ fallbackReason: 'REMOTE_UNAVAILABLE' })
  })

  it('validates response draft limits by Unicode code point', async () => {
    const params = { sender: 'Person A', goal: 'resolve', tone: 'empathetic', result: legacyResult }
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    const envelope = (text) => Response.json(
      { response: { id: 'd', text, hint: 'Hint' }, requestId: 'id' },
      { headers: { 'x-request-id': 'id' } },
    )
    const fetch = vi.fn()
      .mockResolvedValueOnce(envelope('🫠'.repeat(1_000)))
      .mockResolvedValueOnce(envelope('🫠'.repeat(1_001)))
    vi.stubGlobal('fetch', fetch)

    await expect(craftResponse(params, reviewedOptions(params))).resolves.toMatchObject({ source: 'ai' })
    await expect(craftResponse(params, reviewedOptions(params))).resolves.toMatchObject({ source: 'local', fallbackReason: 'REMOTE_UNAVAILABLE' })
  })

  it('contains no browser-provider endpoint or client key reference', async () => {
    const source = await readFile(new URL('./craftResponse.js', import.meta.url), 'utf8')
    expect(source).not.toContain(directProviderHost)
    expect(source).not.toContain(clientKeyName)
  })

  it('requires an exact nonempty matching request ID header', async () => {
    const params = { sender: 'Person A', goal: 'resolve', tone: 'empathetic', result: legacyResult }
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    const body = JSON.stringify({ response: { id: 'd', text: 'Pause.', hint: 'Pause' }, requestId: 'draft-request-id' })
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(body, { status: 200 }))
      .mockResolvedValueOnce(new Response(body, { status: 200, headers: { 'x-request-id': '' } }))
      .mockResolvedValueOnce(new Response(body, { status: 200, headers: { 'x-request-id': 'different' } }))
      .mockResolvedValueOnce(new Response(body, { status: 200, headers: { 'x-request-id': 'draft-request-id' } }))
    vi.stubGlobal('fetch', fetch)

    for (let index = 0; index < 3; index += 1) {
      await expect(craftResponse(params, reviewedOptions(params))).resolves.toMatchObject({ source: 'local', fallbackReason: 'REMOTE_UNAVAILABLE' })
    }
    await expect(craftResponse(params, reviewedOptions(params))).resolves.toMatchObject({ source: 'ai' })
  })
})
