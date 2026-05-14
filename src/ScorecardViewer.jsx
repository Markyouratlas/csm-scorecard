import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, ArrowLeft, AlertCircle } from 'lucide-react'
import CsmView from './CsmView'
import ImplementationView from './ImplementationView'
import SupportView from './SupportView'
import AeView from './AeView'
import GrowthView from './GrowthView'
import AdStrategistView from './AdStrategistView'
import EngineerView from './EngineerView'
import FdeView from './FdeView'
import ComingSoonView from './ComingSoonView'
import { getWeekKey, formatWeekLabel, stepWeek } from './dateUtils'

// Renders the appropriate scorecard for a target user, with a week-navigator
// at the top and a back button. Used by the Manager Dashboard to drill into
// any team member's scorecard.
//
// Props:
//   targetProfile  — the profile whose scorecard we want to view
//   viewer         — the currently-authenticated user (executive)
//   onSignOut      — sign out the viewer's session
//   onBack         — called when the back button is clicked
export default function ScorecardViewer({ targetProfile, viewer, onSignOut, onBack }) {
  const [weekKey, setWeekKey] = useState(getWeekKey())

  const isViewingSelf = targetProfile.id === viewer.id

  // Pick the right scorecard component based on target's role
  const ScorecardComponent = pickComponent(targetProfile.role_type)

  return (
    <div className="min-h-screen">
      {/* Banner — only shown when viewing someone else */}
      {!isViewingSelf && (
        <div style={{ backgroundColor: '#F5F0FA', borderColor: '#D8C7EE' }} className="border-b px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#6639a6' }} />
              <div className="text-sm" style={{ color: '#3D1F66' }}>
                <strong>Viewing as {targetProfile.name}</strong>
                <span className="mx-2 opacity-60">·</span>
                <span className="opacity-80">Any edits will save to their scorecard.</span>
              </div>
            </div>
            <button onClick={onBack} style={{ color: '#3D1F66' }} className="flex items-center gap-1.5 text-sm font-medium hover:opacity-80 px-3 py-1.5 hover:bg-white/40 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to dashboard
            </button>
          </div>
        </div>
      )}

      {/* Week navigator */}
      <div className="bg-stone-100/60 border-b border-stone-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-3">
          <button
            onClick={() => setWeekKey(stepWeek(weekKey, -1))}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-stone-700 hover:text-stone-900 hover:bg-stone-200 transition-colors"
            title="Previous week"
          >
            <ChevronLeft className="w-4 h-4" /> Previous week
          </button>
          <div className="flex flex-col items-center px-4 py-1 min-w-[200px]">
            <div className="mono-font text-[9px] uppercase tracking-widest text-stone-500">Viewing</div>
            <div className="font-medium text-stone-900 num-tabular text-sm">Week of {formatWeekLabel(weekKey)}</div>
          </div>
          <button
            onClick={() => setWeekKey(stepWeek(weekKey, 1))}
            disabled={weekKey >= getWeekKey()}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-stone-700 hover:text-stone-900 hover:bg-stone-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Next week"
          >
            Next week <ChevronRight className="w-4 h-4" />
          </button>
          {weekKey !== getWeekKey() && (
            <button
              onClick={() => setWeekKey(getWeekKey())}
              className="ml-2 px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 underline"
            >
              Jump to current
            </button>
          )}
        </div>
      </div>

      {/* The actual scorecard. Note we pass the TARGET profile, not the viewer.
          Key=weekKey ensures the component re-mounts when week changes.
          onSignOut signs out the VIEWER's session (the executive who's drilling in),
          not the target user — that's a session-level action on the auth session. */}
      <ScorecardComponent
        key={`${targetProfile.id}-${weekKey}`}
        profile={targetProfile}
        weekKey={weekKey}
        onSignOut={onSignOut || (() => {})}
        onSwitchToManager={onBack}      // "Manager view" doubles as back-to-dashboard
        onProfileUpdated={() => {}}     // edits to the viewed user's profile not supported here
      />
    </div>
  )
}

// Picks the correct scorecard component for a given role_type.
// Mirrors the logic in App.jsx's PersonalScorecard router.
function pickComponent(roleType) {
  switch (roleType) {
    case 'csm':                return CsmView
    case 'implementation':     return ImplementationView
    case 'support':            return SupportView
    case 'account_executive':  return AeView
    case 'growth_manager':     return GrowthView
    case 'ad_strategist':      return AdStrategistView
    case 'engineer':           return EngineerView
    case 'forward_deployed_engineer':       return FdeView
    case 'forward_deployed_engineer_lead':  return FdeView
    default:                   return ComingSoonView
  }
}
