import { describe, expect, it } from 'vitest'
import { formatFindings, scanEntries } from '../../scripts/scan-secrets.mjs'

describe('redacted secret scanner', () => {
  it('reports rule IDs and paths without returning candidate values', () => {
    const candidate = ['ghp', 'A'.repeat(36)].join('_')
    const findings = scanEntries([{ path: 'fixture.txt', content: `token=${candidate}` }])
    const output = formatFindings(findings)

    expect(findings).toEqual([{ path: 'fixture.txt', rule: 'github-token' }])
    expect(output).toContain('fixture.txt [github-token]')
    expect(output).not.toContain(candidate)
  })

  it('rejects secret filenames and direct-provider code in client bundles', () => {
    expect(scanEntries([
      { path: 'mobile/.dev.vars', content: 'placeholder' },
      { path: 'dist/assets/app.js', content: ['https://api', 'groq', 'com'].join('.') },
    ])).toEqual([
      { path: 'dist/assets/app.js', rule: 'client-direct-provider' },
      { path: 'mobile/.dev.vars', rule: 'secret-file' },
    ])
  })

  it('allows sanitized examples and the server-side provider boundary', () => {
    expect(scanEntries([
      { path: '.env.example', content: 'VITE_AI_PROXY_URL=https://proxy.example' },
      { path: 'server/ai-proxy/src/provider.ts', content: ['https://api', 'groq', 'com'].join('.') },
    ])).toEqual([])
  })

  it('detects JSON and YAML secret assignments without echoing values', () => {
    const candidate = ['sensitive', 'A'.repeat(24)].join('-')
    const findings = scanEntries([
      { path: 'config.json', content: `{"RATE_LIMIT_HMAC_SECRET": "${candidate}"}` },
      { path: 'config.yml', content: `GROQ_API_KEY: ${candidate}` },
      { path: 'workflow.yml', content: 'RATE_LIMIT_HMAC_SECRET: ${{ secrets.RATE_LIMIT_HMAC_SECRET }}' },
    ])
    const output = formatFindings(findings)

    expect(findings).toEqual([
      { path: 'config.json', rule: 'secret-assignment' },
      { path: 'config.yml', rule: 'secret-assignment' },
    ])
    expect(output).not.toContain(candidate)
  })
})
