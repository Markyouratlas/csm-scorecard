import React, { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from './supabase'
import AuthScreen from './AuthScreen'
import CsmView from './CsmView'
import ManagerView from './ManagerView'
import { BLANK_WEEK } from './constants'
import { getWeekKey } from './dateUtils'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('self') // 'self' | 'manager' (managers can toggle)

  // ---- Watch auth state ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (!session) setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // ---- Load profile when signed in ----
  useEffect(() => {
    if (!session) return
    setLoading(true)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('Profile load error', error)
        }
        setProfile(data)
        setViewMode(data?.role === 'manager' ? 'manager' : 'self')
        setLoading(false)
      })
  }, [session])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  if (loading) {
    return (
      <Shell>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-stone-700" />
        </div>
      </Shell>
    )
  }

  if (!session) {
    return (
      <Shell>
        <AuthScreen />
      </Shell>
    )
  }

  if (!profile) {
    return (
      <Shell>
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <div className="display-font text-3xl font-medium text-stone-900 mb-3">Profile not found</div>
            <p className="text-stone-600 mb-6">Your account exists but the profile record is missing. This usually means the database isn't set up yet.</p>
            <button onClick={handleSignOut} className="px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm">
              Sign out
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      {profile.role === 'manager' && viewMode === 'manager' ? (
        <ManagerView
          profile={profile}
          onSignOut={handleSignOut}
          onSwitchToSelf={() => setViewMode('self')}
        />
      ) : (
        <CsmView
          profile={profile}
          onSignOut={handleSignOut}
          onSwitchToManager={profile.role === 'manager' ? () => setViewMode('manager') : null}
        />
      )}
    </Shell>
  )
}

// Wrapper that injects the global font + style sheet used everywhere
function Shell({ children }) {
  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700;9..144,900&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <style>{`
        body { background: #FAF8F4; }
        .display-font { font-family: 'Fraunces', serif; font-optical-sizing: auto; }
        .mono-font { font-family: 'JetBrains Mono', monospace; }
        @keyframes fadeUp { from { opacity:0; transform: translateY(8px);} to { opacity:1; transform: translateY(0);} }
        .fade-up { animation: fadeUp 0.5s cubic-bezier(0.2,0.7,0.3,1) both; }
        .num-tabular { font-variant-numeric: tabular-nums; }
        input, textarea, select { font-family: inherit; }
        input:focus, textarea:focus, select:focus { outline: none; }
        .pulse-dot { animation: pulse-soft 2s ease-in-out infinite; }
        @keyframes pulse-soft { 0%,100% { opacity:1;} 50% { opacity:0.4;} }
      `}</style>
      {children}
    </div>
  )
}
