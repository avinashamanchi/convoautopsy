const PROFILE_KEY = 'convoautopsy.web.profile.v1'
const REPORTS_KEY = 'convoautopsy.web.reports.v1'
const ONBOARDED_KEY = 'convoautopsy.web.onboarded.v1'
const RECOVERY_KEY = 'convoautopsy.web.legacy-recovery.v1'

const LEGACY_SESSION_KEY = ['ca', 'session'].join('_')
const LEGACY_REPORTS_KEY = ['ca', 'convos'].join('_')
const LEGACY_ONBOARDED_KEY = ['ca', 'onboarded'].join('_')
const LEGACY_CREDENTIALS_KEY = ['ca', 'users'].join('_')

const LOCAL_PROFILE = Object.freeze({ id: 'local', displayName: 'Local profile' })
const RECOVERY_KIND = 'convoautopsy-legacy-report-recovery'

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isJsonReport(value) {
  return isPlainObject(value)
}

function isReportList(value) {
  return Array.isArray(value) && value.every(isJsonReport)
}

function isReportBuckets(value) {
  return isPlainObject(value)
    && Object.entries(value).every(([profile, reports]) => profile.length > 0 && isReportList(reports))
}

function sameJson(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

function readRaw(key) {
  try {
    const raw = localStorage.getItem(key)
    return { ok: true, present: raw !== null, raw }
  } catch {
    return { ok: false, present: false, raw: null }
  }
}

function parseRaw(rawResult) {
  if (!rawResult.ok) return { ok: false, present: false, value: null }
  if (!rawResult.present) return { ok: true, present: false, value: null }
  try {
    return { ok: true, present: true, value: JSON.parse(rawResult.raw) }
  } catch {
    return { ok: false, present: true, value: null }
  }
}

function read(key, fallback) {
  const parsed = parseRaw(readRaw(key))
  return parsed.ok && parsed.present ? (parsed.value ?? fallback) : fallback
}

function writeVerified(key, value, validator) {
  let serialized
  try {
    serialized = JSON.stringify(value)
    if (typeof serialized !== 'string') return false
    localStorage.setItem(key, serialized)
    const readback = localStorage.getItem(key)
    if (readback !== serialized) return false
    const parsed = JSON.parse(readback)
    return validator(parsed) && sameJson(parsed, value)
  } catch {
    return false
  }
}

function readValidated(key, validator, fallback) {
  const parsed = parseRaw(readRaw(key))
  if (!parsed.ok) return { ok: false, present: parsed.present, value: fallback }
  if (!parsed.present) return { ok: true, present: false, value: fallback }
  return validator(parsed.value)
    ? { ok: true, present: true, value: parsed.value }
    : { ok: false, present: true, value: fallback }
}

function remove(key, verify = true) {
  try {
    localStorage.removeItem(key)
    return verify ? localStorage.getItem(key) === null : true
  } catch {
    return false
  }
}

function hasStorageKeyName(key) {
  try {
    return Object.keys(localStorage).includes(key)
  } catch {
    return null
  }
}

function isLocalProfile(value) {
  return isPlainObject(value) && value.id === LOCAL_PROFILE.id && value.displayName === LOCAL_PROFILE.displayName
}

function isLegacySession(value) {
  return value === null || (isPlainObject(value) && typeof value.username === 'string' && value.username.length > 0)
}

function isLegacyOnboarded(value) {
  return Array.isArray(value) && value.every(profile => typeof profile === 'string' && profile.length > 0)
}

function isIndexList(value, reportCount) {
  return Array.isArray(value)
    && new Set(value).size === value.length
    && value.every(index => Number.isInteger(index) && index >= 0 && index < reportCount)
}

function isRecoveryEnvelope(value) {
  if (!isPlainObject(value)
    || value.schemaVersion !== 1
    || value.kind !== RECOVERY_KIND
    || !(value.selectedProfile === null || (typeof value.selectedProfile === 'string' && value.selectedProfile.length > 0))
    || !isReportBuckets(value.reportBuckets)
    || !isLegacyOnboarded(value.onboardedProfiles)
    || !isPlainObject(value.migration)
    || !(value.migration.committed === undefined || typeof value.migration.committed === 'boolean')) return false

  const selectedReports = value.selectedProfile ? (value.reportBuckets[value.selectedProfile] ?? []) : []
  const migrated = value.migration.migratedReportIndexes
  const preserved = value.migration.preservedOnlyReportIndexes
  if (!isIndexList(migrated, selectedReports.length) || !isIndexList(preserved, selectedReports.length)) return false
  const partition = [...migrated, ...preserved].sort((left, right) => left - right)
  return partition.length === selectedReports.length
    && partition.every((index, position) => index === position)
}

function sourceState() {
  const session = parseRaw(readRaw(LEGACY_SESSION_KEY))
  const reports = parseRaw(readRaw(LEGACY_REPORTS_KEY))
  const onboarded = parseRaw(readRaw(LEGACY_ONBOARDED_KEY))
  const present = session.present || reports.present || onboarded.present
  if (!session.ok || !reports.ok || !onboarded.ok) return { ok: false, present }

  const sessionValue = session.present ? session.value : null
  const reportBuckets = reports.present ? reports.value : {}
  const onboardedProfiles = onboarded.present ? onboarded.value : []
  if (!isLegacySession(sessionValue) || !isReportBuckets(reportBuckets) || !isLegacyOnboarded(onboardedProfiles)) {
    return { ok: false, present }
  }
  return {
    ok: true,
    present,
    sessionPresent: session.present,
    reportsPresent: reports.present,
    onboardedPresent: onboarded.present,
    selectedProfile: sessionValue?.username ?? null,
    reportBuckets,
    onboardedProfiles,
  }
}

function hasIdCollision(reports, candidate) {
  if (!Object.prototype.hasOwnProperty.call(candidate, 'id')) return false
  return reports.some(report => Object.prototype.hasOwnProperty.call(report, 'id')
    && Object.is(report.id, candidate.id)
    && !sameJson(report, candidate))
}

function prepareRecovery(source, currentReports) {
  const selectedReports = source.selectedProfile ? (source.reportBuckets[source.selectedProfile] ?? []) : []
  const migratedReportIndexes = []
  const preservedOnlyReportIndexes = []
  const nextReports = [...currentReports]

  selectedReports.forEach((report, index) => {
    if (nextReports.some(existing => sameJson(existing, report))) {
      migratedReportIndexes.push(index)
      return
    }
    if (hasIdCollision(nextReports, report)) {
      preservedOnlyReportIndexes.push(index)
      return
    }
    nextReports.push(report)
    migratedReportIndexes.push(index)
  })

  return {
    envelope: {
      schemaVersion: 1,
      kind: RECOVERY_KIND,
      selectedProfile: source.selectedProfile,
      reportBuckets: source.reportBuckets,
      onboardedProfiles: source.onboardedProfiles,
      migration: { migratedReportIndexes, preservedOnlyReportIndexes, committed: false },
    },
    nextReports,
  }
}

function sourceMatchesEnvelope(source, envelope) {
  if (!source.ok) return false
  if (source.sessionPresent && source.selectedProfile !== envelope.selectedProfile) return false
  if (source.reportsPresent && !sameJson(source.reportBuckets, envelope.reportBuckets)) return false
  if (source.onboardedPresent && !sameJson(source.onboardedProfiles, envelope.onboardedProfiles)) return false
  return true
}

function migrationTargetsVerified(envelope, reports) {
  if (!isRecoveryEnvelope(envelope) || !isReportList(reports)) return false
  const selectedReports = envelope.selectedProfile ? (envelope.reportBuckets[envelope.selectedProfile] ?? []) : []
  return envelope.migration.migratedReportIndexes
    .every(index => reports.some(report => sameJson(report, selectedReports[index])))
}

function applyMigrationMarkers(envelope, currentReports) {
  const selectedReports = envelope.selectedProfile ? (envelope.reportBuckets[envelope.selectedProfile] ?? []) : []
  const nextReports = [...currentReports]
  for (const index of envelope.migration.migratedReportIndexes) {
    const report = selectedReports[index]
    if (nextReports.some(existing => sameJson(existing, report))) continue
    if (hasIdCollision(nextReports, report)) return { ok: false, reports: currentReports }
    nextReports.push(report)
  }
  return { ok: true, reports: nextReports }
}

function migrationCommitted(envelope) {
  return envelope?.migration?.committed === true
}

function committedEnvelope(envelope) {
  return {
    ...envelope,
    migration: { ...envelope.migration, committed: true },
  }
}

function ensureValue(key, existing, value, validator) {
  if (existing.present) return existing.ok && validator(existing.value)
  return writeVerified(key, value, validator)
}

export function initializeLocalProfile() {
  const profile = readValidated(PROFILE_KEY, isLocalProfile, null)
  const reports = readValidated(REPORTS_KEY, isReportList, [])
  const onboarded = readValidated(ONBOARDED_KEY, value => typeof value === 'boolean', false)
  const source = sourceState()
  const recovery = readValidated(RECOVERY_KEY, isRecoveryEnvelope, null)

  const profileReady = ensureValue(PROFILE_KEY, profile, LOCAL_PROFILE, isLocalProfile)
  if (!profileReady || !reports.ok || !onboarded.ok || !source.ok || !recovery.ok) return { ...LOCAL_PROFILE }

  let envelope = recovery.value
  let nextReports = reports.value
  if (source.present) {
    if (envelope) {
      if (!sourceMatchesEnvelope(source, envelope)) return { ...LOCAL_PROFILE }
      if (!migrationCommitted(envelope)) {
        const applied = applyMigrationMarkers(envelope, reports.value)
        if (!applied.ok) return { ...LOCAL_PROFILE }
        nextReports = applied.reports
      }
    } else {
      const prepared = prepareRecovery(source, reports.value)
      envelope = prepared.envelope
      nextReports = prepared.nextReports
      if (!writeVerified(RECOVERY_KEY, envelope, isRecoveryEnvelope)) return { ...LOCAL_PROFILE }
    }
  }

  const reportsReady = reports.present && sameJson(nextReports, reports.value)
    ? true
    : writeVerified(REPORTS_KEY, nextReports, isReportList)
  if (!reportsReady) return { ...LOCAL_PROFILE }

  const selectedOnboarded = Boolean(envelope?.selectedProfile
    && envelope.onboardedProfiles.includes(envelope.selectedProfile))
  const onboardedReady = ensureValue(ONBOARDED_KEY, onboarded, selectedOnboarded, value => typeof value === 'boolean')
  const verifiedReports = readValidated(REPORTS_KEY, isReportList, [])
  const recoveryReady = !envelope || readValidated(RECOVERY_KEY, isRecoveryEnvelope, null)
  if (!onboardedReady || !verifiedReports.ok || !verifiedReports.present
    || (envelope && (!recoveryReady.ok || !recoveryReady.present
      || (!migrationCommitted(envelope) && !migrationTargetsVerified(envelope, verifiedReports.value))))) {
    return { ...LOCAL_PROFILE }
  }


  if (envelope && !migrationCommitted(envelope)) {
    const committed = committedEnvelope(envelope)
    if (!writeVerified(RECOVERY_KEY, committed, isRecoveryEnvelope)) return { ...LOCAL_PROFILE }
    envelope = committed
  }

  if (source.present || envelope) {
    // The retired credential key is never read or copied. It is removed only after
    // every report has an exact, schema-valid recovery or migration marker.
    remove(LEGACY_CREDENTIALS_KEY, false)
    remove(LEGACY_SESSION_KEY)
    remove(LEGACY_REPORTS_KEY)
    remove(LEGACY_ONBOARDED_KEY)
  } else {
    remove(LEGACY_CREDENTIALS_KEY, false)
  }
  return { ...LOCAL_PROFILE }
}

export function getConversations() {
  const reports = readValidated(REPORTS_KEY, isReportList, [])
  return reports.ok && reports.present ? reports.value : []
}

export function saveConversation(conversationOrLegacyProfile, maybeConversation) {
  const conversation = maybeConversation ?? conversationOrLegacyProfile
  const current = readValidated(REPORTS_KEY, isReportList, [])
  if (!isJsonReport(conversation) || !current.ok) {
    return { ok: false, error: 'PERSISTENCE_FAILED', conversation, reports: current.value }
  }
  if (current.value.some(existing => sameJson(existing, conversation))) {
    return { ok: true, conversation, reports: current.value }
  }
  if (hasIdCollision(current.value, conversation)) {
    return { ok: false, error: 'PERSISTENCE_FAILED', conversation, reports: current.value }
  }
  const reports = [conversation, ...current.value]
  if (!writeVerified(REPORTS_KEY, reports, isReportList)) {
    return { ok: false, error: 'PERSISTENCE_FAILED', conversation, reports: current.value }
  }
  return { ok: true, conversation, reports }
}

export function deleteConversation(idOrLegacyProfile, maybeId) {
  const id = maybeId ?? idOrLegacyProfile
  const current = readValidated(REPORTS_KEY, isReportList, [])
  if (!current.ok || !current.present) return false
  const reports = current.value.filter(conversation => conversation.id !== id)
  if (reports.length === current.value.length) return true
  return writeVerified(REPORTS_KEY, reports, isReportList)
}

export function hasOnboarded() {
  return read(ONBOARDED_KEY, false) === true
}

export function markOnboarded() {
  return writeVerified(ONBOARDED_KEY, true, value => value === true)
}

export function clearSession() {
  return remove(LEGACY_SESSION_KEY)
}

export function getLegacyRecoveryStatus() {
  const recovery = readValidated(RECOVERY_KEY, isRecoveryEnvelope, null)
  if (!recovery.ok) {
    return { available: false, needsAttention: true, bucketCount: 0, reportCount: 0, selectedReportCount: 0, preservedOnlyCount: 0 }
  }
  if (!recovery.present) {
    const source = sourceState()
    const credentialsPresent = hasStorageKeyName(LEGACY_CREDENTIALS_KEY)
    return !source.ok || source.present || credentialsPresent !== false
      ? { available: false, needsAttention: true, bucketCount: 0, reportCount: 0, selectedReportCount: 0, preservedOnlyCount: 0 }
      : null
  }
  const envelope = recovery.value
  const source = sourceState()
  const credentialsPresent = hasStorageKeyName(LEGACY_CREDENTIALS_KEY)
  const reportCount = Object.values(envelope.reportBuckets).reduce((total, reports) => total + reports.length, 0)
  const selectedReportCount = envelope.selectedProfile ? (envelope.reportBuckets[envelope.selectedProfile]?.length ?? 0) : 0
  return {
    available: reportCount > 0,
    needsAttention: !source.ok || source.present || credentialsPresent !== false || !migrationCommitted(envelope),
    bucketCount: Object.keys(envelope.reportBuckets).length,
    reportCount,
    selectedReportCount,
    preservedOnlyCount: reportCount - envelope.migration.migratedReportIndexes.length,
  }
}

export function getLegacyRecoveryExport() {
  const recovery = readValidated(RECOVERY_KEY, isRecoveryEnvelope, null)
  if (!recovery.ok || !recovery.present) return { ok: false, error: 'RECOVERY_UNAVAILABLE' }
  return {
    ok: true,
    fileName: 'convoautopsy-legacy-recovery-v1.json',
    json: `${JSON.stringify(recovery.value, null, 2)}\n`,
  }
}

function isAppOwnedKey(key) {
  return key.startsWith('convoautopsy.') || [
    LEGACY_CREDENTIALS_KEY,
    LEGACY_SESSION_KEY,
    LEGACY_REPORTS_KEY,
    LEGACY_ONBOARDED_KEY,
  ].includes(key)
}

export async function deleteAllWebData() {
  let keys = []
  try {
    keys = Object.keys(localStorage).filter(isAppOwnedKey)
  } catch {
    return { ok: false, failed: ['browser storage'] }
  }

  const failed = []
  for (const key of keys) {
    if (key === LEGACY_CREDENTIALS_KEY) {
      const removalAttempted = remove(key, false)
      const remains = hasStorageKeyName(key)
      if (!removalAttempted || remains !== false) failed.push(key)
    } else if (!remove(key)) {
      failed.push(key)
    }
  }

  try {
    for (const key of Object.keys(localStorage).filter(isAppOwnedKey)) {
      if (!failed.includes(key)) failed.push(key)
    }
  } catch {
    if (!failed.includes('browser storage')) failed.push('browser storage')
  }
  return { ok: failed.length === 0, failed }
}
