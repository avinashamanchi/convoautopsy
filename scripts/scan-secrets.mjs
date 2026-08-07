import { execFileSync } from 'node:child_process'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const safeExampleNames = new Set(['.env.example', '.env.sample', '.dev.vars.example', '.dev.vars.sample'])
const sensitiveAssignmentNames = [
  ['GROQ', 'API', 'KEY'].join('_'),
  ['RATE', 'LIMIT', 'HMAC', 'SECRET'].join('_'),
  ['OPENAI', 'API', 'KEY'].join('_'),
]
const sensitiveAssignment = new RegExp(
  `(?:${sensitiveAssignmentNames.join('|')})["']?\\s*(?:=|:)\\s*["']?(?!\\$\\{\\{?|<|your-|test-|example|placeholder)[A-Za-z0-9_./+=-]{16,}`,
  'i',
)

function credentialAssignmentPattern(names) {
  return new RegExp(
    `(?:${names.join('|')})["']?\\s*(?:=|:)\\s*["']?(?!\\$\\{\\{?|<|your-|test-|example|placeholder)[A-Za-z0-9_./+=-]{16,}`,
    'i',
  )
}

const revenueCatSecretAssignment = credentialAssignmentPattern([
  ['REVENUECAT', 'SECRET', 'API', 'KEY'].join('_'),
  ['REVENUECAT', 'API', 'SECRET'].join('_'),
])
const cloudflareCredentialAssignment = credentialAssignmentPattern([
  ['CLOUDFLARE', 'API', 'TOKEN'].join('_'),
  ['CLOUDFLARE', 'API', 'KEY'].join('_'),
  ['CF', 'API', 'TOKEN'].join('_'),
  ['CF', 'API', 'KEY'].join('_'),
])
const expoCredentialAssignment = credentialAssignmentPattern([
  ['EXPO', 'TOKEN'].join('_'),
])
const appleCredentialAssignment = credentialAssignmentPattern([
  ['APPLE', 'APP', 'SPECIFIC', 'PASSWORD'].join('_'),
  ['APPLE', 'ID', 'PASSWORD'].join('_'),
])
const appStoreConnectCredentialAssignment = credentialAssignmentPattern([
  ['APP', 'STORE', 'CONNECT', 'API', 'KEY'].join('_'),
  ['ASC', 'API', 'KEY'].join('_'),
  ['ASC', 'PRIVATE', 'KEY'].join('_'),
])

const contentRules = [
  { rule: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { rule: 'provider-token', pattern: /\b(?:gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b/ },
  { rule: 'private-key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { rule: 'revenuecat-secret', pattern: revenueCatSecretAssignment },
  { rule: 'cloudflare-credential', pattern: cloudflareCredentialAssignment },
  { rule: 'expo-credential', pattern: expoCredentialAssignment },
  { rule: 'apple-credential', pattern: appleCredentialAssignment },
  { rule: 'app-store-connect-credential', pattern: appStoreConnectCredentialAssignment },
  { rule: 'secret-assignment', pattern: sensitiveAssignment },
  { rule: 'public-provider-secret-name', pattern: /(?:VITE|EXPO_PUBLIC)_(?:GROQ|OPENAI)_API_KEY/ },
]

export function scanEntries(entries) {
  const findings = []
  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    const basename = entry.path.split('/').at(-1)
    if (isSecretFilename(basename)) findings.push({ path: entry.path, rule: 'secret-file' })
    if (isSigningMaterialFilename(basename)) findings.push({ path: entry.path, rule: 'signing-material' })
    for (const { rule, pattern } of contentRules) {
      pattern.lastIndex = 0
      if (pattern.test(entry.content)) findings.push({ path: entry.path, rule })
    }
    if (isClientPath(entry.path) && /api\.groq\.com|Authorization\s*:\s*[`'"]Bearer\s+/i.test(entry.content)) {
      findings.push({ path: entry.path, rule: 'client-direct-provider' })
    }
  }
  return findings.sort((left, right) => left.path.localeCompare(right.path) || left.rule.localeCompare(right.rule))
}

function isSigningMaterialFilename(basename) {
  return typeof basename === 'string' && /\.(?:p8|p12|mobileprovision|provisionprofile)$/i.test(basename)
}

export function formatFindings(findings) {
  if (findings.length === 0) return 'Secret scan passed.'
  return `Secret scan failed. Candidate values are redacted.\n${findings.map(({ path, rule }) => `- ${path} [${rule}]`).join('\n')}`
}

function isSecretFilename(basename) {
  if (!basename || safeExampleNames.has(basename)) return false
  return basename === '.env' || basename.startsWith('.env.')
    || basename === '.dev.vars' || basename.startsWith('.dev.vars.')
}

function isClientPath(path) {
  return /^(?:src|mobile|ios|dist|mobile\/dist)\//.test(path)
}

async function collectFile(path) {
  const absolute = resolve(root, path)
  const metadata = await lstat(absolute)
  if (!metadata.isFile()) return null
  const buffer = await readFile(absolute)
  return { path: path.replaceAll('\\', '/'), content: buffer.toString('latin1') }
}

async function collectPath(path) {
  const absolute = resolve(root, path)
  let metadata
  try {
    metadata = await lstat(absolute)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  if (metadata.isSymbolicLink()) return []
  if (metadata.isFile()) {
    const entry = await collectFile(relative(root, absolute))
    return entry ? [entry] : []
  }
  if (!metadata.isDirectory()) return []
  const children = (await readdir(absolute)).sort()
  const nested = await Promise.all(children.map((child) => collectPath(relative(root, resolve(absolute, child)))))
  return nested.flat()
}

async function main() {
  const args = process.argv.slice(2)
  const entries = []
  if (args.includes('--tracked')) {
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
      .sort()
    for (const file of files) {
      const entry = await collectFile(file)
      if (entry) entries.push(entry)
    }
  }
  const pathsIndex = args.indexOf('--paths')
  if (pathsIndex >= 0) {
    for (const path of args.slice(pathsIndex + 1)) entries.push(...await collectPath(path))
  }
  if (!args.includes('--tracked') && pathsIndex < 0) {
    throw new Error('Usage: scan-secrets.mjs --tracked [--paths path ...]')
  }

  const unique = new Map(entries.map((entry) => [entry.path, entry]))
  const findings = scanEntries([...unique.values()])
  console.log(formatFindings(findings))
  if (findings.length > 0) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
