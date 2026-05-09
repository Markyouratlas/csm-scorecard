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
    <div className="min-h-screen" style={{ fontFamily: "'Manrope', system-ui, sans-serif", background: 'var(--bg)' }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <style>{`
        /* ============================================================
           Atlas Odyssey — Design System
           Based on the Odyssey scorecard with adjustments for long-session ergonomics:
           Background is soft off-white, not lavender. Lavender appears as accent only.
           ============================================================ */
        :root {
          /* Background system */
          --bg:           #FAFAF7;   /* Soft off-white — primary canvas, easy on the eyes */
          --bg-deep:      #F4F2EE;   /* Slightly deeper for sections that should stand out */
          --bg-tinted:    #F3EFF7;   /* Lavender-tinted, used for hero gradients + executive surfaces */
          --bg-tinted-2:  #E8E1F0;   /* Deeper lavender, used sparingly for emphasis */

          /* Surface colors (cards, modals) */
          --surface:      #FFFFFF;   /* Pure white cards float above the off-white canvas */
          --surface-2:    #F8F7FB;   /* Slight tint for nested surfaces */
          --surface-soft: rgba(255, 255, 255, 0.7);

          /* Borders */
          --border:        rgba(26, 15, 46, 0.14);
          --border-soft:   rgba(26, 15, 46, 0.08);
          --border-strong: rgba(26, 15, 46, 0.22);

          /* Text */
          --text:    #0F0825;   /* Deep purple-black, not pure black */
          --text-2:  #3A3147;
          --text-3:  #56506A;
          --text-4:  #6F6884;
          --text-5:  #8B8499;

          /* Brand */
          --brand:        #6639A6;
          --brand-bright: #8B5CD0;
          --brand-deep:   #4A2980;
          --brand-soft:   rgba(102, 57, 166, 0.08);
          --brand-soft-2: rgba(102, 57, 166, 0.14);
          --brand-line:   rgba(102, 57, 166, 0.22);

          /* Semantic colors — tuned to harmonize with the purple system */
          --green:       #10B981;
          --green-soft:  rgba(16, 185, 129, 0.10);
          --green-deep:  #047857;
          --amber:       #F59E0B;
          --amber-soft:  rgba(245, 158, 11, 0.10);
          --amber-deep:  #A16207;
          --red:         #EF4444;
          --red-soft:    rgba(239, 68, 68, 0.10);
          --red-deep:    #B91C1C;
          --blue:        #3B82F6;
          --blue-soft:   rgba(59, 130, 246, 0.10);
          --blue-deep:   #1E40AF;

          /* Shadows — soft purple-tinted, subtle */
          --shadow-sm:    0 1px 2px rgba(26, 15, 46, 0.05), 0 1px 0 rgba(255, 255, 255, 0.9) inset;
          --shadow-md:    0 2px 4px rgba(26, 15, 46, 0.05), 0 12px 32px -8px rgba(102, 57, 166, 0.10), 0 1px 0 rgba(255, 255, 255, 0.9) inset;
          --shadow-glass: 0 1px 0 rgba(255, 255, 255, 0.95) inset, 0 0 0 1px rgba(102, 57, 166, 0.06), 0 16px 40px -12px rgba(102, 57, 166, 0.20);
          --shadow-card:  0 1px 2px rgba(26, 15, 46, 0.04);
        }

        body { background: var(--bg); color: var(--text); }
        html, body { font-family: 'Manrope', system-ui, sans-serif; }

        /* Typography helpers */
        .display-font {
          font-family: 'Instrument Serif', Georgia, serif;
          font-weight: 400;
          letter-spacing: -0.005em;
          font-feature-settings: 'tnum';
        }
        .display-font-i { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; }
        .body-font     { font-family: 'Manrope', system-ui, sans-serif; }
        .mono-font     { font-family: 'JetBrains Mono', ui-monospace, monospace; font-feature-settings: 'tnum'; }
        .num-tabular   { font-variant-numeric: tabular-nums; }

        /* Animations */
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) both; }
        @keyframes pulse-soft { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .pulse-dot { animation: pulse-soft 2s ease-in-out infinite; }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

        /* Form polish — applies app-wide */
        input, textarea, select { font-family: inherit; }
        input:focus, textarea:focus, select:focus { outline: none; }

        /* Subtle paper-like grid texture (used optionally in hero sections) */
        .bg-paper-grid {
          background-image:
            linear-gradient(rgba(26, 15, 46, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(26, 15, 46, 0.025) 1px, transparent 1px);
          background-size: 56px 56px;
        }

        /* Brand-tinted card — used on hero sections and the leadership dashboard */
        .bg-brand-soft { background: var(--brand-soft); }
        .bg-tinted     { background: var(--bg-tinted); }
        .bg-tinted-2   { background: var(--bg-tinted-2); }

        /* Scrollbar polish (Webkit only) */
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-thumb { background: rgba(26, 15, 46, 0.15); border-radius: 5px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(26, 15, 46, 0.25); }
        ::-webkit-scrollbar-track { background: transparent; }
      `}</style>
      {children}
    </div>
  )
}
