const LOCAL_PROFILE = Object.freeze({ id: 'local', displayName: 'Local profile' })

export default function LocalProfileEntry({ onAuth, onBack }) {
  return (
    <div className="auth-page">
      <button className="auth-back" onClick={onBack}>← Back to home</button>
      <div className="auth-card">
        <div className="auth-logo">Convo<span>Autopsy</span></div>
        <h2 className="auth-heading">Browser-local workspace</h2>
        <p className="auth-sub">There is no web account. Reports stay in this browser unless you explicitly export or share them.</p>
        <button type="button" className="auth-submit" onClick={() => onAuth({ ...LOCAL_PROFILE })}>
          Continue with local profile →
        </button>
      </div>
    </div>
  )
}
