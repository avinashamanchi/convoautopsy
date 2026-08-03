import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeConversation, parseConversation } from './analyzeConversation'

const options = {
  allowRemote: true,
  consentVersion: '2026-08-02',
  installationToken: 'installation-token-0001',
}
const directProviderHost = ['api', 'groq', 'com'].join('.')
const clientKeyName = ['VITE', 'GROQ', 'API', 'KEY'].join('_')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('analyzeConversation', () => {
  it('keeps every anonymized participant label within the proxy contract bound', () => {
    const input = Array.from({ length: 27 }, (_, index) => `Person${index}: Message ${index}`).join('\n')

    expect(parseConversation(input).at(-1).sender).toBe('Person AA')
  })

  it('sends anonymized, participant-redacted messages to the analysis proxy without authorization', async () => {
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example/base')
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      analysis: {
        schemaVersion: 1,
        mode: 'ai',
        intensityScore: 42,
        conflictMode: 'Competing',
        messages: [{ sender: 'Person A', text: '[Person], please listen.', pattern: 'Criticism', egoState: 'Parent', possibleInterpretation: 'Needs to be heard.' }],
      },
      requestId: 'request-1',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    const output = await analyzeConversation('Alice: Bob, please listen.\nBob: Okay.', options)

    expect(fetch).toHaveBeenCalledWith('https://proxy.example/v1/analyses', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }))
    const request = JSON.parse(fetch.mock.calls[0][1].body)
    expect(request).toEqual({
      schemaVersion: 1,
      consentVersion: '2026-08-02',
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

  it('rejects public cleartext proxy URLs without fetching while allowing localhost development', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.stubEnv('VITE_AI_PROXY_URL', 'http://proxy.example')
    await expect(analyzeConversation('Alice: Hi', options)).resolves.toMatchObject({ fallbackReason: 'NOT_CONFIGURED' })
    expect(fetch).not.toHaveBeenCalled()

    vi.stubEnv('VITE_AI_PROXY_URL', 'http://localhost:8787')
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ analysis: { schemaVersion: 1, mode: 'ai', intensityScore: 1, conflictMode: 'Collaborating', messages: [{ sender: 'Person A', text: 'Hi', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'Calm.' }] }, requestId: 'id' }), { status: 200 }))
    await analyzeConversation('Alice: Hi', options)
    expect(fetch).toHaveBeenCalledWith('http://localhost:8787/v1/analyses', expect.any(Object))
  })

  it('returns a remote-unavailable local result on a hung request but propagates caller cancellation', async () => {
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    await expect(analyzeConversation('Alice: Hi', { ...options, timeoutMs: 1 })).resolves.toMatchObject({ source: 'local', fallbackReason: 'REMOTE_UNAVAILABLE', result: { analysis_mode: 'local' } })

    const controller = new AbortController()
    const pending = analyzeConversation('Alice: Hi', { ...options, signal: controller.signal, timeoutMs: 50 })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('contains no browser-provider endpoint or client key reference', async () => {
    const source = await readFile(new URL('./analyzeConversation.js', import.meta.url), 'utf8')
    expect(source).not.toContain(directProviderHost)
    expect(source).not.toContain(clientKeyName)
  })
})
