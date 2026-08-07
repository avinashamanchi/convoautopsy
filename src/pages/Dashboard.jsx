import { useState, useEffect, useRef } from 'react'
import {
  getConversations, saveConversation, deleteConversation,
  clearSession, deleteAllWebData, getLegacyRecoveryExport,
  getLegacyRecoveryStatus, hasOnboarded
} from '../utils/storage'
import { analyzeConversation, DEMO_TEXT, DEMO_RESULT, exceedsRemoteAnalysisLimits, prepareAnalysisReview } from '../utils/analyzeConversation'
import AnalysisResult from '../components/AnalysisResult'
import Onboarding from '../components/Onboarding'
import ResponseCrafter from '../components/ResponseCrafter'
import AiConsentModal from '../components/AiConsentModal'
import RemoteDataReview from '../components/RemoteDataReview'
import { getAiConsent, grantAiConsent } from '../utils/aiConsent'
import { analysisSourceMessage } from '../utils/analysisSourceMessage'
import { MAX_INPUT_CHARACTERS, countCodePoints } from '../utils/textLimits'

function formatDate(ts) {
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function generateTitle(text) {
  const firstMsg = text.split('\n').find(l => {
    const m = l.match(/^[^:\n-]{1,40}[:-]\s*(.+)$/)
    return m && m[1].trim().length > 0
  })
  if (!firstMsg) return 'Untitled Analysis'
  const m = firstMsg.match(/^[^:\n-]{1,40}[:-]\s*(.+)$/)
  const txt = m ? m[1].trim() : firstMsg.trim()
  return txt.length > 36 ? txt.slice(0, 36) + '…' : txt
}

function downloadJson(json, fileName) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function Dashboard({ user, onLogout }) {
  const [conversations, setConversations] = useState([])
  const [activeConvo, setActiveConvo] = useState(null)
  const [inputText, setInputText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteStatus, setDeleteStatus] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [showAiConsent, setShowAiConsent] = useState(false)
  const [pendingText, setPendingText] = useState('')
  const [reviewSnapshot, setReviewSnapshot] = useState(null)
  const [pendingRemoteOptions, setPendingRemoteOptions] = useState(null)
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [deleteAllPhrase, setDeleteAllPhrase] = useState('')
  const [deleteAllStatus, setDeleteAllStatus] = useState('')
  const [deletingAll, setDeletingAll] = useState(false)
  const [persistenceStatus, setPersistenceStatus] = useState(null)
  const [legacyRecovery, setLegacyRecovery] = useState(null)
  const [recoveryExportStatus, setRecoveryExportStatus] = useState('')
  const fileInputRef = useRef(null)
  const requestRef = useRef(null)
  const requestGeneration = useRef(0)
  const consentBusy = useRef(false)
  const aiConsentTriggerRef = useRef(null)
  const deleteAllTriggerRef = useRef(null)
  const deleteAllDialogRef = useRef(null)
  const deleteAllInputRef = useRef(null)

  useEffect(() => () => {
    requestGeneration.current += 1
    requestRef.current?.abort()
  }, [])

  useEffect(() => {
    setConversations(getConversations())
    setLegacyRecovery(getLegacyRecoveryStatus())
    if (!hasOnboarded()) setShowOnboarding(true)
  }, [])

  useEffect(() => {
    if (!showDeleteAll) return undefined
    const trigger = deleteAllTriggerRef.current
    deleteAllInputRef.current?.focus()
    return () => trigger?.focus()
  }, [showDeleteAll])

  const saveAnalysis = (txt, result, source, fallbackReason, title = generateTitle(txt)) => {
    const convo = {
      id: Date.now(),
      timestamp: Date.now(),
      text: txt,
      result,
      title,
      source,
      fallbackReason,
      analysis_mode: result.analysis_mode,
    }
    let saved
    try {
      saved = saveConversation(convo)
    } catch {
      saved = { ok: false, error: 'PERSISTENCE_FAILED' }
    }
    if (saved?.ok) {
      setConversations(saved.reports)
      setActiveConvo({ ...convo, persisted: true })
      setInputText('')
      setPersistenceStatus(null)
      return
    }
    setActiveConvo({ ...convo, persisted: false })
    setInputText(txt)
    setPersistenceStatus({
      kind: 'error',
      conversation: convo,
      message: 'This analysis is not saved to browser storage. Your source and result remain available here for retry or export.',
    })
  }

  const retrySave = () => {
    const conversation = persistenceStatus?.conversation
    if (!conversation) return
    let saved
    try {
      saved = saveConversation(conversation)
    } catch {
      saved = { ok: false, error: 'PERSISTENCE_FAILED' }
    }
    if (!saved?.ok) {
      setPersistenceStatus(current => ({
        ...current,
        kind: 'error',
        message: 'This analysis is still not saved to browser storage. Retry or export it before leaving this result.',
      }))
      return
    }
    setConversations(saved.reports)
    setActiveConvo(current => current ? { ...current, persisted: true } : current)
    setInputText('')
    setPersistenceStatus({ kind: 'success', conversation, message: 'Analysis saved to this browser.' })
  }

  const exportUnsavedAnalysis = () => {
    const conversation = persistenceStatus?.conversation
    if (!conversation) return
    try {
      downloadJson(`${JSON.stringify({ schemaVersion: 1, analysis: conversation }, null, 2)}\n`, `convoautopsy-unsaved-${conversation.id}.json`)
      setPersistenceStatus(current => ({
        ...current,
        kind: 'error',
        message: 'This analysis is not saved to browser storage. An unsaved-analysis file was exported; you can also retry saving.',
      }))
    } catch {
      setPersistenceStatus(current => ({
        ...current,
        kind: 'error',
        message: 'This analysis is not saved, and the export could not start. Retry saving or use your browser to copy the visible result.',
      }))
    }
  }

  const exportLegacyRecovery = () => {
    const exported = getLegacyRecoveryExport()
    if (!exported?.ok) {
      setRecoveryExportStatus('The legacy recovery file could not be prepared. The preserved browser data was not deleted.')
      return
    }
    try {
      downloadJson(exported.json, exported.fileName)
      setRecoveryExportStatus('The legacy recovery file was exported. The preserved browser copy remains until Delete All succeeds.')
    } catch {
      setRecoveryExportStatus('The legacy recovery export could not start. The preserved browser copy remains available.')
    }
  }

  const invalidateAnalysisRequest = () => {
    requestGeneration.current += 1
    requestRef.current?.abort()
    requestRef.current = null
    setAnalyzing(false)
  }

  const resetPendingFlow = () => {
    invalidateAnalysisRequest()
    setPendingText('')
    setShowAiConsent(false)
    setReviewSnapshot(null)
    setPendingRemoteOptions(null)
    consentBusy.current = false
  }

  const beginRemoteReview = (txt, consent, preparedSnapshot) => {
    const snapshot = preparedSnapshot ?? prepareAnalysisReview(txt)
    if (!snapshot) {
      setError("Couldn't parse the conversation. Use format: Name: Message")
      return
    }
    setPendingText(txt)
    setPendingRemoteOptions({
      allowRemote: true,
      consentVersion: consent.version,
      installationToken: consent.installationToken,
    })
    setReviewSnapshot(snapshot)
  }

  const runAnalysis = async (txt, options) => {
    invalidateAnalysisRequest()
    const controller = new AbortController()
    requestRef.current = controller
    const generation = requestGeneration.current
    setAnalyzing(true)
    try {
      const { result, source, fallbackReason } = await analyzeConversation(txt, { ...options, signal: controller.signal })
      if (generation !== requestGeneration.current || controller.signal.aborted) return
      if (!result || !result.messages?.length) {
        setError("Couldn't parse the conversation. Use format: Name: Message")
        return
      }
      saveAnalysis(txt, result, source, options.localReason ?? fallbackReason)
    } catch (error) {
      if (generation !== requestGeneration.current || controller.signal.aborted || error?.name === 'AbortError') return
      setError('Analysis failed. Please try again.')
    } finally {
      if (generation === requestGeneration.current) {
        requestRef.current = null
        setAnalyzing(false)
      }
    }
  }

  const handleAnalyze = async (text = inputText, preResult = null) => {
    const txt = text.trim()
    if (!txt) { setError('Paste a conversation first'); return }
    if (countCodePoints(txt) > MAX_INPUT_CHARACTERS) {
      setError(`Conversation must be ${MAX_INPUT_CHARACTERS.toLocaleString()} characters or fewer`)
      return
    }
    setError('')

    if (preResult) {
      resetPendingFlow()
      saveAnalysis(txt, { ...preResult, analysis_mode: 'local' }, 'local', 'LOCAL_REQUESTED', 'Demo Analysis')
      return
    }
    const preparedReview = prepareAnalysisReview(txt)
    if (!preparedReview) {
      setError("Couldn't parse the conversation. Use format: Name: Message")
      return
    }
    if (exceedsRemoteAnalysisLimits(preparedReview)) {
      resetPendingFlow()
      await runAnalysis(txt, { allowRemote: false, localReason: 'REMOTE_INPUT_LIMIT' })
      return
    }
    const consent = getAiConsent()
    if (!consent) {
      setPendingText(txt)
      setShowAiConsent(true)
      return
    }
    beginRemoteReview(txt, consent, preparedReview)
  }

  const handleConsent = async () => {
    if (consentBusy.current || !pendingText) return
    consentBusy.current = true
    const consent = grantAiConsent()
    setShowAiConsent(false)
    const txt = pendingText
    if (consent) beginRemoteReview(txt, consent)
    else {
      setPendingText('')
      await runAnalysis(txt, { allowRemote: false, localReason: 'CONSENT_STORAGE_UNAVAILABLE' })
    }
    consentBusy.current = false
  }

  const handleDecline = async () => {
    if (consentBusy.current || !pendingText) return
    consentBusy.current = true
    setShowAiConsent(false)
    const txt = pendingText
    setPendingText('')
    await runAnalysis(txt, { allowRemote: false, localReason: 'LOCAL_REQUESTED' })
    consentBusy.current = false
  }

  const handleReviewConfirm = async (reviewedSnapshot) => {
    if (!pendingText || !pendingRemoteOptions) return
    const txt = pendingText
    const remoteOptions = pendingRemoteOptions
    setReviewSnapshot(null)
    setPendingText('')
    setPendingRemoteOptions(null)
    await runAnalysis(txt, { ...remoteOptions, reviewedSnapshot })
  }

  const handleReviewCancel = () => {
    resetPendingFlow()
    setError('Remote request canceled. Your conversation remains on this device.')
  }

  const handleDelete = (id) => {
    let deleted = false
    try {
      deleted = deleteConversation(id)
    } catch {
      deleted = false
    }
    if (!deleted) {
      setDeleteStatus('This analysis could not be deleted from browser storage. Retry after closing other ConvoAutopsy tabs.')
      setDeleteConfirm(null)
      return
    }
    setDeleteStatus('')
    if (activeConvo?.id === id) invalidateAnalysisRequest()
    setConversations(current => current.filter(conversation => conversation.id !== id))
    if (activeConvo?.id === id) {
      setActiveConvo(null)
      setPersistenceStatus(null)
    }
    setDeleteConfirm(null)
  }

  const handleLogout = () => { resetPendingFlow(); setPersistenceStatus(null); clearSession(); onLogout() }

  const closeDeleteAll = () => {
    if (deletingAll) return
    setShowDeleteAll(false)
    setDeleteAllPhrase('')
    setDeleteAllStatus('')
  }

  const handleDeleteAllKeyDown = (event) => {
    if (event.key === 'Escape' && !deletingAll) {
      event.preventDefault()
      closeDeleteAll()
      return
    }
    if (event.key !== 'Tab' || deletingAll) return
    const controls = [...(deleteAllDialogRef.current?.querySelectorAll('input, button') ?? [])]
      .filter(control => !control.disabled)
    if (controls.length === 0) return
    const currentIndex = controls.indexOf(document.activeElement)
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? controls.length - 1 : currentIndex - 1)
      : (currentIndex === controls.length - 1 ? 0 : currentIndex + 1)
    event.preventDefault()
    controls[nextIndex]?.focus()
  }

  const handleDeleteAll = async () => {
    if (deleteAllPhrase !== 'DELETE' || deletingAll) return
    setDeletingAll(true)
    setDeleteAllStatus('')
    let result
    try {
      result = await deleteAllWebData()
    } catch {
      result = { ok: false, failed: ['browser storage'] }
    }
    setDeletingAll(false)
    if (!result.ok) {
      setDeleteAllStatus('Some browser data could not be deleted. Retry after closing other ConvoAutopsy tabs.')
      return
    }
    invalidateAnalysisRequest()
    setConversations([])
    setActiveConvo(null)
    setInputText('')
    setPersistenceStatus(null)
    setLegacyRecovery(null)
    setRecoveryExportStatus('')
    setShowDeleteAll(false)
    setDeleteAllPhrase('')
    setDeleteAllStatus('All app-owned browser data was deleted. Remote provider copies, backups, and App Store subscriptions are not affected.')
  }

  const handleFile = (file) => {
    if (!file) return
    resetPendingFlow()
    const generation = requestGeneration.current
    const name = file.name.toLowerCase()
    if (!name.endsWith('.txt') && !name.endsWith('.log') && !name.endsWith('.csv')) {
      setError('Upload a .txt file (WhatsApp export, Discord log, etc.)')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      if (generation !== requestGeneration.current) return
      const text = e.target.result
      if (typeof text !== 'string' || countCodePoints(text) > MAX_INPUT_CHARACTERS) {
        setInputText('')
        setError(`Conversation must be ${MAX_INPUT_CHARACTERS.toLocaleString()} characters or fewer`)
        return
      }
      setInputText(text)
      setError('')
      setActiveConvo(null)
    }
    reader.readAsText(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }

  return (
    <div className="dash-root">
      {showOnboarding && (
        <Onboarding username={user.username} onDone={() => setShowOnboarding(false)} />
      )}
      {showAiConsent && (
        <AiConsentModal onAgree={handleConsent} onDecline={handleDecline} isRunning={analyzing} returnFocusRef={aiConsentTriggerRef} />
      )}
      {reviewSnapshot && (
        <RemoteDataReview
          snapshot={reviewSnapshot}
          isConfirming={analyzing}
          onConfirm={handleReviewConfirm}
          onCancel={handleReviewCancel}
        />
      )}
      {showDeleteAll && (
        <div className="delete-all-backdrop" role="presentation">
          <section
            className="delete-all-dialog"
            ref={deleteAllDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-all-title"
            aria-describedby="delete-all-description"
            onKeyDown={handleDeleteAllKeyDown}
          >
            <h2 id="delete-all-title">Delete all browser data?</h2>
            <p id="delete-all-description">This removes ConvoAutopsy reports, drafts, preferences, consent, legacy recovery, and cached browser artifacts on this browser.</p>
            <p>It cannot recall data already shared with providers or backups, and it does not cancel an App Store subscription.</p>
            <label>
              Type DELETE to confirm
              <input ref={deleteAllInputRef} value={deleteAllPhrase} onChange={(event) => setDeleteAllPhrase(event.target.value)} disabled={deletingAll} />
            </label>
            {deleteAllStatus && <div role="alert">{deleteAllStatus}</div>}
            {deletingAll && <div role="status">Deleting app-owned browser data…</div>}
            <button onClick={handleDeleteAll} disabled={deleteAllPhrase !== 'DELETE' || deletingAll}>
              {deletingAll ? 'Deleting…' : 'Delete all browser data'}
            </button>
            <button onClick={closeDeleteAll} disabled={deletingAll}>Cancel</button>
          </section>
        </div>
      )}
      {!showDeleteAll && deleteAllStatus && (
        <div className="dash-delete-all-status" role="status">{deleteAllStatus}</div>
      )}

      {/* ── Top nav ── */}
      <nav className="dash-nav">
        <button className="dash-nav-toggle" onClick={() => setSidebarOpen(o => !o)} title="Toggle sidebar">
          <span /><span /><span />
        </button>
        <div className="dash-nav-logo">Convo<span>Autopsy</span></div>
        <div className="dash-nav-right">
          <div className="dash-user-pill">
            <span className="dash-user-avatar">{(user.displayName || user.username || 'L')[0].toUpperCase()}</span>
            <span className="dash-username">{user.displayName || user.username || 'Local profile'}</span>
          </div>
          <a href="privacy.html">Privacy</a>
          <a href="terms.html">Terms</a>
          <button ref={deleteAllTriggerRef} className="dash-delete-all" onClick={() => { setDeleteAllStatus(''); setShowDeleteAll(true) }}>Delete All</button>
          <button className="dash-logout" onClick={handleLogout}>Exit dashboard</button>
        </div>
      </nav>

      {legacyRecovery?.available && (
        <section className="dash-legacy-recovery" aria-labelledby="legacy-recovery-title">
          <h2 id="legacy-recovery-title">Legacy report recovery</h2>
          <p role="status">
            {legacyRecovery.reportCount} legacy {legacyRecovery.reportCount === 1 ? 'report' : 'reports'} from {legacyRecovery.bucketCount} previous {legacyRecovery.bucketCount === 1 ? 'profile is' : 'profiles are'} preserved separately. Only the previously selected session could be added to this history automatically.
            {recoveryExportStatus && <> {recoveryExportStatus}</>}
          </p>
          <p>Profile names and report contents stay hidden here. Export the recovery file only when you are ready to review that private legacy data.</p>
          <button type="button" onClick={exportLegacyRecovery}>Export legacy recovery</button>
        </section>
      )}
      {legacyRecovery?.needsAttention && (
        <section className="dash-legacy-recovery" aria-labelledby="legacy-recovery-attention-title">
          <h2 id="legacy-recovery-attention-title">Legacy recovery needs attention</h2>
          <p role="alert">Legacy browser data could not be validated or preserved safely, so its source keys were left unchanged. Delete All can remove them; otherwise keep this browser data intact for manual recovery.</p>
        </section>
      )}
      {deleteStatus && <p className="dash-delete-status" role="alert">{deleteStatus}</p>}

      <div className="dash-body">
        {/* ── Sidebar ── */}
        <aside className={`dash-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="dash-sidebar-header">
            <span>Past Analyses</span>
            <span className="dash-sidebar-count">{conversations.length}</span>
          </div>

          <button
            className="dash-new-btn"
            onClick={() => { resetPendingFlow(); setPersistenceStatus(null); setActiveConvo(null); setInputText(''); setError('') }}
          >
            + New Analysis
          </button>

          <div className="dash-convo-list">
            {conversations.length === 0 && (
              <div className="dash-empty-list">No analyses yet.<br />Run your first autopsy above.</div>
            )}
            {conversations.map(c => (
              <div
                key={c.id}
                className={`dash-convo-item ${activeConvo?.id === c.id ? 'active' : ''}`}
                onClick={() => { resetPendingFlow(); setPersistenceStatus(null); setActiveConvo(c) }}
              >
                <div className="dash-convo-title">{c.title}</div>
                <div className="dash-convo-meta">
                  <span className={`dash-convo-score score-${Math.round(c.result.overall_tension_score / 25)}`}>
                    {c.result.overall_tension_score}
                  </span>
                  <span className="dash-convo-date">{formatDate(c.timestamp)}</span>
                </div>
                {deleteConfirm === c.id ? (
                  <div className="dash-delete-confirm" onClick={e => e.stopPropagation()}>
                    <span>Delete?</span>
                    <button onClick={() => handleDelete(c.id)}>Yes</button>
                    <button onClick={() => setDeleteConfirm(null)}>No</button>
                  </div>
                ) : (
                  <button className="dash-delete-btn" onClick={e => { e.stopPropagation(); setDeleteConfirm(c.id) }}>×</button>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="dash-main">
          {activeConvo ? (
            <div className="dash-result-view">
              {persistenceStatus && persistenceStatus.conversation?.id === activeConvo.id && (
                <section
                  className={`dash-persistence-status dash-persistence-status-${persistenceStatus.kind}`}
                  role={persistenceStatus.kind === 'error' ? 'alert' : 'status'}
                  aria-label="Analysis storage status"
                >
                  <p>{persistenceStatus.message}</p>
                  {persistenceStatus.kind === 'error' && (
                    <div className="dash-persistence-actions">
                      <button type="button" onClick={retrySave}>Retry saving</button>
                      <button type="button" onClick={exportUnsavedAnalysis}>Export unsaved analysis</button>
                    </div>
                  )}
                </section>
              )}
              <div className={`dash-ai-source dash-ai-source-${activeConvo.source || 'local'}`}>
                {analysisSourceMessage(activeConvo.source, activeConvo.fallbackReason)}
              </div>
              <AnalysisResult
                result={activeConvo.result}
                timestamp={activeConvo.timestamp}
                onBack={() => { resetPendingFlow(); setActiveConvo(null) }}
              />
              <div className="dash-crafter-wrap">
                <ResponseCrafter result={activeConvo.result} conversationText={activeConvo.text} />
              </div>
            </div>
          ) : (
            <div className="dash-input-view">
              <div className="dash-input-header">
                <h2>New Autopsy</h2>
                <p>Paste a conversation or <strong>upload a .txt file</strong>. Use <code>Name: Message</code> format.</p>
              </div>

              {/* Drop zone wrapper */}
              <div
                className={`dash-dropzone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <textarea
                  className="dash-textarea"
                  value={inputText}
                  onChange={e => { setInputText(e.target.value); setError('') }}
                  placeholder={`Alex: I told you I'd be there by 7.\nJordan: You never listen to anything I say.\nAlex: That's not what I said.\nJordan: Whatever. I'm done.`}
                  rows={12}
                  disabled={analyzing}
                />
                {dragOver && (
                  <div className="dash-drop-overlay">
                    <span className="dash-drop-icon">📂</span>
                    <span>Drop your chat file here</span>
                  </div>
                )}
              </div>

              <div className="dash-character-count" aria-live="polite">
                {countCodePoints(inputText).toLocaleString()} of {MAX_INPUT_CHARACTERS.toLocaleString()} characters
              </div>

              <div className="dash-upload-row">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.log,.csv"
                  style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files[0])}
                />
                <button
                  className="dash-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={analyzing}
                  title="Upload WhatsApp export, Discord log, or any .txt file"
                >
                  ↑ Upload file
                </button>
                <span className="dash-upload-hint">WhatsApp .txt, Discord, or any chat export</span>
              </div>

              {error && <div className="dash-error">{error}</div>}

              <div className="dash-actions">
                <button
                  className="dash-demo-btn"
                  onClick={() => { setInputText(DEMO_TEXT); handleAnalyze(DEMO_TEXT, DEMO_RESULT) }}
                  disabled={analyzing}
                >
                  Try Demo
                </button>
                <button
                  className="dash-analyze-btn"
                  ref={aiConsentTriggerRef}
                  onClick={() => handleAnalyze()}
                  disabled={analyzing || !inputText.trim()}
                >
                  {analyzing ? (
                    <span className="dash-analyzing">
                      <span className="dash-dot" /><span className="dash-dot" /><span className="dash-dot" />
                      Analyzing…
                    </span>
                  ) : 'Run Autopsy →'}
                </button>
              </div>

              {conversations.length > 0 && (
                <div className="dash-recent-hint">
                  ↙ {conversations.length} saved {conversations.length === 1 ? 'analysis' : 'analyses'} in your history
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
