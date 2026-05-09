import React, { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from './supabase'
import AuthScreen from './AuthScreen'
import CsmView from './CsmView'
import ImplementationView from './ImplementationView'
import SupportView from './SupportView'
import AeView from './AeView'
import GrowthView from './GrowthView'
import AdStrategistView from './AdStrategistView'
import EngineerView from './EngineerView'
import ManagerView from './ManagerView'
import ComingSoonView from './ComingSoonView'
import LeadershipPendingView from './LeadershipPendingView'
import SharedPagesView from './SharedPagesView'
import ApiIntegrationGuide from './ApiIntegrationGuide'
import LeadershipDashboardView from './LeadershipDashboardView'
import { accessTier, isLeadershipTeam, isLeadershipRole } from './teams'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // 'self' | 'manager' | 'feature_requests' | 'integrations' | 'api_guide' | 'leadership'
  const [viewMode, setViewMode] = useState('self')

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

  // When the session changes (sign in / out), reset the profile state so we
  // don't briefly show stale data from the previous user, then load fresh.
  useEffect(() => {
    if (!session) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setProfile(null)  // clear stale profile from previous session

    // Try to load profile, with one automatic retry to handle the brief race
    // condition that can happen right after signup (profile was just inserted
    // but the auth session may not yet have RLS context to read it).
    const loadProfile = async (attempt = 1) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (data) {
        setProfile(data)
        const tier = accessTier(data)
        setViewMode(tier === 'member' ? 'self' : 'manager')
        setLoading(false)
        return
      }

      // No profile found — if this is the first attempt, retry once after a brief
      // delay (handles race condition immediately after signup).
      if (attempt === 1) {
        await new Promise(r => setTimeout(r, 600))
        return loadProfile(2)
      }

      // Still no profile after retry — log error and stop loading so the user
      // sees the "Profile not found" screen.
      if (error) console.error('Profile load error', error)
      setLoading(false)
    }

    loadProfile()
  }, [session])

  const handleSignOut = async () => { await supabase.auth.signOut() }

  // Safety: if a user's tier changes (e.g. demoted from exec) while they're on
  // a privileged view, bounce them to a safe view. Done in effect to avoid
  // setState during render.
  useEffect(() => {
    if (!profile) return
    const currentTier = accessTier(profile)
    if (viewMode === 'leadership' && currentTier !== 'executive') {
      setViewMode('self')
    }
  }, [profile, viewMode])

  if (loading) return <Shell><div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-700" /></div></Shell>

  if (!session) return <Shell><AuthScreen /></Shell>

  if (!profile) {
    return (
      <Shell>
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <div className="display-font text-3xl font-medium text-stone-900 mb-3">Profile not found</div>
            <p className="text-stone-600 mb-6">Your account exists but the profile record is missing. Database may not be set up.</p>
            <button onClick={handleSignOut} className="px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm">Sign out</button>
          </div>
        </div>
      </Shell>
    )
  }

  const tier = accessTier(profile)
  const canSeeManagerView = tier === 'executive' || tier === 'team_lead'

  // Leadership team members who haven't been promoted to executive yet
  // see a "waiting for approval" screen instead of an irrelevant scorecard.
  const isLeadershipMember = isLeadershipTeam(profile.team) && tier !== 'executive'
  if (isLeadershipMember) {
    return (
      <Shell>
        <LeadershipPendingView
          profile={profile}
          onSignOut={handleSignOut}
          onProfileUpdated={setProfile}
        />
      </Shell>
    )
  }

  // Shared pages (Feature Requests / Integrations) — visible to everyone with a profile
  if (viewMode === 'feature_requests' || viewMode === 'integrations') {
    const canGoToSelf = !isLeadershipRole(profile.role_type)
    const canSeeLeadership = tier === 'executive'
    return (
      <Shell>
        <SharedPagesView
          profile={profile}
          page={viewMode}
          onSignOut={handleSignOut}
          onSwitchToSelf={canGoToSelf ? () => setViewMode('self') : null}
          onSwitchToManager={canSeeManagerView ? () => setViewMode('manager') : null}
          onSwitchToFeatureRequests={() => setViewMode('feature_requests')}
          onSwitchToIntegrations={() => setViewMode('integrations')}
          onSwitchToApiGuide={() => setViewMode('api_guide')}
          onSwitchToLeadership={canSeeLeadership ? () => setViewMode('leadership') : null}
          onProfileUpdated={setProfile}
        />
      </Shell>
    )
  }

  // API Integration Guide — visible to everyone with a profile (informational only)
  if (viewMode === 'api_guide') {
    const canGoToSelf = !isLeadershipRole(profile.role_type)
    const canSeeLeadership = tier === 'executive'
    return (
      <Shell>
        <ApiIntegrationGuide
          profile={profile}
          onSignOut={handleSignOut}
          onSwitchToSelf={canGoToSelf ? () => setViewMode('self') : null}
          onSwitchToManager={canSeeManagerView ? () => setViewMode('manager') : null}
          onSwitchToFeatureRequests={() => setViewMode('feature_requests')}
          onSwitchToIntegrations={() => setViewMode('integrations')}
          onSwitchToLeadership={canSeeLeadership ? () => setViewMode('leadership') : null}
          onProfileUpdated={setProfile}
        />
      </Shell>
    )
  }

  // Leadership Dashboard — gated by executive access
  if (viewMode === 'leadership' && tier === 'executive') {
    const canGoToSelf = !isLeadershipRole(profile.role_type)
    return (
      <Shell>
        <LeadershipDashboardView
          profile={profile}
          onSignOut={handleSignOut}
          onSwitchToSelf={canGoToSelf ? () => setViewMode('self') : null}
          onSwitchToManager={canSeeManagerView ? () => setViewMode('manager') : null}
          onSwitchToFeatureRequests={() => setViewMode('feature_requests')}
          onSwitchToIntegrations={() => setViewMode('integrations')}
          onSwitchToApiGuide={() => setViewMode('api_guide')}
          onProfileUpdated={setProfile}
        />
      </Shell>
    )
  }
  // Note: if a non-exec ever has viewMode='leadership' (shouldn't be possible
  // through normal nav since the button is gated, but could happen via stale
  // state after a role demotion), we just fall through to the normal routing
  // below — they'll land on their personal scorecard or manager view.

  // Manager view (executives + team leads)
  if (canSeeManagerView && viewMode === 'manager') {
    return (
      <Shell>
        <ManagerView
          profile={profile}
          onSignOut={handleSignOut}
          onSwitchToSelf={() => setViewMode('self')}
          onSwitchToFeatureRequests={() => setViewMode('feature_requests')}
          onSwitchToIntegrations={() => setViewMode('integrations')}
          onSwitchToApiGuide={() => setViewMode('api_guide')}
          onSwitchToLeadership={tier === 'executive' ? () => setViewMode('leadership') : null}
        />
      </Shell>
    )
  }

  // For executives whose personal role is also Leadership (no scorecard),
  // there's no useful "self view" — bounce them to manager view.
  if (canSeeManagerView && viewMode === 'self' && isLeadershipRole(profile.role_type)) {
    return (
      <Shell>
        <ManagerView
          profile={profile}
          onSignOut={handleSignOut}
          onSwitchToSelf={() => setViewMode('self')}
          onSwitchToFeatureRequests={() => setViewMode('feature_requests')}
          onSwitchToIntegrations={() => setViewMode('integrations')}
          onSwitchToApiGuide={() => setViewMode('api_guide')}
          onSwitchToLeadership={tier === 'executive' ? () => setViewMode('leadership') : null}
        />
      </Shell>
    )
  }

  // Personal scorecard — route based on role
  return (
    <Shell>
      <PersonalScorecard
        profile={profile}
        onSignOut={handleSignOut}
        onSwitchToManager={canSeeManagerView ? () => setViewMode('manager') : null}
        onSwitchToFeatureRequests={() => setViewMode('feature_requests')}
        onSwitchToIntegrations={() => setViewMode('integrations')}
        onSwitchToApiGuide={() => setViewMode('api_guide')}
        onSwitchToLeadership={tier === 'executive' ? () => setViewMode('leadership') : null}
        onProfileUpdated={setProfile}
      />
    </Shell>
  )
}

// Routes to the right scorecard component based on the user's role.
function PersonalScorecard({ profile, onSignOut, onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToApiGuide, onSwitchToLeadership, onProfileUpdated }) {
  const role = profile.role_type
  const props = { profile, onSignOut, onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToApiGuide, onSwitchToLeadership, onProfileUpdated }
  switch (role) {
    case 'csm':
      return <CsmView {...props} />
    case 'implementation':
      return <ImplementationView {...props} />
    case 'support':
      return <SupportView {...props} />
    case 'account_executive':
      return <AeView {...props} />
    case 'growth_manager':
      return <GrowthView {...props} />
    case 'ad_strategist':
      return <AdStrategistView {...props} />
    case 'engineer':
      return <EngineerView {...props} />
    default:
      return <ComingSoonView {...props} />
  }
}

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
