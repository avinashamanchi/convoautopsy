import { useState, useEffect } from 'react'
import {
  getConversations, saveConversation, deleteConversation,
  clearSession, hasOnboarded
} from '../utils/storage'
import { analyzeConversation, DEMO_TEXT, DEMO_RESULT } from '../utils/analyzeConversation'
import AnalysisResult from '../components/AnalysisResult'
import Onboarding from '../components/Onboarding'

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
    const m = l.match(/^[^:\-\n]{1,40}[\:\-]\s*(.+)$/)
    return m && m[1].trim().length > 0
  })
  if (!firstMsg) return 'Untitled Analysis'
  const m = firstMsg.match(/^[^:\-\n]{1,40}[\:\-]\s*(.+)$/)
  const txt = m ? m[1].trim() : firstMsg.trim()
  return txt.length > 36 ? txt.slice(0, 36) + '…' : txt
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

  useEffect(() => {
    setConversations(getConversations(user.username))
    if (!hasOnboarded(user.username)) setShowOnboarding(true)
  }, [user.username])

  const handleAnalyze = async (text = inputText, preResult = null) => {
    const txt = text.trim()
    if (!txt) { setError('Paste a conversation first'); return }
    setError('')

    if (preResult) {
      // Demo mode: instant result
      const convo = { id: Date.now(), timestamp: Date.now(), text: txt, result: preResult, title: 'Demo Analysis' }
      saveConversation(user.username, convo)
      setConversations(getConversations(user.username))
      setActiveConvo(convo)
      setInputText('')
      return
    }

    setAnalyzing(true)
    try {
      const result = await analyzeConversation(txt)
      if (!result || !result.messages?.length) {
        setError("Couldn't parse the conversation. Use format: Name: Message")
        setAnalyzing(false)
        return
      }
      const convo = { id: Date.now(), timestamp: Date.now(), text: txt, result, title: generateTitle(txt) }
      saveConversation(user.username, convo)
      setConversations(getConversations(user.username))
      setActiveConvo(convo)
      setInputText('')
    } catch {
      setError('Analysis failed. Please try again.')
    }
    setAnalyzing(false)
  }

  const handleDelete = (id) => {
    deleteConversation(user.username, id)
    setConversations(getConversations(user.username))
    if (activeConvo?.id === id) setActiveConvo(null)
    setDeleteConfirm(null)
  }

  const handleLogout = () => { clearSession(); onLogout() }

  return (
    <div className="dash-root">
      {showOnboarding && (
        <Onboarding username={user.username} onDone={() => setShowOnboarding(false)} />
      )}

      {/* ── Top nav ── */}
      <nav className="dash-nav">
        <button className="dash-nav-toggle" onClick={() => setSidebarOpen(o => !o)} title="Toggle sidebar">
          <span /><span /><span />
        </button>
        <div className="dash-nav-logo">Convo<span>Autopsy</span></div>
        <div className="dash-nav-right">
          <div className="dash-user-pill">
            <span className="dash-user-avatar">{user.username[0].toUpperCase()}</span>
            <span className="dash-username">{user.username}</span>
          </div>
          <button className="dash-logout" onClick={handleLogout}>Log out</button>
        </div>
      </nav>

      <div className="dash-body">
        {/* ── Sidebar ── */}
        <aside className={`dash-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="dash-sidebar-header">
            <span>Past Analyses</span>
            <span className="dash-sidebar-count">{conversations.length}</span>
          </div>

          <button
            className="dash-new-btn"
            onClick={() => { setActiveConvo(null); setInputText(''); setError('') }}
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
                onClick={() => setActiveConvo(c)}
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
            <AnalysisResult
              result={activeConvo.result}
              timestamp={activeConvo.timestamp}
              onBack={() => setActiveConvo(null)}
            />
          ) : (
            <div className="dash-input-view">
              <div className="dash-input-header">
                <h2>New Autopsy</h2>
                <p>Paste any conversation below. Use <code>Name: Message</code> format, one per line.</p>
              </div>

              <textarea
                className="dash-textarea"
                value={inputText}
                onChange={e => { setInputText(e.target.value); setError('') }}
                placeholder={`Alex: I told you I'd be there by 7.\nJordan: You never listen to anything I say.\nAlex: That's not what I said.\nJordan: Whatever. I'm done.`}
                rows={12}
                disabled={analyzing}
              />

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
