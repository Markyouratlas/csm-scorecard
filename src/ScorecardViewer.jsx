import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, ArrowLeft, AlertCircle, Pencil, Eye, Lock } from 'lucide-react'
import { ScorecardEditContext } from './ScorecardEditContext'
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
  const [editMode, setEditMode] = useState(false)

  React.useEffect(() => { setEditMode(false) }, [weekKey])

  const isViewingSelf = targetProfile.id === viewer.id

  // Pick the right scorecard component based on target's role
  const ScorecardComponent = pickComponent(targetProfile.role_type)

  return (
    <div className="min-h-screen">
      {/* Banner — only shown when viewing someone else */}
      {!isViewingSelf && (
        <div
          style={editMode
            ? { backgroundColor: '#FEF3E2', borderColor: '#F5C97B' }
            : { backgroundColor: '#F5F0FA', borderColor: '#D8C7EE' }}
          className="border-b px-6 py-3"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0"
                style={{ color: editMode ? '#B45309' : '#6639a6' }} />
              <div className="text-sm" style={{ color: editMode ? '#7A3E00' : '#3D1F66' }}>
                <strong>{editMode ? `Editing ${targetProfile.name}'s scorecard` : `Viewing ${targetProfile.name}`}</strong>
                <span className="mx-2 opacity-60">·</span>
                <span className="opacity-80">{editMode ? 'Changes auto-save as you type' : 'Read-only'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditMode(v => !v)}
                style={{ color: editMode ? '#7A3E00' : '#3D1F66' }}
                className="flex items-center gap-1.5 text-sm font-medium hover:opacity-80 px-3 py-1.5 hover:bg-white/50 transition-colors border"
              >
                {editMode ? <><Eye className="w-4 h-4" /> Done editing</> : <><Pencil className="w-4 h-4" /> Edit scorecard</>}
              </button>
              <button onClick={onBack} style={{ color: '#3D1F66' }} className="flex items-center gap-1.5 text-sm font-medium hover:opacity-80 px-3 py-1.5 hover:bg-white/40 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Week navigator — hidden for the Growth view, which renders its own
          inline WeekNavigator between the hero and the section tabs. */}
      {targetProfile.role_type !== 'growth_manager' && (
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
      )}

      {/* The actual scorecard. Note we pass the TARGET profile, not the viewer.
          Key=weekKey ensures the component re-mounts when week changes.
          onSignOut signs out the VIEWER's session (the executive who's drilling in),
          not the target user — that's a session-level action on the auth session. */}
      <ScorecardEditContext.Provider value={editMode}>
        <div className={!isViewingSelf && !editMode ? 'scorecard-readonly' : undefined}>
          <ScorecardComponent
            // Growth renders its own inline week nav and reloads on weekKey via
            // useScorecard's effect, so it must NOT remount on week change (that
            // would reset the selected section). Other roles keep the historic
            // remount-per-week behavior.
            key={targetProfile.role_type === 'growth_manager' ? targetProfile.id : `${targetProfile.id}-${weekKey}`}
            profile={targetProfile}
            weekKey={weekKey}
            setWeekKey={setWeekKey}
            onSignOut={onSignOut || (() => {})}
            onSwitchToManager={onBack}      // "Manager view" doubles as back-to-dashboard
            onProfileUpdated={() => {}}     // edits to the viewed user's profile not supported here
          />
        </div>
      </ScorecardEditContext.Provider>

      {!isViewingSelf && !editMode && (
        <>
          <style>{`
            .scorecard-readonly input,
            .scorecard-readonly textarea,
            .scorecard-readonly select {
              pointer-events: none !important;
              background-color: #f5f5f4 !important;
              color: #78716c !important;
              cursor: not-allowed !important;
            }
          `}</style>
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium"
            style={{ backgroundColor: '#3D1F66', color: '#ffffff' }}
          >
            <Lock className="w-4 h-4" /> Read-only — click "Edit scorecard" above to make changes
          </div>
        </>
      )}
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
