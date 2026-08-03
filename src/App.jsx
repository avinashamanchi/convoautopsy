import { useState } from 'react'
import { getSession, setSession } from './utils/storage'
import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'

export default function App() {
  const [page, setPage] = useState('landing')
  const [user, setUser] = useState(() => getSession())

  const handleAuth = (authUser) => {
    setSession(authUser)
    setUser(authUser)
    setPage('dashboard')
  }

  const handleLogout = () => {
    setUser(null)
    setPage('landing')
  }

  if (page === 'auth') {
    return <AuthPage onAuth={handleAuth} onBack={() => setPage('landing')} />
  }

  if (page === 'dashboard') {
    return <Dashboard user={user} onLogout={handleLogout} />
  }

  return (
    <LandingPage
      user={user}
      onGetStarted={() => setPage(user ? 'dashboard' : 'auth')}
      onGoToDashboard={() => setPage('dashboard')}
    />
  )
}
