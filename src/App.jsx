import React, { useState, useEffect, useCallback } from 'react'
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
import FdeView from './FdeView'
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
  // 'self' | 'manager' | 'feature_requests' | 'integrations' | 'cancellations' | 'api_guide' | 'leadership'
  // Hydrate from sessionStorage so the user's current view survives across
  // tab switches and page reloads within the same browser session.
  const [viewMode, setViewModeRaw] = useState(() => {
    try {
      const stored = sessionStorage.getItem('atlas:viewMode')
      return stored || 'self'
    } catch { return 'self' }
  })
  // Wrap setViewMode so every state change writes through to sessionStorage.
  const setViewMode = useCallback((next) => {
    setViewModeRaw(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next
      try { sessionStorage.setItem('atlas:viewMode', resolved) } catch {}
      return resolved
    })
  }, [])

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
        // Only auto-set viewMode if there's no saved preference — i.e. first
        // load this browser session. Subsequent profile reloads (e.g. tab
        // regains focus and Supabase refreshes the session) must NOT clobber
        // the user's current view choice.
        // Landing logic: members → self, team leads → manager, executives → leadership.
        const landing =
          tier === 'executive' ? 'leadership'
          : tier === 'team_lead' ? 'manager'
          : 'self'
        try {
          if (!sessionStorage.getItem('atlas:viewMode')) {
            setViewMode(landing)
          }
        } catch {
          setViewMode(landing)
        }
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

  const handleSignOut = async () => {
    try {
      sessionStorage.removeItem('atlas:viewMode')
      sessionStorage.removeItem('atlas:viewingMemberId')
    } catch {}
    await supabase.auth.signOut()
  }

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

  // Shared pages (Feature Requests / Integrations / Cancellations) — first two visible to everyone with a profile;
  // cancellations is gated to executives + customer_success team (server-side via RLS too)
  if (viewMode === 'feature_requests' || viewMode === 'integrations' || viewMode === 'cancellations') {
    const canGoToSelf = !isLeadershipRole(profile.role_type)
    const canSeeLeadership = tier === 'executive'
    const canSeeCancellations = tier === 'executive' || profile.team === 'customer_success' || profile.team === 'forward_deployed'
    // If a non-CS, non-FDE, non-executive user somehow lands on cancellations, redirect to self.
    if (viewMode === 'cancellations' && !canSeeCancellations) {
      setViewMode('self')
      return null
    }
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
          onSwitchToCancellations={canSeeCancellations ? () => setViewMode('cancellations') : null}
          onSwitchToApiGuide={tier === 'executive' ? () => setViewMode('api_guide') : null}
          onSwitchToLeadership={canSeeLeadership ? () => setViewMode('leadership') : null}
          onProfileUpdated={setProfile}
        />
      </Shell>
    )
  }

  // API Integration Guide — executives only (technical infrastructure planning).
  // Block access if a non-executive somehow lands on this route via stale state.
  if (viewMode === 'api_guide') {
    if (tier !== 'executive') {
      setViewMode('self')
      return null
    }
    const canGoToSelf = !isLeadershipRole(profile.role_type)
    const canSeeLeadership = tier === 'executive'
    const canSeeCancellations = tier === 'executive' || profile.team === 'customer_success' || profile.team === 'forward_deployed'
    return (
      <Shell>
        <ApiIntegrationGuide
          profile={profile}
          onSignOut={handleSignOut}
          onSwitchToSelf={canGoToSelf ? () => setViewMode('self') : null}
          onSwitchToManager={canSeeManagerView ? () => setViewMode('manager') : null}
          onSwitchToFeatureRequests={() => setViewMode('feature_requests')}
          onSwitchToIntegrations={() => setViewMode('integrations')}
          onSwitchToCancellations={canSeeCancellations ? () => setViewMode('cancellations') : null}
          onSwitchToLeadership={canSeeLeadership ? () => setViewMode('leadership') : null}
          onProfileUpdated={setProfile}
        />
      </Shell>
    )
  }

  // Leadership Dashboard — gated by executive access
  if (viewMode === 'leadership' && tier === 'executive') {
    const canGoToSelf = !isLeadershipRole(profile.role_type)
    const canSeeCancellations = true // executives always have access
    return (
      <Shell>
        <LeadershipDashboardView
          profile={profile}
          onSignOut={handleSignOut}
          onSwitchToSelf={canGoToSelf ? () => setViewMode('self') : null}
          onSwitchToManager={canSeeManagerView ? () => setViewMode('manager') : null}
          onSwitchToFeatureRequests={() => setViewMode('feature_requests')}
          onSwitchToIntegrations={() => setViewMode('integrations')}
          onSwitchToCancellations={canSeeCancellations ? () => setViewMode('cancellations') : null}
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
    const canSeeCancellations = tier === 'executive' || profile.team === 'customer_success' || profile.team === 'forward_deployed'
    return (
      <Shell>
        <ManagerView
          profile={profile}
          onSignOut={handleSignOut}
          onSwitchToSelf={() => setViewMode('self')}
          onSwitchToFeatureRequests={() => setViewMode('feature_requests')}
          onSwitchToIntegrations={() => setViewMode('integrations')}
          onSwitchToCancellations={canSeeCancellations ? () => setViewMode('cancellations') : null}
          onSwitchToApiGuide={tier === 'executive' ? () => setViewMode('api_guide') : null}
          onSwitchToLeadership={tier === 'executive' ? () => setViewMode('leadership') : null}
        />
      </Shell>
    )
  }

  // For executives whose personal role is also Leadership (no scorecard),
  // there's no useful "self view" — bounce them to manager view.
  if (canSeeManagerView && viewMode === 'self' && isLeadershipRole(profile.role_type)) {
    const canSeeCancellations = tier === 'executive' || profile.team === 'customer_success' || profile.team === 'forward_deployed'
    return (
      <Shell>
        <ManagerView
          profile={profile}
          onSignOut={handleSignOut}
          onSwitchToSelf={() => setViewMode('self')}
          onSwitchToFeatureRequests={() => setViewMode('feature_requests')}
          onSwitchToIntegrations={() => setViewMode('integrations')}
          onSwitchToCancellations={canSeeCancellations ? () => setViewMode('cancellations') : null}
          onSwitchToApiGuide={tier === 'executive' ? () => setViewMode('api_guide') : null}
          onSwitchToLeadership={tier === 'executive' ? () => setViewMode('leadership') : null}
        />
      </Shell>
    )
  }

  // Personal scorecard — route based on role
  // Permissions for the side-buttons in the scorecard header:
  //  - API Setup is technical infrastructure for executives only.
  //  - Cancellations is for executives + CS team + FDE team.
  const canSeeCancellationsForSelf = tier === 'executive' || profile.team === 'customer_success' || profile.team === 'forward_deployed'
  const canSeeApiGuideForSelf = tier === 'executive'
  return (
    <Shell>
      <PersonalScorecard
        profile={profile}
        onSignOut={handleSignOut}
        onSwitchToManager={canSeeManagerView ? () => setViewMode('manager') : null}
        onSwitchToFeatureRequests={() => setViewMode('feature_requests')}
        onSwitchToIntegrations={() => setViewMode('integrations')}
        onSwitchToCancellations={canSeeCancellationsForSelf ? () => setViewMode('cancellations') : null}
        onSwitchToApiGuide={canSeeApiGuideForSelf ? () => setViewMode('api_guide') : null}
        onSwitchToLeadership={tier === 'executive' ? () => setViewMode('leadership') : null}
        onProfileUpdated={setProfile}
      />
    </Shell>
  )
}

// Routes to the right scorecard component based on the user's role.
function PersonalScorecard({ profile, onSignOut, onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership, onProfileUpdated }) {
  const role = profile.role_type
  const props = { profile, onSignOut, onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership, onProfileUpdated }
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
    case 'forward_deployed_engineer':
    case 'forward_deployed_engineer_lead':
      return <FdeView {...props} />
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

      {/* ============================================================
          Liquid Glass — global SVG filter for refraction/lensing.
          Defined once, referenced by `filter: url(#liquid-lens-*)`.
          Display:none keeps it from rendering as content.
          ============================================================ */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <defs>
          {/* Light glass: subtle lensing for thin nav surfaces (toolbars, tabs) */}
          <filter id="liquid-lens-thin" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.020" numOctaves="2" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="3" />
          </filter>
          {/* Heavier glass: more pronounced lensing for larger surfaces (modal, sidebar) */}
          <filter id="liquid-lens-thick" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="6" />
          </filter>
        </defs>
      </svg>

      <style>{`
        /* ============================================================
           Atlas Odyssey · Design System
           Soft off-white canvas with brand purple accents.
           Liquid Glass applied to navigation surfaces only.
           ============================================================ */
        :root {
          /* Background system */
          --bg:           #FAFAF7;
          --bg-deep:      #F4F2EE;
          --bg-tinted:    #F3EFF7;
          --bg-tinted-2:  #E8E1F0;

          /* Surface */
          --surface:      #FFFFFF;
          --surface-2:    #F8F7FB;
          --surface-soft: rgba(255, 255, 255, 0.7);

          /* Borders */
          --border:        rgba(26, 15, 46, 0.14);
          --border-soft:   rgba(26, 15, 46, 0.08);
          --border-strong: rgba(26, 15, 46, 0.22);

          /* Text */
          --text:    #0F0825;
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

          /* Semantic */
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

          /* Shadows — soft, brand-tinted, NOT material-design heavy */
          --shadow-sm:    0 1px 2px rgba(26, 15, 46, 0.05), 0 1px 0 rgba(255, 255, 255, 0.9) inset;
          --shadow-md:    0 2px 4px rgba(26, 15, 46, 0.05), 0 12px 32px -8px rgba(102, 57, 166, 0.10), 0 1px 0 rgba(255, 255, 255, 0.9) inset;
          --shadow-card:  0 1px 2px rgba(26, 15, 46, 0.04);

          /* Liquid Glass tokens */
          --glass-radius-nav:    16px;       /* navigation chrome corner radius */
          --glass-radius-tabs:   12px;       /* concentric: 16 - 4 inset */
          --glass-radius-modal:  20px;       /* larger surface, larger radius */
          --glass-radius-toast:  10px;
          --glass-pointer-mx:    50%;        /* default illumination origin */
          --glass-pointer-my:    50%;
          --glass-press:         0;          /* 0 = idle, 1 = pressed */
        }

        body { background: var(--bg); color: var(--text); }
        html, body { font-family: 'Manrope', system-ui, sans-serif; }

        /* Subtle grain on the body — gives Liquid Glass something to refract.
           Without this, lensing is nearly invisible on the flat off-white canvas. */
        body::before {
          content: '';
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background-image:
            linear-gradient(rgba(102, 57, 166, 0.022) 1px, transparent 1px),
            linear-gradient(90deg, rgba(102, 57, 166, 0.022) 1px, transparent 1px);
          background-size: 56px 56px;
        }

        /* Typography */
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

        /* Glass materialization — replaces fade-in for glass surfaces.
           Modulates lensing intensity instead of opacity. */
        @keyframes glass-materialize {
          from {
            opacity: 0;
            filter: blur(4px);
            transform: translateY(-2px);
          }
          to {
            opacity: 1;
            filter: blur(0);
            transform: translateY(0);
          }
        }
        .glass-materialize { animation: glass-materialize 320ms cubic-bezier(0.2, 0.7, 0.3, 1) both; }

        /* Form polish */
        input, textarea, select { font-family: inherit; }
        input:focus, textarea:focus, select:focus { outline: none; }

        /* ============================================================
           LIQUID GLASS — NAVIGATION CHROME
           ============================================================
           5-layer composition per the doctrine:
             1. Refraction (backdrop-filter blur + saturate + SVG lens)
             2. Adaptive tint (thin specular tint via gradient)
             3. Highlights (inset rim light along top edge)
             4. Adaptive shadow (low-opacity outer + inner fill)
             5. Interactive illumination (pointer-tracked radial gradient)
           ============================================================ */

        /* Base glass — variant: Regular. Used on toolbars/headers (thin glass). */
        .glass-nav {
          position: relative;

          /* Layer 1: Refraction — chained backdrop filters.
             saturate() recovers the vibrancy that pure blur kills.
             contrast() restores the punch lost to translucency.
             The SVG displacement filter is applied via a pseudo-element below
             so it doesn't interact with content. */
          backdrop-filter: blur(20px) saturate(180%) contrast(105%);
          -webkit-backdrop-filter: blur(20px) saturate(180%) contrast(105%);

          /* Layer 2: Adaptive tint — gradient from slightly more opaque at the
             top to less opaque below, simulating how real glass catches light
             from above. NOT a solid background-color — the doctrine forbids it. */
          background:
            radial-gradient(
              circle at var(--glass-pointer-mx) var(--glass-pointer-my),
              rgba(255, 255, 255, calc(0.10 + var(--glass-press) * 0.18)),
              rgba(255, 255, 255, 0) 50%
            ),
            linear-gradient(180deg, rgba(255, 255, 255, 0.78) 0%, rgba(255, 255, 255, 0.62) 100%);

          /* Layer 3: Highlight rim. The inset white line at the top edge is the
             specular catch you get on real glass under overhead lighting. */
          border: 1px solid rgba(255, 255, 255, 0.55);
          box-shadow:
            /* Outer shadow — soft, brand-tinted, low opacity. Not Material Design heavy. */
            0 4px 16px -6px rgba(102, 57, 166, 0.12),
            0 1px 2px rgba(26, 15, 46, 0.04),
            /* Layer 3 (cont.): top rim highlight via inset shadow */
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            /* Bottom shadow — adaptive, deepens over content (approximated) */
            inset 0 -1px 0 rgba(26, 15, 46, 0.04);

          border-radius: var(--glass-radius-nav);
          transition:
            box-shadow 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
            background 180ms ease-out;
        }

        /* Layer 4: Adaptive shadow gets darker on hover — implies the glass
           "rises" slightly off the canvas. */
        .glass-nav:hover {
          box-shadow:
            0 8px 24px -8px rgba(102, 57, 166, 0.18),
            0 2px 4px rgba(26, 15, 46, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.95),
            inset 0 -1px 0 rgba(26, 15, 46, 0.05);
        }

        /* Layer 5: Press illumination — handled via --glass-press CSS var
           (set by JS pointerdown/up listeners). The radial gradient in the
           background grows brighter under the fingertip on press. */

        /* Sticky header variant — full-width strip, no rounded corners on
           the long axis, lift via shadow only */
        .glass-nav-strip {
          /* Inherits Liquid Glass from glass-nav, but shaped as a strip */
          border-radius: 0;
          border-left: none;
          border-right: none;
          border-top: none;
          /* Specifically: a sticky strip wants a hard bottom edge with hairline */
          border-bottom: 1px solid rgba(102, 57, 166, 0.10);
        }

        /* Section tabs — concentric corner radius, child of nav surface.
           These need to "pop" off lavender / off-white backgrounds, so we
           use higher opacity + a soft brand-tinted lift shadow. */
        .glass-tab {
          position: relative;
          backdrop-filter: blur(14px) saturate(170%);
          -webkit-backdrop-filter: blur(14px) saturate(170%);
          background:
            radial-gradient(
              circle at var(--glass-pointer-mx) var(--glass-pointer-my),
              rgba(255, 255, 255, calc(0.18 + var(--glass-press) * 0.22)),
              rgba(255, 255, 255, 0) 60%
            ),
            linear-gradient(180deg, rgba(255, 255, 255, 0.78) 0%, rgba(255, 255, 255, 0.62) 100%);
          border: 1px solid rgba(255, 255, 255, 0.7);
          border-radius: var(--glass-radius-tabs);
          /* Lift shadow — gives the "floating off the page" feel */
          box-shadow:
            0 6px 16px -8px rgba(102, 57, 166, 0.18),
            0 1px 2px rgba(26, 15, 46, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.85);
          transition: background 160ms ease-out, box-shadow 220ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .glass-tab:hover {
          background:
            radial-gradient(
              circle at var(--glass-pointer-mx) var(--glass-pointer-my),
              rgba(255, 255, 255, 0.40),
              rgba(255, 255, 255, 0) 60%
            ),
            linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.78) 100%);
          box-shadow:
            0 10px 22px -8px rgba(102, 57, 166, 0.26),
            0 2px 4px rgba(26, 15, 46, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.95);
          transform: translateY(-1px);
        }

        /* Active tab state — uses tinting model (color modulated by content
           brightness), not solid fill. Keeps the glass character.
           Stronger purple presence + more pronounced lift than default tabs. */
        .glass-tab-active {
          background:
            radial-gradient(
              circle at var(--glass-pointer-mx) var(--glass-pointer-my),
              rgba(102, 57, 166, calc(0.36 + var(--glass-press) * 0.20)),
              rgba(102, 57, 166, 0.18) 60%
            ),
            linear-gradient(180deg, rgba(102, 57, 166, 0.30) 0%, rgba(102, 57, 166, 0.18) 100%);
          border: 1px solid rgba(102, 57, 166, 0.45);
          color: var(--brand-deep);
          font-weight: 600;
          box-shadow:
            0 8px 20px -6px rgba(102, 57, 166, 0.36),
            0 2px 4px rgba(26, 15, 46, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.5);
        }
        .glass-tab-active:hover {
          background:
            radial-gradient(
              circle at var(--glass-pointer-mx) var(--glass-pointer-my),
              rgba(102, 57, 166, 0.45),
              rgba(102, 57, 166, 0.22) 60%
            ),
            linear-gradient(180deg, rgba(102, 57, 166, 0.36) 0%, rgba(102, 57, 166, 0.22) 100%);
          box-shadow:
            0 12px 26px -8px rgba(102, 57, 166, 0.44),
            0 3px 6px rgba(26, 15, 46, 0.10),
            inset 0 1px 0 rgba(255, 255, 255, 0.55);
          transform: translateY(-1px);
        }

        /* Modal — thicker glass for larger surface (per Section 3 of doctrine) */
        .glass-modal {
          position: relative;
          backdrop-filter: blur(40px) saturate(180%) contrast(105%);
          -webkit-backdrop-filter: blur(40px) saturate(180%) contrast(105%);
          background:
            radial-gradient(
              circle at var(--glass-pointer-mx) var(--glass-pointer-my),
              rgba(255, 255, 255, 0.30),
              rgba(255, 255, 255, 0) 60%
            ),
            linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.78) 100%);
          border: 1px solid rgba(255, 255, 255, 0.7);
          border-radius: var(--glass-radius-modal);
          box-shadow:
            /* Bigger surface = bigger but still soft outer shadow */
            0 32px 64px -24px rgba(26, 15, 46, 0.32),
            0 4px 12px -2px rgba(102, 57, 166, 0.16),
            inset 0 1px 0 rgba(255, 255, 255, 0.95);
        }

        /* Save indicator toast — small pill that lives in the header.
           NOTE: doctrine forbids glass-on-glass. So when this toast sits inside
           the .glass-nav header, we don't render it as glass — it becomes a
           tinted vibrancy fill. The .glass-toast class is used only when the
           toast is on the content layer (not currently used in this app). */
        .glass-vibrancy-pill {
          background: rgba(16, 185, 129, 0.16);
          color: #047857;
          border: 1px solid rgba(16, 185, 129, 0.32);
          border-radius: 9999px;
          padding: 4px 10px;
        }

        /* ============================================================
           Fallbacks for browsers without backdrop-filter.
           Falls back to a high-opacity solid surface that respects the same
           color logic, never a broken transparent panel.
           ============================================================ */
        @supports not (backdrop-filter: blur(1px)) {
          .glass-nav, .glass-nav-strip, .glass-modal, .glass-tab {
            background: rgba(255, 255, 255, 0.96);
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
          .glass-tab-active {
            background: rgba(102, 57, 166, 0.12);
          }
        }

        /* ============================================================
           Accessibility — non-negotiable per the doctrine.
           ============================================================ */

        /* prefers-reduced-transparency:
           Glass becomes solid (frosty obscures the backdrop). */
        @media (prefers-reduced-transparency: reduce) {
          .glass-nav, .glass-nav-strip {
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
          .glass-modal {
            background: #FFFFFF;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
          .glass-tab {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
          .glass-tab-active {
            background: rgba(102, 57, 166, 0.16);
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
        }

        /* prefers-contrast: more —
           predominantly black or white surfaces with contrasting borders.
           Lensing yields to legibility. */
        @media (prefers-contrast: more) {
          .glass-nav, .glass-nav-strip, .glass-modal {
            background: #FFFFFF;
            border: 2px solid var(--text);
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
          .glass-tab {
            background: #FFFFFF;
            border: 1px solid var(--text);
            color: var(--text);
          }
          .glass-tab-active {
            background: var(--text);
            color: #FFFFFF;
            border: 1px solid var(--text);
          }
        }

        /* prefers-reduced-motion:
           disable elastic/gel properties, simplify transitions, drop the
           pointer-tracked illumination spread animation. */
        @media (prefers-reduced-motion: reduce) {
          .glass-nav, .glass-nav-strip, .glass-tab, .glass-tab-active, .glass-modal {
            transition: none;
          }
          .glass-nav, .glass-nav-strip, .glass-tab, .glass-tab-active {
            background:
              linear-gradient(180deg, rgba(255, 255, 255, 0.78) 0%, rgba(255, 255, 255, 0.62) 100%);
          }
          .glass-tab-active {
            background:
              linear-gradient(180deg, rgba(102, 57, 166, 0.18) 0%, rgba(102, 57, 166, 0.10) 100%);
          }
          .fade-up, .glass-materialize { animation: none; }
        }

        /* Scrollbar polish */
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-thumb { background: rgba(26, 15, 46, 0.15); border-radius: 5px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(26, 15, 46, 0.25); }
        ::-webkit-scrollbar-track { background: transparent; }

        /* Brand-soft + tinted utility classes */
        .bg-brand-soft { background: var(--brand-soft); }
        .bg-tinted     { background: var(--bg-tinted); }
        .bg-tinted-2   { background: var(--bg-tinted-2); }
      `}</style>
      {children}
    </div>
  )
}
