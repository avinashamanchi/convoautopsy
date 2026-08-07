import { useState } from 'react'
import { initializeLocalProfile } from './utils/storage'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'

export default function App() {
  const [page, setPage] = useState('landing')
  const [profile] = useState(() => initializeLocalProfile())

  if (page === 'dashboard') {
    return <Dashboard user={profile} onLogout={() => setPage('landing')} />
  }

  return (
    <LandingPage
      user={profile}
      onGetStarted={() => setPage('dashboard')}
      onGoToDashboard={() => setPage('dashboard')}
    />
  )
}
