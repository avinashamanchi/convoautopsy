import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const fromRoot = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
const fromRootBytes = (path) => readFile(new URL(`../../${path}`, import.meta.url))

describe('publication gate', () => {
  it('runs every web, mobile, and Worker release gate before upload', async () => {
    const workflow = await fromRoot('.github/workflows/deploy.yml')
    const upload = workflow.indexOf('actions/upload-pages-artifact')
    for (const step of [
      '- name: Test web',
      '- name: Lint web',
      '- name: Build web',
      '- name: Test mobile',
      '- name: Typecheck mobile',
      '- name: Lint mobile',
      '- name: Export iOS bundle',
      '- name: Test Worker',
      '- name: Typecheck Worker',
      '- name: Lint Worker',
      '- name: Build Worker bundle',
      '- name: Scan tracked tree and built bundles for secrets',
    ]) {
      expect(workflow.indexOf(step)).toBeGreaterThan(-1)
      expect(workflow.indexOf(step)).toBeLessThan(upload)
    }
    expect(workflow).toMatch(/- name: Build Worker bundle\s+run: npm run build\s+working-directory: server\/ai-proxy/)

    const workerPackage = JSON.parse(await fromRoot('server/ai-proxy/package.json'))
    expect(workerPackage.scripts.build).toMatch(/wrangler deploy --dry-run --outdir dist/)
    const rootPackage = JSON.parse(await fromRoot('package.json'))
    expect(rootPackage.scripts['scan:secrets']).toContain('server/ai-proxy/dist')
  })

  it('ignores local secret files while retaining sanitized examples', async () => {
    const ignore = await fromRoot('.gitignore')
    expect(ignore).toContain('**/.env*')
    expect(ignore).toContain('!**/.env.example')
    expect(ignore).toContain('**/.dev.vars*')
    expect(ignore).toContain('!**/.dev.vars.example')
    expect(ignore).toContain('**/.wrangler/')
  })

  it('documents supported Node 22 workflows without starter reset instructions', async () => {
    const readme = await fromRoot('mobile/README.md')
    expect(readme).toContain('Node.js 22')
    expect(readme).toContain('Expo Go')
    expect(readme).toContain('development build')
    expect(readme).toContain('npm run export:ios')
    expect(readme).not.toContain('reset-project')
  })

  it('keeps release readiness manual-only and unable to deploy or submit', async () => {
    const workflow = await fromRoot('.github/workflows/release-readiness.yml')
    expect(workflow).toMatch(/on:\s*\n\s*workflow_dispatch:/)
    expect(workflow).not.toMatch(/\bpush:|pull_request:|deploy-pages|\beas(?:-cli)?\b[^\n]*submit|\bwrangler\b[^\n]*deploy(?! --dry-run)/i)
    for (const command of ['npm test', 'npm run lint', 'npm run build', 'npm run typecheck', 'npm run expo:doctor', 'npm run export:ios', 'npm run scan:secrets', 'npm audit --audit-level=high']) {
      expect(workflow).toContain(command)
    }
    expect(workflow).toContain('deployed=false')
    expect(workflow).toContain('submitted=false')
  })

  it('uses a 1024-square opaque RGB iOS icon', async () => {
    const icon = await fromRootBytes('mobile/assets/images/icon.png')
    expect(icon.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(icon.readUInt32BE(16)).toBe(1024)
    expect(icon.readUInt32BE(20)).toBe(1024)
    expect(icon[25]).toBe(2)
  })
})
