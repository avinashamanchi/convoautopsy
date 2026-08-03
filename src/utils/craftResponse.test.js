import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { craftResponse } from './craftResponse'

const legacyResult = {
  overall_tension_score: 42,
  conflict_mode: 'Competing',
  messages: [{ sender: 'Person A', text: 'Alice needs a pause.', gottman_flag: 'Criticism', ego_state: 'Parent', hidden_meaning: 'Needs a break.' }],
}

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

describe('craftResponse', () => {
  it('sends a bounded anonymous analysis to the response proxy without authorization', async () => {
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example/base')
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response: { id: 'draft-1', text: 'Could we pause?', hint: 'Creates space' },
      requestId: 'request-2',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    const output = await craftResponse({
      sender: 'Person A', goal: 'resolve', tone: 'empathetic', result: legacyResult,
      conversationText: 'Alice: Alice needs a pause.\nBob: Okay.',
    }, options)

    expect(fetch).toHaveBeenCalledWith('https://proxy.example/v1/responses', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }))
    const request = JSON.parse(fetch.mock.calls[0][1].body)
    expect(request).toMatchObject({
      schemaVersion: 1,
      consentVersion: '2026-08-02',
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

  it('uses local analysis mode and redacts every response free-text field and old sender', async () => {
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: { id: 'd', text: 'Pause.', hint: 'Pause' }, requestId: 'id' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await craftResponse({
      sender: 'Alice', goal: 'resolve', tone: 'empathetic', conversationText: 'Alice: Hello Bob\nBob: Okay',
      result: { ...legacyResult, analysis_mode: 'local', messages: [{ sender: 'Alice', text: 'Bob needs space', gottman_flag: 'Criticism', ego_state: 'Parent', hidden_meaning: 'Alice feels unheard by Bob.' }] },
    }, options)
    const json = JSON.stringify(JSON.parse(fetch.mock.calls[0][1].body))
    expect(json).not.toContain('Alice')
    expect(json).not.toContain('Bob')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ sender: 'Person A', analysis: { mode: 'local', messages: [{ sender: 'Person A', possibleInterpretation: '[Person] feels unheard by [Person].' }] } })
  })

  it('rejects public cleartext endpoints and times out hung response requests', async () => {
    const fetch = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetch)
    vi.stubEnv('VITE_AI_PROXY_URL', 'http://proxy.example')
    await expect(craftResponse({ sender: 'Person A', goal: 'resolve', tone: 'empathetic', result: legacyResult }, options)).resolves.toMatchObject({ fallbackReason: 'NOT_CONFIGURED' })
    expect(fetch).not.toHaveBeenCalled()
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    await expect(craftResponse({ sender: 'Person A', goal: 'resolve', tone: 'empathetic', result: legacyResult }, { ...options, timeoutMs: 1 })).resolves.toMatchObject({ fallbackReason: 'REMOTE_UNAVAILABLE' })
  })

  it('contains no browser-provider endpoint or client key reference', async () => {
    const source = await readFile(new URL('./craftResponse.js', import.meta.url), 'utf8')
    expect(source).not.toContain(directProviderHost)
    expect(source).not.toContain(clientKeyName)
  })
})
