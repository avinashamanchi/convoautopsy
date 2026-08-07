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

  it('detects RevenueCat, Cloudflare, Expo, Apple, and App Store Connect credential assignments', () => {
    const candidate = ['live', 'A'.repeat(28)].join('_')
    const names = [
      ['REVENUECAT', 'SECRET', 'API', 'KEY'].join('_'),
      ['CLOUDFLARE', 'API', 'TOKEN'].join('_'),
      ['CF', 'API', 'TOKEN'].join('_'),
      ['EXPO', 'TOKEN'].join('_'),
      ['APPLE', 'APP', 'SPECIFIC', 'PASSWORD'].join('_'),
      ['APP', 'STORE', 'CONNECT', 'API', 'KEY'].join('_'),
    ]
    const entries = names.map((name, index) => ({ path: `config-${index}.env`, content: `${name}=${candidate}${index}` }))
    const findings = scanEntries(entries)
    const output = formatFindings(findings)

    expect(findings).toEqual([
      { path: 'config-0.env', rule: 'revenuecat-secret' },
      { path: 'config-1.env', rule: 'cloudflare-credential' },
      { path: 'config-2.env', rule: 'cloudflare-credential' },
      { path: 'config-3.env', rule: 'expo-credential' },
      { path: 'config-4.env', rule: 'apple-credential' },
      { path: 'config-5.env', rule: 'app-store-connect-credential' },
    ])
    for (const entry of entries) expect(output).not.toContain(entry.content.split('=')[1])
  })

  it('rejects signing material and provisioning artifacts by filename', () => {
    expect(scanEntries([
      { path: 'signing/AuthKey_ABC123.p8', content: 'binary' },
      { path: 'signing/distribution.p12', content: 'binary' },
      { path: 'signing/AppStore.mobileprovision', content: 'binary' },
      { path: 'signing/AppStore.provisionprofile', content: 'binary' },
    ])).toEqual([
      { path: 'signing/AppStore.mobileprovision', rule: 'signing-material' },
      { path: 'signing/AppStore.provisionprofile', rule: 'signing-material' },
      { path: 'signing/AuthKey_ABC123.p8', rule: 'signing-material' },
      { path: 'signing/distribution.p12', rule: 'signing-material' },
    ])
  })

  it('allows the public RevenueCat Apple SDK variable and sanitized examples', () => {
    expect(scanEntries([
      { path: 'mobile/app.ts', content: 'process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY' },
      { path: 'mobile/.env.example', content: 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_example_public_sdk_key\nEXPO_PUBLIC_AI_PROXY_URL=https://your-worker.example' },
    ])).toEqual([])
  })
})
