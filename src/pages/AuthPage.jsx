import { useState } from 'react'
import { registerUser, loginUser, setSession } from '../utils/storage'

export default function AuthPage({ onAuth, onBack }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const switchMode = () => { setMode(m => m === 'login' ? 'signup' : 'login'); setError('') }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const u = username.trim()
    if (!u || !password) { setError('Please fill in all fields'); return }
    if (u.length < 2) { setError('Username must be at least 2 characters'); return }
    if (password.length < 4) { setError('Password must be at least 4 characters'); return }

    setLoading(true)
    await new Promise(r => setTimeout(r, 380))

    const result = mode === 'signup' ? registerUser(u, password) : loginUser(u, password)
    setLoading(false)

    if (result.error) { setError(result.error); return }
    setSession(result.user)
    onAuth(result.user)
  }

  return (
    <div className="auth-page">
      <button className="auth-back" onClick={onBack}>← Back to home</button>

      <div className="auth-card">
        <div className="auth-logo">Convo<span>Autopsy</span></div>

        <h2 className="auth-heading">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h2>
        <p className="auth-sub">
          {mode === 'login' ? 'Access your saved analyses' : 'Start diagnosing conversations'}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="your_username"
              autoFocus
              autoComplete="username"
              disabled={loading}
            />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              disabled={loading}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading
              ? <span className="auth-loading"><span /><span /><span /></span>
              : mode === 'login' ? 'Sign in →' : 'Create account →'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          <button type="button" className="auth-switch-btn" onClick={switchMode}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
