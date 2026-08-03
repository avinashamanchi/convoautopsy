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
    expect(output).toMatchObject({ source: 'local', fallbackReason: 'NOT_CONFIGURED' })
  })

  it('contains no browser-provider endpoint or client key reference', async () => {
    const source = await readFile(new URL('./analyzeConversation.js', import.meta.url), 'utf8')
    expect(source).not.toContain(directProviderHost)
    expect(source).not.toContain(clientKeyName)
  })
})
