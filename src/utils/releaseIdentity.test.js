import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const fromRoot = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('single iOS release identity', () => {
  it('keeps repository metadata valid for checkout cleanup', () => {
    const result = spawnSync('git', ['submodule', 'foreach', '--recursive', 'true'], {
      cwd: root,
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('hard-disables every legacy Capacitor release command with one deterministic guard', async () => {
    const packageJson = JSON.parse(await fromRoot('package.json'))
    for (const script of ['ios', 'sync', 'build:app']) {
      expect(packageJson.scripts[script]).toBe('node scripts/require-expo-ios-release.mjs')
    }

    const result = spawnSync(process.execPath, ['scripts/require-expo-ios-release.mjs'], { cwd: root, encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toMatch(/Legacy Capacitor iOS release path is disabled/)
    expect(result.stderr).toMatch(/mobile\/.*Expo\/EAS/)
  })

  it('keeps the Expo bundle and Maestro app ID authoritative while labeling the old target historical', async () => {
    const [expoConfig, maestro, capacitor, readme] = await Promise.all([
      fromRoot('mobile/app.config.ts'),
      fromRoot('mobile/e2e/analyze-flow.yaml'),
      fromRoot('capacitor.config.ts'),
      fromRoot('README.md'),
    ])

    expect(expoConfig).toContain("bundleIdentifier: 'com.avinashamanchi.convoautopsy'")
    expect(maestro).toMatch(/^appId: com\.avinashamanchi\.convoautopsy$/m)
    expect(capacitor).toContain("appId: 'io.convoautopsy.app'")
    expect(readme).toMatch(/legacy Capacitor target.*historical/i)
    expect(readme).toMatch(/only supported iOS release target.*mobile\/.*Expo\/EAS/i)
  })
})
