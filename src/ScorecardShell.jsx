import React, { useState, useMemo } from 'react'
import { LogOut, LayoutDashboard, Loader2, Check, Settings as SettingsIcon, Lightbulb, Plug, Crown, Zap, UserMinus, ChevronLeft, ChevronRight, Lock, Send, Info } from 'lucide-react'
import { getRoleLabel } from './teams'
import { formatWeekLabel, stepWeek } from './dateUtils'
import SettingsModal from './SettingsModal'
import AtlasLogo from './AtlasLogo'
import HeaderNav from './HeaderNav'
import { useGlassInteraction } from './hooks/useGlassInteraction.js'

// Brand purple — used for the Leadership entry point so it stands out
const BRAND = '#6639A6'
const BRAND_SOFT = 'rgba(102, 57, 166, 0.08)'

// Standard header used by every role's scorecard.
// Children = the question/title and content of the page.
//
// Submission props (all optional — when omitted, the shell renders the way
// it did before Batch 7):
//   • weekKey, setWeekKey, isExecDrillIn, isViewingCurrentWeek, currentWeekKey
//     → drive the week navigator strip and the dynamic Submit copy
//   • submittedAt, isLocked, submit, unsubmit, submitting
//     → drive the banner, the bottom footer, and the visual lock wrapper
export default function ScorecardShell({
  profile,
  weekKey,
  setWeekKey,
  isExecDrillIn,
  isViewingCurrentWeek,
  currentWeekKey,
  submittedAt,
  isLocked,
  submit,
  unsubmit,
  submitting,
  saving,
  savedAt,
  onSignOut,
  onSwitchToManager,
  onSwitchToFeatureRequests,
  onSwitchToFulfillment,
  onSwitchToIntegrations,
  onSwitchToCancellations,
  onSwitchToApiGuide,
  onSwitchToLeadership,
  onSwitchToCommissions,
  onSwitchToSelf,
  onProfileUpdated,
  currentPage,
  title,
  subtitle,
  hideWeekNav,
  children,
}) {
  const [showSettings, setShowSettings] = useState(false)
  const headerRef = useGlassInteraction()
  // Submission UI is only relevant when the hook is providing submission
  // state. Older call sites that don't pass these props still get the
  // historic shell behaviour with no Submit chrome.
  const hasSubmissionUI = typeof submit === 'function'
  return (
    <div className="min-h-screen">
      <header ref={headerRef} className="glass-nav glass-nav-strip sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          {title ? (
            // Page-title variant (SharedPagesView style) — used by non-scorecard
            // pages mounted in the shell (e.g. Commissions).
            <div className="flex items-center gap-4">
              <AtlasLogo height={32} />
              <div className="border-l border-stone-300 pl-4">
                <div className="display-font text-lg font-medium text-stone-900 leading-tight">
                  {title}
                </div>
                {subtitle && (
                  <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">
                    {subtitle}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <AtlasLogo height={28} />
              <div className="hidden md:block h-8 w-px bg-stone-300" />
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0" style={{ background: profile.color, fontFamily: "'Instrument Serif', serif" }}>
                  {profile.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <div className="display-font text-base font-medium text-stone-900 leading-tight">{profile.name}</div>
                  <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">
                    {profile.title || getRoleLabel(profile.team, profile.role_type)}
                  </div>
                </div>
              </div>
            </div>
          )}
          <HeaderNav
            currentPage={currentPage ?? (isExecDrillIn ? undefined : 'self')}
            onSwitchToLeadership={onSwitchToLeadership}
            onSwitchToIntegrations={onSwitchToIntegrations}
            onSwitchToFeatureRequests={onSwitchToFeatureRequests}
            onSwitchToFulfillment={onSwitchToFulfillment}
            onSwitchToCancellations={onSwitchToCancellations}
            onSwitchToCommissions={onSwitchToCommissions}
            onSwitchToApiGuide={onSwitchToApiGuide}
            onSwitchToManager={onSwitchToManager}
            onSwitchToSelf={onSwitchToSelf}
            onOpenSettings={() => setShowSettings(true)}
            onSignOut={onSignOut}
          >
            <SaveIndicator saving={saving} savedAt={savedAt} />
          </HeaderNav>
        </div>
      </header>

      {/* Week navigator — only when user is on their OWN scorecard
          (exec drill-in has its own week nav in ScorecardViewer). Views that
          render their own inline WeekNavigator pass hideWeekNav to suppress this. */}
      {hasSubmissionUI && !isExecDrillIn && setWeekKey && !hideWeekNav && (
        <div className="bg-stone-100/60 border-b border-stone-200 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => setWeekKey(stepWeek(weekKey, -1))}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-stone-700 hover:text-stone-900 hover:bg-stone-200 transition-colors rounded"
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
              disabled={weekKey >= currentWeekKey}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-stone-700 hover:text-stone-900 hover:bg-stone-200 transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next week"
            >
              Next week <ChevronRight className="w-4 h-4" />
            </button>
            {!isViewingCurrentWeek && (
              <button
                onClick={() => setWeekKey(currentWeekKey)}
                className="ml-2 px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 underline"
              >
                Jump to current
              </button>
            )}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Submitted banner */}
        {hasSubmissionUI && submittedAt && (
          <SubmittedBanner
            submittedAt={submittedAt}
            canUnsubmit={isViewingCurrentWeek}
            onUnsubmit={unsubmit}
            submitting={submitting}
          />
        )}

        {/* Lock wrapper around page body. When locked we dim the content and
            block pointer events so users can read but not edit. */}
        <div
          style={isLocked ? { pointerEvents: 'none', opacity: 0.75, filter: 'saturate(0.85)' } : undefined}
        >
          {children}
        </div>

        {/* Submit footer — only when not already submitted and not exec drill-in */}
        {hasSubmissionUI && !isExecDrillIn && !submittedAt && (
          <SubmitFooter
            onSubmit={submit}
            submitting={submitting}
            isCurrentWeek={isViewingCurrentWeek}
          />
        )}
      </div>
      {showSettings && (
        <SettingsModal
          profile={profile}
          onClose={() => setShowSettings(false)}
          onSaved={onProfileUpdated}
        />
      )}
    </div>
  )
}

function SaveIndicator({ saving, savedAt }) {
  if (saving) return <div className="flex items-center gap-1.5 text-xs text-stone-500 px-2"><Loader2 className="w-3 h-3 animate-spin" /> Saving</div>
  if (savedAt) return <div className="glass-vibrancy-pill flex items-center gap-1.5 text-xs"><Check className="w-3 h-3" /> Saved</div>
  return null
}

// Banner at the top of the page once the week is submitted. During the
// current week the user can unsubmit; after Monday rolls over the banner
// becomes informational only (DB policy locks edits too).
function SubmittedBanner({ submittedAt, canUnsubmit, onUnsubmit, submitting }) {
  const stamp = useMemo(() => {
    try {
      const d = new Date(submittedAt)
      return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    } catch { return '' }
  }, [submittedAt])
  return (
    <div
      className="mb-8 flex items-center justify-between gap-4 px-5 py-4 rounded-lg flex-wrap"
      style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%)',
        border: '1px solid rgba(16,185,129,0.25)',
      }}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#10B981' }}>
          <Check className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-medium text-emerald-900 text-sm">Week submitted</div>
          <div className="text-xs text-emerald-800/70">Submitted on {stamp} — this week is now locked.</div>
        </div>
      </div>
      {canUnsubmit && (
        <button
          onClick={onUnsubmit}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-900 hover:text-emerald-950 bg-white/60 hover:bg-white border border-emerald-300 hover:border-emerald-400 rounded transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
          Unsubmit & edit
        </button>
      )}
    </div>
  )
}

// Bottom-of-page submit CTA. Two-step: click "Submit this week" to reveal
// Cancel + Confirm — small friction layer to prevent accidental submits.
function SubmitFooter({ onSubmit, submitting, isCurrentWeek }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="mt-10 mb-2 fade-up" style={{ animationDelay: '200ms' }}>
      <div className="bg-white border border-stone-200 p-6 flex items-center justify-between gap-6 flex-wrap">
        <div>
          <div className="display-font text-xl font-medium text-stone-900 mb-1">Ready to wrap up the week?</div>
          <p className="text-sm text-stone-600 max-w-md">
            Submit your scorecard to lock in this week's results.
            {isCurrentWeek ? ' You can still unsubmit and edit until Monday.' : ' Once submitted, only an admin can unlock it.'}
          </p>
        </div>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-stone-900 hover:bg-stone-800 text-white font-medium transition-colors rounded"
          >
            <Send className="w-4 h-4" /> Submit this week
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={submitting}
              className="px-3 py-2 text-sm text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors rounded disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Confirm submit
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
//  Shared widgets — used by every role's view
// ============================================================================

export function NorthStarTile({ label, value, unit, sublabel, color, icon: Icon, tooltip }) {
  return (
    // overflow-visible only when a tooltip is present, so the hover bubble isn't clipped.
    <div className={`bg-white border border-stone-200 p-6 relative ${tooltip ? 'overflow-visible' : 'overflow-hidden'}`}>
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
          {tooltip && (
            <span className="group relative inline-flex shrink-0">
              <Info className="w-3 h-3 text-stone-400 hover:text-stone-600 cursor-help" />
              <span className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-150 absolute left-0 top-5 z-30 w-60 p-2.5 rounded-md bg-stone-900 text-stone-100 text-[11px] leading-snug shadow-xl pointer-events-none normal-case tracking-normal text-left font-normal">
                {tooltip}
              </span>
            </span>
          )}
        </div>
        {Icon && <Icon className="w-4 h-4 text-stone-400" />}
      </div>
      <div className="display-font text-5xl font-medium text-stone-900 num-tabular leading-none">
        {value}
        {unit && <span className="text-xl text-stone-400 ml-2 font-normal">{unit}</span>}
      </div>
      <div className="text-xs text-stone-500 mt-3">{sublabel}</div>
    </div>
  )
}

export function NumberField({ label, value, onChange, unit, highlight, help }) {
  return (
    <div className={`border p-4 ${highlight ? 'border-amber-400 bg-amber-50/40' : 'border-stone-200'}`}>
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">{label}</div>
      <div className="flex items-baseline gap-2">
        <input type="number" min="0" step="any" value={value || ''} onChange={(e) => onChange(e.target.value)}
          className="w-full py-2 px-3 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-2xl display-font font-medium bg-transparent" />
        {unit && <span className="text-sm text-stone-500">{unit}</span>}
      </div>
      {help && <div className="text-[11px] text-stone-500 mt-2 leading-snug">{help}</div>}
    </div>
  )
}

export function MoneyField({ label, value, onChange, help, highlight }) {
  return (
    <div className={`border p-4 ${highlight ? 'border-amber-400 bg-amber-50/40' : 'border-stone-200'}`}>
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-stone-500 display-font text-2xl">$</span>
        <input type="number" min="0" step="any" value={value || ''} onChange={(e) => onChange(e.target.value)}
          className="w-full py-2 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-2xl display-font font-medium bg-transparent" />
      </div>
      {help && <div className="text-[11px] text-stone-500 mt-2 leading-snug">{help}</div>}
    </div>
  )
}

export function TextField({ label, value, onChange, placeholder }) {
  return (
    <div className="border border-stone-200 p-4">
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">{label}</div>
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full py-2 px-3 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-2xl display-font font-medium bg-transparent" />
    </div>
  )
}

export function SectionTabs({ sections, active, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 mb-8 fade-up" style={{ animationDelay: '120ms' }}>
      {sections.map(s => {
        const Icon = s.icon
        const isActive = active === s.id
        return (
          <GlassTab key={s.id} active={isActive} onClick={() => onChange(s.id)}>
            {Icon && <Icon className="w-4 h-4" />} {s.label}
          </GlassTab>
        )
      })}
    </div>
  )
}

// Reusable week navigator (Prev / current week / Next / Jump to current). Used
// inline by views that want it positioned within the page body (e.g. between the
// hero and the section tabs) instead of the shell's default full-width top strip.
// Returns null when no setter is available (e.g. an exec drill-in that hasn't
// wired a week setter), so callers can render it unconditionally.
export function WeekNavigator({ weekKey, setWeekKey, currentWeekKey, isViewingCurrentWeek }) {
  if (!setWeekKey || !weekKey) return null
  return (
    // pointerEvents:auto keeps week navigation clickable even when an inline
    // placement sits inside the shell's locked/dimmed body wrapper.
    <div className="bg-stone-100/60 border border-stone-200 rounded-lg px-4 py-2.5 mb-8 fade-up" style={{ pointerEvents: 'auto' }}>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <button
          onClick={() => setWeekKey(stepWeek(weekKey, -1))}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-stone-700 hover:text-stone-900 hover:bg-stone-200 transition-colors rounded"
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
          disabled={currentWeekKey && weekKey >= currentWeekKey}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-stone-700 hover:text-stone-900 hover:bg-stone-200 transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
          title="Next week"
        >
          Next week <ChevronRight className="w-4 h-4" />
        </button>
        {!isViewingCurrentWeek && currentWeekKey && (
          <button
            onClick={() => setWeekKey(currentWeekKey)}
            className="ml-2 px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 underline"
          >
            Jump to current
          </button>
        )}
      </div>
    </div>
  )
}

// Each tab is a glass surface — needs its own pointer-tracking ref.
function GlassTab({ active, onClick, children }) {
  const ref = useGlassInteraction()
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm transition-all ${active ? 'glass-tab glass-tab-active' : 'glass-tab text-stone-700'}`}
    >
      {children}
    </button>
  )
}

export function PageHeader({ kicker, kickerColor, title, italicized }) {
  return (
    <div className="mb-10 fade-up">
      <div className="mono-font text-xs uppercase tracking-[0.2em] mb-3" style={{ color: kickerColor || '#78716C' }}>{kicker}</div>
      <h1 className="display-font text-5xl md:text-7xl font-medium leading-[1] tracking-tight text-stone-900">
        {title}{italicized && <> <em className="display-font-i font-normal" style={{ color: '#6639A6' }}>{italicized}</em></>}
      </h1>
    </div>
  )
}

// Helper for derived metrics with target-based color coding
export function DerivedMetric({ label, value, target, comparator = 'gte', help }) {
  // comparator: 'gte' = good when value >= target; 'lte' = good when value <= target
  let isGood = null
  if (target !== undefined && target !== null && value !== null && value !== undefined && value !== '' && !isNaN(value)) {
    isGood = comparator === 'gte' ? Number(value) >= target : Number(value) <= target
  }
  return (
    <div className={`border p-4 ${isGood === true ? 'border-emerald-400 bg-emerald-50/30' : isGood === false ? 'border-red-300 bg-red-50/20' : 'border-stone-200'}`}>
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">{label}</div>
      <div className={`display-font text-2xl font-medium num-tabular ${isGood === true ? 'text-emerald-700' : isGood === false ? 'text-red-700' : 'text-stone-900'}`}>
        {value}
      </div>
      {target !== undefined && (
        <div className="text-[11px] text-stone-500 mt-1.5">
          Target: {comparator === 'gte' ? '≥' : '≤'} {target}
        </div>
      )}
      {help && <div className="text-[11px] text-stone-500 mt-1 leading-snug">{help}</div>}
    </div>
  )
}
