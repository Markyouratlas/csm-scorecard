import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  CalendarCheck, Users, TrendingUp, Quote, Activity, LogOut, LayoutDashboard,
  Award, Clock, Loader2, Check, Plus, Trash2, Upload, Download, Star, ShieldCheck,
  Settings as SettingsIcon, Calendar, Lightbulb, Plug, UserMinus, Crown, Zap, Info,
  ChevronLeft, ChevronRight, Lock, Send
} from 'lucide-react'
import { supabase } from './supabase'
import {
  BLANK_WEEK, sum, fmt, DAYS, MEETING_CATEGORIES, PIPELINE_STAGES,
  customerTtfv, avgTtfv, newCustomer,
  CANCELLATION_CATEGORIES, cancellationCategoryLabel
} from './constants'
import { getWeekKey, formatWeekLabel, stepWeek } from './dateUtils'
import { fireConfetti } from './confetti'
import SettingsModal from './SettingsModal'
import AtlasLogo from './AtlasLogo'
import HeaderNav from './HeaderNav'
import { useTargets } from './useTargets'
import { useMtdData, getMonthKey, formatMonthLabel } from './useMtd'
import { MtdCard, MtdLegend } from './MtdWidgets'
import { useGlassInteraction } from './hooks/useGlassInteraction.js'
import { useScorecardEditable } from './ScorecardEditContext'
import RocketLoader from './RocketLoader'
import CsHandoffPanel from './CsHandoffPanel.jsx'
import CombinedDialsCard from './CombinedDialsCard'

export default function FdeView({ profile, onSignOut, onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership, onSwitchToCommissions, onProfileUpdated, weekKey: propWeekKey }) {
  const [section, setSection] = useState('activity')
  const [weekData, setWeekData] = useState(null)
  const [submittedAt, setSubmittedAt] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const headerRef = useGlassInteraction()
  const editable = useScorecardEditable()

  // If propWeekKey is supplied (exec drilling in via ScorecardViewer), the
  // parent owns week navigation and we mirror it. Otherwise the user is on
  // their OWN scorecard and we manage the weekKey here.
  const isExecDrillIn = propWeekKey !== undefined
  const [ownWeekKey, setOwnWeekKey] = useState(getWeekKey())
  const weekKey = isExecDrillIn ? propWeekKey : ownWeekKey

  const currentWeekKey = getWeekKey()
  const isViewingCurrentWeek = weekKey === currentWeekKey
  const isLocked = !!submittedAt && !isViewingCurrentWeek

  // ----- Load this week's scorecard -----
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSubmittedAt(null)
    setSavedAt(null)
    supabase
      .from('weekly_scorecards')
      .select('data, submitted_at')
      .eq('user_id', profile.id)
      .eq('week_key', weekKey)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Load error', error)
        const blank = BLANK_WEEK()
        const loaded = data?.data || {}
        const merged = {
          ...blank,
          ...loaded,
          meetings: { ...blank.meetings, ...(loaded.meetings || {}) },
          pipeline: { ...blank.pipeline, ...(loaded.pipeline || {}) },
          retention: { ...blank.retention, ...(loaded.retention || {}) },
          ttfvCustomers: Array.isArray(loaded.ttfvCustomers) ? loaded.ttfvCustomers : [],
        }

        // First-time open of the FDE's OWN current week (no row existed yet):
        // carry forward the named TTFV customers from the most recent prior
        // week so the onboarding list doesn't reset to empty each week. Keyed
        // on "no row existed" - NOT on "ttfvCustomers is empty" - so a week
        // where the user deliberately cleared the list is never re-seeded.
        if (!data && !isExecDrillIn && weekKey === currentWeekKey) {
          const { data: priorRows, error: priorErr } = await supabase
            .from('weekly_scorecards')
            .select('week_key, data')
            .eq('user_id', profile.id)
            .lt('week_key', currentWeekKey)
            .order('week_key', { ascending: false })
            .limit(8)
          if (cancelled) return
          if (priorErr) console.error('Carry-forward load error', priorErr)
          const sourceRow = (priorRows || []).find(r =>
            Array.isArray(r.data?.ttfvCustomers) &&
            r.data.ttfvCustomers.some(c => c.name && c.name.trim())
          )
          if (sourceRow) {
            merged.ttfvCustomers = sourceRow.data.ttfvCustomers
              .filter(c => c.name && c.name.trim())
              .map(c => ({ ...c })) // clone; keep stage1/stage2/stage3
          }
        }

        if (cancelled) return
        setWeekData(merged)
        setSubmittedAt(data?.submitted_at || null)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [profile.id, weekKey, isExecDrillIn, currentWeekKey])

  // ----- Auto-save (debounced) — suppressed when locked -----
  const save = useCallback(async (newData) => {
    setSaving(true)
    const { error } = await supabase
      .from('weekly_scorecards')
      .upsert({
        user_id: profile.id,
        week_key: weekKey,
        data: newData,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,week_key' })
    setSaving(false)
    if (error) {
      console.error('Save error', error)
    } else {
      setSavedAt(new Date())
    }
  }, [profile.id, weekKey])

  useEffect(() => {
    if (!editable) return
    if (!weekData || loading) return
    if (isLocked) return // Locked weeks don't auto-save
    const t = setTimeout(() => save(weekData), 800)
    return () => clearTimeout(t)
  }, [weekData, loading, save, isLocked, editable])

  // ----- Submit / Unsubmit -----
  const handleSubmit = useCallback(async () => {
    if (!weekData || submittedAt) return
    setSubmitting(true)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('weekly_scorecards')
      .upsert({
        user_id: profile.id,
        week_key: weekKey,
        data: weekData,
        submitted_at: now,
        updated_at: now,
      }, { onConflict: 'user_id,week_key' })
    setSubmitting(false)
    if (error) {
      console.error('Submit error', error)
      alert('Could not submit: ' + error.message)
      return
    }
    setSubmittedAt(now)
    fireConfetti({ count: 150 })
  }, [profile.id, weekKey, weekData, submittedAt])

  const handleUnsubmit = useCallback(async () => {
    if (!submittedAt) return
    setSubmitting(true)
    const { error } = await supabase
      .from('weekly_scorecards')
      .update({ submitted_at: null, updated_at: new Date().toISOString() })
      .eq('user_id', profile.id)
      .eq('week_key', weekKey)
    setSubmitting(false)
    if (error) {
      console.error('Unsubmit error', error)
      alert('Could not unsubmit: ' + error.message)
      return
    }
    setSubmittedAt(null)
  }, [profile.id, weekKey, submittedAt])

  if (loading || !weekData) {
    return <RocketLoader className="min-h-screen" />
  }

  // ----- Update helpers -----
  const update = (updater) => setWeekData(prev => updater(prev))
  const setMeeting = (cat, dayIdx, value) => update(d => ({
    ...d,
    meetings: { ...d.meetings, [cat]: d.meetings[cat].map((v, i) => i === dayIdx ? Number(value) || 0 : v) }
  }))
  const setPipeline = (key, value) => update(d => ({ ...d, pipeline: { ...d.pipeline, [key]: Number(value) || 0 } }))
  const setField = (key, value) => update(d => ({ ...d, [key]: value }))
  const setRetention = (k, v) => update(d => ({ ...d, retention: { ...d.retention, [k]: v } }))

  // ----- Computed numbers -----
  const meetingsByDay = DAYS.map((_, dayIdx) => sum(MEETING_CATEGORIES.map(c => weekData.meetings[c.key][dayIdx])))
  const totalMeetings = sum(meetingsByDay)
  const avgTtfvDays = avgTtfv(weekData.ttfvCustomers)

  const sections = [
    { id: 'activity',         label: 'Daily Activity & Launches', icon: CalendarCheck },
    { id: 'pipeline_health',  label: 'Pipeline & Health',         icon: Users },
    { id: 'testimonials',     label: 'Testimonials',              icon: Quote },
    { id: 'retention',        label: 'Retention',                 icon: Activity },
    { id: 'monthly',          label: 'Monthly View',              icon: Calendar },
  ]

  return (
    <div className="min-h-screen">
      <header ref={headerRef} className="glass-nav glass-nav-strip sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <AtlasLogo height={28} />
            <div className="hidden md:block h-8 w-px bg-stone-300" />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: profile.color, fontFamily: "'Instrument Serif', serif" }}>
                {profile.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div className="display-font text-base font-medium text-stone-900 leading-tight">{profile.name}</div>
                <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{profile.title}</div>
              </div>
            </div>
          </div>
          <HeaderNav
            currentPage={isExecDrillIn ? undefined : 'self'}
            onSwitchToLeadership={onSwitchToLeadership}
            onSwitchToIntegrations={onSwitchToIntegrations}
            onSwitchToFeatureRequests={onSwitchToFeatureRequests}
            onSwitchToCancellations={onSwitchToCancellations}
            onSwitchToCommissions={onSwitchToCommissions}
            onSwitchToApiGuide={onSwitchToApiGuide}
            onSwitchToManager={onSwitchToManager}
            onOpenSettings={() => setShowSettings(true)}
            onSignOut={onSignOut}
          >
            <SaveIndicator saving={saving} savedAt={savedAt} />
          </HeaderNav>
        </div>
      </header>

      {/* Week navigator — own-scorecard only. Exec drill-in uses ScorecardViewer's nav. */}
      {!isExecDrillIn && (
        <div className="bg-stone-100/60 border-b border-stone-200 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => setOwnWeekKey(stepWeek(weekKey, -1))}
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
              onClick={() => setOwnWeekKey(stepWeek(weekKey, 1))}
              disabled={weekKey >= currentWeekKey}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-stone-700 hover:text-stone-900 hover:bg-stone-200 transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next week"
            >
              Next week <ChevronRight className="w-4 h-4" />
            </button>
            {!isViewingCurrentWeek && (
              <button
                onClick={() => setOwnWeekKey(currentWeekKey)}
                className="ml-2 px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 underline"
              >
                Jump to current
              </button>
            )}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-10 fade-up">
          <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">
            Weekly Scorecard · Week of {formatWeekLabel(weekKey)}
          </div>
          <h1 className="display-font text-5xl md:text-7xl font-medium leading-[1] tracking-tight text-stone-900">
            How was <em className="display-font-i font-normal" style={{ color: '#6639A6' }}>your week,</em><br />{profile.name.split(' ')[0]}?
          </h1>
        </div>

        {submittedAt && (
          <SubmittedBanner
            submittedAt={submittedAt}
            canUnsubmit={isViewingCurrentWeek}
            onUnsubmit={handleUnsubmit}
            submitting={submitting}
          />
        )}

        {/* North Star tiles */}
        <div className="grid md:grid-cols-3 gap-4 mb-12 fade-up" style={{ animationDelay: '80ms' }}>
          <NorthStarTile label="Launched This Week" value={weekData.launchedThisWeek} sublabel="North star metric" color="#0F766E" icon={Award} />
          <NorthStarTile
            label="Avg Time-to-First-Value"
            value={avgTtfvDays || '—'}
            unit={avgTtfvDays ? 'days' : ''}
            sublabel={avgTtfvDays ? (avgTtfvDays <= 14 ? '✓ Under 14-day goal' : '↑ Above 14-day goal') : 'Add customers below'}
            color="#1C1917"
            icon={Clock}
          />
          <TestimonialsNorthStar profile={profile} weekKey={weekKey} />
        </div>

        {/* Section nav */}
        <div className="flex flex-wrap gap-2 mb-8 fade-up" style={{ animationDelay: '120ms' }}>
          {sections.map(s => {
            const Icon = s.icon
            const active = section === s.id
            return (
              <FdeTab key={s.id} active={active} onClick={() => setSection(s.id)}>
                <Icon className="w-4 h-4" /> {s.label}
              </FdeTab>
            )
          })}
        </div>

        <div
          className="fade-up"
          style={{
            animationDelay: '160ms',
            ...(isLocked ? { pointerEvents: 'none', opacity: 0.75, filter: 'saturate(0.85)' } : null),
          }}
        >
          {section === 'activity' && (
            <div className="space-y-12">
              <CombinedDialsCard userId={profile.id} weekKey={weekKey} />
              <MeetingsSection weekData={weekData} setMeeting={setMeeting} totalMeetings={totalMeetings} meetingsByDay={meetingsByDay} />
              <div className="border-t border-stone-200 pt-12">
                <LaunchesSection weekData={weekData} setField={setField} update={update} />
              </div>
            </div>
          )}
          {section === 'pipeline_health' && (
            <div className="space-y-12">
              <PipelineSection weekData={weekData} setPipeline={setPipeline} update={update} />
              <div className="border-t border-stone-200 pt-12">
                <HealthSection weekData={weekData} update={update} />
              </div>
            </div>
          )}
          {section === 'testimonials' && <TestimonialsSection profile={profile} />}
          {section === 'retention' && <RetentionSection weekData={weekData} setRetention={setRetention} />}
          {section === 'monthly' && <FdeMonthlyView profile={profile} />}
        </div>

        {!isExecDrillIn && !submittedAt && section !== 'monthly' && (
          <SubmitFooter
            onSubmit={handleSubmit}
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

// ============================================================================
//  Shared bits
// ============================================================================

function SaveIndicator({ saving, savedAt }) {
  if (saving) return <div className="flex items-center gap-1.5 text-xs text-stone-500 px-2"><Loader2 className="w-3 h-3 animate-spin" /> Saving</div>
  if (savedAt) return <div className="glass-vibrancy-pill flex items-center gap-1.5 text-xs"><Check className="w-3 h-3" /> Saved</div>
  return null
}

// Submitted banner — see CsmView for documentation.
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

// Submit footer — see CsmView for documentation.
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

// Each tab is a glass surface — pointer-tracked illumination per the doctrine.
function FdeTab({ active, onClick, children }) {
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

// Column header for the TTFV table with a two-line layout and a hover tooltip.
// Mirrors the same component in CsmView (duplicated rather than shared to
// keep the two scorecard views isolated — see notes in batch 6).
// VERSION-MARKER-TOOLTIP-2026-05-14: this comment is a marker so we can grep
// the deployed bundle to verify the right FdeView.jsx made it to production.
// Inline <style> block — see CsmView for full rationale.
function TtfvTooltipStyles() {
  return (
    <style>{`
      .ttfv-tooltip-anchor:hover .ttfv-tooltip-panel,
      .ttfv-tooltip-anchor:focus-within .ttfv-tooltip-panel {
        opacity: 1 !important;
        transform: translate(-50%, 0) !important;
      }
      .ttfv-tooltip-anchor:hover .ttfv-tooltip-icon {
        color: #44403C !important;
      }
      @media (prefers-reduced-motion: reduce) {
        .ttfv-tooltip-panel {
          transition: opacity 120ms linear !important;
          transform: translate(-50%, 0) !important;
        }
      }
    `}</style>
  )
}

function TtfvStageHeader({ label, subtext, tooltip, align = 'center', isTotal = false }) {
  const alignClass = align === 'right' ? 'text-right' : 'text-center'
  const flexAlign = align === 'right' ? 'justify-end' : 'justify-center'
  const labelClass = isTotal
    ? 'mono-font text-[10px] uppercase tracking-widest text-stone-900 font-bold'
    : 'mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium'
  return (
    <th className={`${alignClass} py-2 px-3`}>
      <div
        className="ttfv-tooltip-anchor"
        style={{ position: 'relative', display: 'inline-block', transform: 'translateZ(0)' }}
      >
        <div className={alignClass}>
          <div className={`flex items-center gap-1.5 cursor-help ${flexAlign}`}>
            <span className={labelClass}>{label}</span>
            <Info className="ttfv-tooltip-icon" style={{ width: 12, height: 12, color: '#A8A29E', flexShrink: 0, transition: 'color 180ms ease-out' }} />
          </div>
          {subtext && (
            <div className="text-[10px] text-stone-500 mt-0.5 normal-case tracking-normal font-normal">
              {subtext}
            </div>
          )}
        </div>
        <div
          className="ttfv-tooltip-panel"
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            marginBottom: 10,
            width: 280,
            transform: 'translate(-50%, 6px)',
            opacity: 0,
            pointerEvents: 'none',
            transition: 'opacity 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 50,
          }}
        >
          <div
            style={{
              position: 'relative',
              backgroundColor: '#1C1917',
              color: '#F5F5F4',
              padding: '12px 14px',
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              textTransform: 'none',
              letterSpacing: 'normal',
              fontWeight: 400,
              textAlign: 'left',
              boxShadow: '0 12px 24px -8px rgba(0,0,0,0.25), 0 4px 8px -4px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#8B5CF6', borderTopLeftRadius: 8, borderTopRightRadius: 8 }} />
            <div style={{ position: 'absolute', bottom: -5, left: '50%', width: 10, height: 10, transform: 'translateX(-50%) rotate(45deg)', backgroundColor: '#1C1917' }} />
            <div style={{ position: 'relative' }}>{tooltip}</div>
          </div>
        </div>
      </div>
    </th>
  )
}

function NorthStarTile({ label, value, unit, sublabel, color, icon: Icon }) {
  return (
    <div className="bg-white border border-stone-200 p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
      <div className="flex items-start justify-between mb-4">
        <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
        <Icon className="w-4 h-4 text-stone-400" />
      </div>
      <div className="display-font text-5xl font-medium text-stone-900 num-tabular leading-none">
        {value}
        {unit && <span className="text-xl text-stone-400 ml-2 font-normal">{unit}</span>}
      </div>
      <div className="text-xs text-stone-500 mt-3">{sublabel}</div>
    </div>
  )
}

// Live testimonials count (uploaded videos this month) — queries testimonial_candidates
function TestimonialsNorthStar({ profile, weekKey }) {
  const [count, setCount] = useState(null)
  useEffect(() => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
    supabase.from('testimonial_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('csm_id', profile.id)
      .not('video_uploaded_at', 'is', null)
      .gte('video_uploaded_at', monthStart.toISOString())
      .then(({ count }) => setCount(count ?? 0))
  }, [profile.id, weekKey])
  return (
    <NorthStarTile
      label="Testimonials This Month"
      value={count ?? 0}
      sublabel={(count >= 1 ? '✓' : '○') + ' Target: 1 / month'}
      color="#7C3AED"
      icon={Quote}
    />
  )
}

// ============================================================================
//  Meetings section
// ============================================================================

function MeetingsSection({ weekData, setMeeting, totalMeetings, meetingsByDay }) {
  return (
    <div className="bg-white border border-stone-200 p-6 overflow-x-auto">
      <div className="display-font text-2xl font-medium text-stone-900 mb-1">Meetings logged by day</div>
      <p className="text-sm text-stone-600 mb-6">Tap into a cell to enter the count for that meeting type and day.</p>
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Type</th>
            {DAYS.map(d => <th key={d} className="text-center py-2 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">{d}</th>)}
            <th className="text-right py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-900 font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          {MEETING_CATEGORIES.map(cat => {
            const rowTotal = sum(weekData.meetings[cat.key])
            return (
              <tr key={cat.key} className="border-b border-stone-100">
                <td className="py-2 px-3 font-medium text-stone-800 whitespace-nowrap">{cat.label}</td>
                {DAYS.map((_, di) => (
                  <td key={di} className="py-2 px-2 text-center">
                    <input type="number" min="0" value={weekData.meetings[cat.key][di] || ''} onChange={(e) => setMeeting(cat.key, di, e.target.value)}
                      className="w-12 text-center py-1 border border-stone-200 focus:border-stone-900 transition-colors num-tabular" />
                  </td>
                ))}
                <td className="py-2 px-3 text-right num-tabular font-semibold text-stone-900">{rowTotal}</td>
              </tr>
            )
          })}
          <tr className="bg-stone-900 text-stone-50">
            <td className="py-3 px-3 mono-font text-[10px] uppercase tracking-widest font-medium">Daily Total</td>
            {meetingsByDay.map((c, i) => <td key={i} className="py-3 px-2 text-center num-tabular font-bold">{c}</td>)}
            <td className="py-3 px-3 text-right num-tabular font-bold text-lg" style={{ color: '#F59E0B' }}>{totalMeetings}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
//  Pipeline section
// ============================================================================

// Atlas brand purple — used to flag Channel Partner customers everywhere
const CHANNEL_PARTNER_COLOR = '#6639a6'

// Forward Deployment uses a simplified 3-stage pipeline. The data still
// carries all 10 stage fields from PIPELINE_STAGES (preOnboarding, kickoffScheduled,
// inContact, obInProgress, implementationBacklog, implementation, implementationReview,
// launch, paused, cancelled) — we just don't render the unused ones. If we want
// to re-enable additional stages for FDE later, add their keys to this list.
const FDE_PIPELINE_STAGE_KEYS = ['preOnboarding', 'obInProgress', 'launch']
const FDE_PIPELINE_STAGES = PIPELINE_STAGES.filter(s => FDE_PIPELINE_STAGE_KEYS.includes(s.key)).map(s => {
  // Re-label "launch" → "Launched" for the FDE view to make the simplified flow read clearly.
  if (s.key === 'launch') return { ...s, label: 'Launched' }
  return s
})

function PipelineSection({ weekData, setPipeline, update }) {
  // Total counts visible stages only — matches what the user sees.
  const totalClients = FDE_PIPELINE_STAGES.reduce((s, p) => s + (weekData.pipeline[p.key] || 0), 0)
  const customers = weekData.ttfvCustomers || []
  const channelPartners = customers.filter(c => c.channelPartner && c.name && c.name.trim())

  const toggleChannelPartner = (id, value) => update(d => ({
    ...d,
    ttfvCustomers: (d.ttfvCustomers || []).map(c => c.id === id ? { ...c, channelPartner: value } : c),
  }))

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">Customer pipeline</div>
        <p className="text-sm text-stone-600 mb-6">Where do your customers currently sit? Total: <span className="font-semibold text-stone-900 num-tabular">{totalClients}</span></p>
        <div className="grid sm:grid-cols-3 gap-3">
          {FDE_PIPELINE_STAGES.map(stage => (
            <div key={stage.key} className="border border-stone-200 p-4">
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">{stage.label}</div>
              <input type="number" min="0" value={weekData.pipeline[stage.key] || ''} onChange={(e) => setPipeline(stage.key, e.target.value)}
                className="w-full py-2 px-3 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-2xl display-font font-medium" />
            </div>
          ))}
        </div>
      </div>

      <CsHandoffPanel />

      <ChannelPartnersPanel
        customers={channelPartners}
        onToggleChannelPartner={toggleChannelPartner}
      />
    </div>
  )
}

function ChannelPartnersPanel({ customers, onToggleChannelPartner }) {
  return (
    <div className="bg-white border border-stone-200 p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: CHANNEL_PARTNER_COLOR }} />
      <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-5 h-5" style={{ color: CHANNEL_PARTNER_COLOR, fill: CHANNEL_PARTNER_COLOR }} />
            <div className="display-font text-2xl font-medium text-stone-900">Channel Partners</div>
            <span className="mono-font text-[10px] uppercase tracking-widest px-2 py-0.5 rounded text-white num-tabular"
              style={{ background: CHANNEL_PARTNER_COLOR }}>
              {customers.length}
            </span>
          </div>
          <p className="text-sm text-stone-600">Priority customers — flag any customer in <span className="font-medium">Launches & TTFV</span> to surface them here.</p>
        </div>
      </div>

      {customers.length === 0 ? (
        <div className="mt-6 border-2 border-dashed border-stone-300 p-8 text-center">
          <div className="display-font text-lg font-medium text-stone-700 mb-1">No channel partners flagged</div>
          <p className="text-sm text-stone-500">Open the <span className="font-medium">Launches & TTFV</span> tab and toggle the <Star className="w-3.5 h-3.5 inline -mt-0.5" /> on any customer to mark them as a channel partner.</p>
        </div>
      ) : (
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {customers.map(c => {
            const total = customerTtfv(c)
            const healthMeta = HEALTH_OPTIONS.find(h => h.key === (c.healthScore || ''))
            return (
              <div key={c.id} className="border border-stone-200 p-4 relative group hover:border-stone-900 transition-colors"
                style={{ borderLeftWidth: 3, borderLeftColor: CHANNEL_PARTNER_COLOR }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="font-medium text-stone-900 leading-tight truncate" title={c.name}>{c.name}</div>
                  <button
                    onClick={() => onToggleChannelPartner(c.id, false)}
                    title="Unflag as channel partner"
                    className="p-1 -m-1 text-stone-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs text-stone-600">
                  <span className="num-tabular">
                    TTFV: <span className="font-semibold text-stone-900">{total > 0 ? `${total}d` : '—'}</span>
                  </span>
                  {c.healthScore ? (
                    <span className="inline-flex items-center gap-1" style={{ color: healthMeta?.textColor }}>
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: healthMeta?.color }} />
                      {healthMeta?.label.replace(/^[^\w]+\s*/, '')}
                    </span>
                  ) : (
                    <span className="text-stone-400">No health rating</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================================
//  Launches & TTFV section
// ============================================================================

function LaunchesSection({ weekData, setField, update }) {
  const addCustomer = () => update(d => ({ ...d, ttfvCustomers: [...(d.ttfvCustomers || []), newCustomer()] }))
  const removeCustomer = (id) => update(d => ({ ...d, ttfvCustomers: d.ttfvCustomers.filter(c => c.id !== id) }))
  const updateCustomer = (id, patch) => update(d => ({
    ...d,
    ttfvCustomers: d.ttfvCustomers.map(c => c.id === id ? { ...c, ...patch } : c)
  }))

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-6">This week's launches</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <NumberField label="Launched This Week" value={weekData.launchedThisWeek} onChange={(v) => setField('launchedThisWeek', Number(v) || 0)} highlight />
          <NumberField label="Customers To Launch" value={weekData.customersToLaunch} onChange={(v) => setField('customersToLaunch', Number(v) || 0)} />
          <NumberField
            label="Backlog"
            value={weekData.backlogDays}
            onChange={(v) => setField('backlogDays', Number(v) || 0)}
            unit="days"
            help="Days until next available onboarding slot"
          />
          <NumberField label="Cancelled This Week" value={weekData.cancelledThisWeek} onChange={(v) => setField('cancelledThisWeek', Number(v) || 0)} />
        </div>
        <div className="mt-6">
          <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-2">Notes for the week</label>
          <textarea rows={3} value={weekData.notes || ''} onChange={(e) => setField('notes', e.target.value)} placeholder="Wins, blockers, anything to flag..."
            className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm" />
        </div>
      </div>

      <TtfvCustomersTable
        customers={weekData.ttfvCustomers}
        addCustomer={addCustomer}
        removeCustomer={removeCustomer}
        updateCustomer={updateCustomer}
      />
    </div>
  )
}

function TtfvCustomersTable({ customers, addCustomer, removeCustomer, updateCustomer }) {
  const avg = avgTtfv(customers)
  // Per-stage previous values let us detect WHICH stage changed and apply
  // the right gate. Without this we can only see total changes, which can't
  // tell us if stage 1 was edited vs. stage 3.
  const initializedRef = useRef(false)
  const lastStagesRef = useRef({})
  const [showOnlyChannelPartners, setShowOnlyChannelPartners] = useState(false)

  useEffect(() => {
    // After first run, mark initialized so confetti only fires on subsequent changes
    const timer = setTimeout(() => { initializedRef.current = true }, 600)
    return () => clearTimeout(timer)
  }, [])

  // Per-stage confetti rules — each stage celebrates differently. The total
  // must always be ≤14 (the overall TTFV goal); individual stages have their
  // own additional targets:
  //   • Stage 1 changed AND stage 1 ≤ 2 days  → 🎆
  //   • Stage 2 changed AND stage 2 ≤ 3 days  → 🎆
  //   • Stage 3 changed (no extra gate beyond total) → 🎆
  //
  // We fire at most ONE burst per render, even if multiple stages qualify —
  // double-fire feels gratuitous.
  useEffect(() => {
    if (!initializedRef.current) {
      customers.forEach(c => {
        lastStagesRef.current[c.id] = {
          s1: Number(c.stage1) || 0,
          s2: Number(c.stage2) || 0,
          s3: Number(c.stage3) || 0,
        }
      })
      return
    }
    customers.forEach(c => {
      const total = customerTtfv(c)
      const s1 = Number(c.stage1) || 0
      const s2 = Number(c.stage2) || 0
      const s3 = Number(c.stage3) || 0
      const prev = lastStagesRef.current[c.id] || { s1, s2, s3 }

      const hasName = c.name && c.name.trim()
      const totalOnTarget = total > 0 && total <= 14

      let shouldFire = false
      if (hasName && totalOnTarget) {
        if (s1 !== prev.s1 && s1 <= 2) shouldFire = true
        if (s2 !== prev.s2 && s2 <= 3) shouldFire = true
        if (s3 !== prev.s3) shouldFire = true
      }

      if (shouldFire) fireConfetti({ count: 60 })
      lastStagesRef.current[c.id] = { s1, s2, s3 }
    })
    // Clean up snapshots for removed customers
    const ids = new Set(customers.map(c => c.id))
    Object.keys(lastStagesRef.current).forEach(id => { if (!ids.has(id)) delete lastStagesRef.current[id] })
  }, [customers])

  const channelPartnerCount = customers.filter(c => c.channelPartner).length
  const visibleCustomers = showOnlyChannelPartners
    ? customers.filter(c => c.channelPartner)
    : customers

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
        <div>
          <div className="display-font text-2xl font-medium text-stone-900">Time-to-First-Value</div>
          <p className="text-sm text-stone-600 mt-1">Track each customer's onboarding journey. Avg: <span className="font-semibold text-stone-900 num-tabular">{avg ? `${avg} days` : '—'}</span></p>
        </div>
        <button onClick={addCustomer}
          className="flex items-center gap-2 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Add customer
        </button>
      </div>

      {/* Filter chips */}
      {customers.length > 0 && (
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">Filter:</span>
          <button
            onClick={() => setShowOnlyChannelPartners(false)}
            className={`text-xs px-2.5 py-1 transition-colors ${!showOnlyChannelPartners ? 'bg-stone-900 text-stone-50' : 'border border-stone-200 text-stone-600 hover:border-stone-900'}`}>
            All ({customers.length})
          </button>
          <button
            onClick={() => setShowOnlyChannelPartners(true)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 transition-colors ${showOnlyChannelPartners ? 'text-white' : 'border text-stone-600 hover:text-stone-900'}`}
            style={showOnlyChannelPartners
              ? { background: CHANNEL_PARTNER_COLOR }
              : { borderColor: '#E7E5E4' }}
            onMouseEnter={(e) => { if (!showOnlyChannelPartners) e.currentTarget.style.borderColor = CHANNEL_PARTNER_COLOR }}
            onMouseLeave={(e) => { if (!showOnlyChannelPartners) e.currentTarget.style.borderColor = '#E7E5E4' }}>
            <Star className={`w-3 h-3 ${showOnlyChannelPartners ? '' : ''}`} style={{ fill: showOnlyChannelPartners ? '#fff' : 'transparent' }} />
            Channel Partners ({channelPartnerCount})
          </button>
        </div>
      )}

      {customers.length === 0 ? (
        <div className="mt-6 border-2 border-dashed border-stone-300 p-8 text-center">
          <div className="display-font text-lg font-medium text-stone-700 mb-1">No customers yet</div>
          <p className="text-sm text-stone-500 mb-4">Add your first launched customer to start tracking TTFV.</p>
          <button onClick={addCustomer} className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" /> Add customer
          </button>
        </div>
      ) : visibleCustomers.length === 0 ? (
        <div className="mt-6 border-2 border-dashed border-stone-300 p-8 text-center">
          <div className="display-font text-lg font-medium text-stone-700 mb-1">No channel partners flagged yet</div>
          <p className="text-sm text-stone-500">Toggle the <Star className="w-3.5 h-3.5 inline -mt-0.5" /> on any customer below to flag them.</p>
        </div>
      ) : (
        <div className="mt-6">
          <TtfvTooltipStyles />
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-center py-2 pl-3 pr-1 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[44px]" title="Channel Partner">
                  <Star className="w-3.5 h-3.5 inline" style={{ color: CHANNEL_PARTNER_COLOR }} />
                </th>
                <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Customer</th>
                <TtfvStageHeader
                  label="Stage 1"
                  subtext="Signed → OB Scheduled"
                  tooltip="Time from a customer paying to clicking the link that schedules their first onboarding meeting. Target: same day or next day. More than 2 days is too long."
                />
                <TtfvStageHeader
                  label="Stage 2"
                  subtext="OB Scheduled → OB Kickoff"
                  tooltip="Time from scheduling onboarding to the actual onboarding meeting. Could be backlog on our side or a delay from the customer — either way, keep this under 3 days. North star: 1 day."
                />
                <TtfvStageHeader
                  label="Stage 3"
                  subtext="OB Kickoff → Launched"
                  tooltip="Time from the first onboarding meeting to when the customer is launched and getting real value from Atlas."
                />
                <TtfvStageHeader
                  label="Total"
                  subtext="Time-to-First-Value"
                  tooltip="Total days from signing to launch — the sum of all three stages. North star: 14 days or less."
                  align="right"
                  isTotal
                />
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {visibleCustomers.map(c => {
                const total = customerTtfv(c)
                const hasName = c.name && c.name.trim()
                const s1 = Number(c.stage1) || 0
                const s2 = Number(c.stage2) || 0
                const isHit = hasName && total > 0 && total <= 14 && s1 <= 2 && s2 <= 3
                const isCp = !!c.channelPartner
                return (
                  <tr key={c.id} className={`border-b border-stone-100 transition-colors ${isHit ? 'bg-emerald-50/40' : ''}`}>
                    <td className="py-2 pl-3 pr-1 text-center">
                      <button
                        onClick={() => updateCustomer(c.id, { channelPartner: !isCp })}
                        title={isCp ? 'Unflag as channel partner' : 'Flag as channel partner'}
                        className="p-1.5 transition-colors hover:bg-stone-100">
                        <Star
                          className="w-4 h-4 transition-all"
                          style={{
                            color: isCp ? CHANNEL_PARTNER_COLOR : '#D6D3D1',
                            fill: isCp ? CHANNEL_PARTNER_COLOR : 'transparent',
                          }}
                        />
                      </button>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        value={c.name}
                        onChange={(e) => updateCustomer(c.id, { name: e.target.value })}
                        placeholder="Customer name (required)"
                        className={`w-full py-1.5 px-2 border focus:border-stone-900 transition-colors text-sm ${!hasName ? 'border-amber-300 bg-amber-50/40' : 'border-stone-200'}`}
                      />
                    </td>
                    {[1, 2, 3].map(s => (
                      <td key={s} className="py-2 px-3 text-center">
                        <input
                          type="number"
                          min="0"
                          value={c[`stage${s}`] || ''}
                          onChange={(e) => updateCustomer(c.id, { [`stage${s}`]: Number(e.target.value) || 0 })}
                          className="w-16 text-center py-1.5 border border-stone-200 focus:border-stone-900 transition-colors num-tabular"
                        />
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right num-tabular font-semibold">
                      {hasName ? (
                        <div className="inline-flex items-center gap-1.5">
                          <span className={isHit ? 'text-emerald-700' : 'text-stone-900'}>{total} {total === 1 ? 'day' : 'days'}</span>
                          {isHit && <Check className="w-4 h-4 text-emerald-600" />}
                        </div>
                      ) : (
                        <span className="text-stone-400 text-xs italic">name required</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => removeCustomer(c.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================================
//  Testimonials section
// ============================================================================

function TestimonialsSection({ profile }) {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const fileInputRef = useRef(null)
  const [uploadingId, setUploadingId] = useState(null)

  const loadCandidates = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('testimonial_candidates')
      .select('*')
      .eq('csm_id', profile.id)
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
    if (error) console.error('Load testimonials error', error)
    setCandidates(data || [])
    setLoading(false)
  }, [profile.id])

  useEffect(() => { loadCandidates() }, [loadCandidates])

  // Counts for the two summary tiles
  const monthStart = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  }, [])
  const uploadedThisMonth = candidates.filter(c => c.video_uploaded_at && new Date(c.video_uploaded_at) >= monthStart).length
  const qualifiedThisMonth = candidates.filter(c => c.qualified && c.qualified_at && new Date(c.qualified_at) >= monthStart).length

  const addCandidate = async () => {
    setAdding(true)
    const { data, error } = await supabase.from('testimonial_candidates').insert({
      csm_id: profile.id,
      customer_name: '',
      score: 5,
    }).select().single()
    setAdding(false)
    if (error) { console.error(error); alert(error.message); return }
    setCandidates(prev => [data, ...prev].sort((a, b) => b.score - a.score))
  }

  const updateCandidate = async (id, patch) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c).sort((a, b) => b.score - a.score))
    const { error } = await supabase.from('testimonial_candidates').update(patch).eq('id', id)
    if (error) { console.error(error); loadCandidates() }
  }

  const removeCandidate = async (id) => {
    if (!confirm('Remove this testimonial candidate?')) return
    const cand = candidates.find(c => c.id === id)
    // If there's a video, delete it from storage too
    if (cand?.video_path) {
      await supabase.storage.from('testimonial-videos').remove([cand.video_path])
    }
    const { error } = await supabase.from('testimonial_candidates').delete().eq('id', id)
    if (error) { console.error(error); alert(error.message); return }
    setCandidates(prev => prev.filter(c => c.id !== id))
  }

  const triggerUpload = (id) => {
    setUploadingId(id)
    fileInputRef.current.click()
  }

  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so same file can be re-selected
    if (!file || !uploadingId) return
    if (!file.type.startsWith('video/')) { alert('Please select a video file.'); setUploadingId(null); return }

    const id = uploadingId
    setUploadingId(null)
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, _uploading: true } : c))

    const ext = file.name.split('.').pop() || 'mp4'
    const path = `${profile.id}/${id}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('testimonial-videos').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })
    if (upErr) {
      console.error(upErr); alert('Upload failed: ' + upErr.message)
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, _uploading: false } : c))
      return
    }

    const now = new Date().toISOString()
    await updateCandidate(id, {
      video_path: path,
      video_filename: file.name,
      video_uploaded_at: now,
      _uploading: false,
    })
    fireConfetti({ count: 100 })
  }

  const downloadVideo = async (cand) => {
    if (!cand.video_path) return
    const { data, error } = await supabase.storage.from('testimonial-videos').createSignedUrl(cand.video_path, 60)
    if (error) { alert('Download failed: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChosen} />

      {/* Summary tiles */}
      <div className="grid sm:grid-cols-2 gap-4">
        <SummaryTile label="Uploaded This Month" value={uploadedThisMonth} sublabel="Videos delivered" color="#7C3AED" icon={Upload} />
        <SummaryTile label="Qualified This Month" value={qualifiedThisMonth} sublabel="Manager-approved · commission-eligible" color="#0F766E" icon={ShieldCheck} />
      </div>

      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
          <div>
            <div className="display-font text-2xl font-medium text-stone-900">Testimonial pipeline</div>
            <p className="text-sm text-stone-600 mt-1">Score candidates 0-10. Higher scores rise to the top. Upload the video when secured.</p>
          </div>
          <button onClick={addCandidate} disabled={adding}
            className="flex items-center gap-2 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium disabled:opacity-50">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add candidate
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-500" /></div>
        ) : candidates.length === 0 ? (
          <div className="mt-6 border-2 border-dashed border-stone-300 p-8 text-center">
            <div className="display-font text-lg font-medium text-stone-700 mb-1">No candidates yet</div>
            <p className="text-sm text-stone-500 mb-4">Add the customers you think would be willing to give a testimonial.</p>
            <button onClick={addCandidate} className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" /> Add first candidate
            </button>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Customer</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[260px]">Score</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Video</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Qualified</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(c => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    onUpdate={(patch) => updateCandidate(c.id, patch)}
                    onUpload={() => triggerUpload(c.id)}
                    onDownload={() => downloadVideo(c)}
                    onRemove={() => removeCandidate(c.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function CandidateRow({ candidate: c, onUpdate, onUpload, onDownload, onRemove }) {
  const hasVideo = !!c.video_uploaded_at
  const canDelete = !c.qualified // CSMs can only delete unqualified rows; managers can delete anything via a different view
  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50/40 transition-colors">
      <td className="py-2 px-3">
        <input
          value={c.customer_name || ''}
          onChange={(e) => onUpdate({ customer_name: e.target.value })}
          placeholder="Customer name"
          className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm"
        />
      </td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-3">
          <input
            type="range" min="0" max="10" step="1"
            value={c.score ?? 5}
            onChange={(e) => onUpdate({ score: Number(e.target.value) })}
            className="flex-1 accent-stone-900"
          />
          <div className="display-font text-lg font-medium num-tabular w-6 text-right">{c.score ?? 0}</div>
        </div>
      </td>
      <td className="py-2 px-3">
        {c._uploading ? (
          <div className="flex items-center gap-2 text-stone-600 text-xs"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</div>
        ) : hasVideo ? (
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <button onClick={onDownload} className="text-xs text-stone-700 hover:text-stone-900 underline truncate max-w-[140px]" title={c.video_filename}>
              {c.video_filename || 'View video'}
            </button>
          </div>
        ) : (
          <button onClick={onUpload} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-stone-300 hover:border-stone-900 hover:bg-stone-50 transition-colors">
            <Upload className="w-3.5 h-3.5" /> Upload video
          </button>
        )}
      </td>
      <td className="py-2 px-3">
        {c.qualified ? (
          <span className="inline-flex items-center gap-1 mono-font text-[9px] uppercase tracking-widest text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
            <ShieldCheck className="w-3 h-3" /> Qualified
          </span>
        ) : hasVideo ? (
          <span className="mono-font text-[9px] uppercase tracking-widest text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">Pending review</span>
        ) : (
          <span className="text-xs text-stone-400">—</span>
        )}
      </td>
      <td className="py-2 px-3 text-right">
        <button
          onClick={onRemove}
          disabled={!canDelete}
          title={canDelete ? 'Remove' : 'Qualified — only manager can remove'}
          className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-stone-400"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  )
}

// ============================================================================
//  Retention section
// ============================================================================

function RetentionSection({ weekData, setRetention }) {
  const customers = weekData.ttfvCustomers || []
  const channelPartners = customers.filter(c => c.channelPartner)
  const cpHealth = {
    green: channelPartners.filter(c => c.healthScore === 'green').length,
    yellow: channelPartners.filter(c => c.healthScore === 'yellow').length,
    red: channelPartners.filter(c => c.healthScore === 'red').length,
    unrated: channelPartners.filter(c => !c.healthScore).length,
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">Retention & health</div>
        <p className="text-sm text-stone-600 mb-6">Pulled manually from your other systems for now.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <TextField label="Churn Rate (%)" value={weekData.retention.churnRate} onChange={(v) => setRetention('churnRate', v)} />
          <TextField label="NRR (%)" value={weekData.retention.nrr} onChange={(v) => setRetention('nrr', v)} />
          <TextField label="NPS" value={weekData.retention.nps} onChange={(v) => setRetention('nps', v)} />
          <TextField label="Health Score" value={weekData.retention.healthScore} onChange={(v) => setRetention('healthScore', v)} />
        </div>
      </div>

      {/* Channel Partner retention snapshot */}
      <div className="bg-white border border-stone-200 p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: CHANNEL_PARTNER_COLOR }} />
        <div className="flex items-center gap-2 mb-1">
          <Star className="w-5 h-5" style={{ color: CHANNEL_PARTNER_COLOR, fill: CHANNEL_PARTNER_COLOR }} />
          <div className="display-font text-2xl font-medium text-stone-900">Channel Partner retention</div>
          <span className="mono-font text-[10px] uppercase tracking-widest px-2 py-0.5 rounded text-white num-tabular"
            style={{ background: CHANNEL_PARTNER_COLOR }}>
            {channelPartners.length}
          </span>
        </div>
        <p className="text-sm text-stone-600 mb-4">Health rollup for your priority customers — drill into <span className="font-medium">Health Scores</span> to update.</p>
        {channelPartners.length === 0 ? (
          <div className="border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No channel partners flagged. Toggle the <Star className="w-3.5 h-3.5 inline -mt-0.5" /> on a customer in the <span className="font-medium">Launches & TTFV</span> tab.
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <RetentionMiniTile label="Healthy"  count={cpHealth.green}   total={channelPartners.length} color="#10B981" />
            <RetentionMiniTile label="At Risk"  count={cpHealth.yellow}  total={channelPartners.length} color="#F59E0B" />
            <RetentionMiniTile label="Critical" count={cpHealth.red}     total={channelPartners.length} color="#EF4444" />
            <RetentionMiniTile label="Unrated"  count={cpHealth.unrated} total={channelPartners.length} color="#A8A29E" />
          </div>
        )}
      </div>
    </div>
  )
}

function RetentionMiniTile({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="border border-stone-200 p-3 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="mono-font text-[9px] uppercase tracking-widest text-stone-500 mb-1">{label}</div>
      <div className="display-font text-2xl font-medium text-stone-900 num-tabular leading-none">{count}</div>
      <div className="text-[10px] text-stone-500 mt-1 num-tabular">{pct}% of CPs</div>
    </div>
  )
}

// ============================================================================
//  Small shared widgets
// ============================================================================

function NumberField({ label, value, onChange, unit, highlight, help }) {
  return (
    <div className={`border p-4 ${highlight ? 'border-amber-400 bg-amber-50/40' : 'border-stone-200'}`}>
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">{label}</div>
      <div className="flex items-baseline gap-2">
        <input type="number" min="0" value={value || ''} onChange={(e) => onChange(e.target.value)}
          className="w-full py-2 px-3 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-2xl display-font font-medium bg-transparent" />
        {unit && <span className="text-sm text-stone-500">{unit}</span>}
      </div>
      {help && <div className="text-[11px] text-stone-500 mt-2 leading-snug">{help}</div>}
    </div>
  )
}

function TextField({ label, value, onChange }) {
  return (
    <div className="border border-stone-200 p-4">
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">{label}</div>
      <input value={value || ''} onChange={(e) => onChange(e.target.value)}
        className="w-full py-2 px-3 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-2xl display-font font-medium bg-transparent" />
    </div>
  )
}

function SummaryTile({ label, value, sublabel, color, icon: Icon }) {
  return (
    <div className="bg-white border border-stone-200 p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
      <div className="flex items-start justify-between mb-3">
        <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
        <Icon className="w-4 h-4 text-stone-400" />
      </div>
      <div className="display-font text-4xl font-medium text-stone-900 num-tabular leading-none">{value}</div>
      <div className="text-xs text-stone-500 mt-2">{sublabel}</div>
    </div>
  )
}

// ============================================================================
//  Health Scores Section (per-customer 🟢🟡🔴)
// ============================================================================

const HEALTH_OPTIONS = [
  { key: '',       label: '—',        color: '#D6D3D1', textColor: '#78716C' },
  { key: 'green',  label: '🟢 Healthy', color: '#10B981', textColor: '#047857' },
  { key: 'yellow', label: '🟡 At Risk', color: '#F59E0B', textColor: '#A16207' },
  { key: 'red',    label: '🔴 Critical', color: '#EF4444', textColor: '#B91C1C' },
]

function HealthSection({ weekData, update }) {
  const customers = weekData.ttfvCustomers || []
  const [showOnlyChannelPartners, setShowOnlyChannelPartners] = useState(false)

  const setHealth = (id, score) => update(d => ({
    ...d,
    ttfvCustomers: (d.ttfvCustomers || []).map(c => c.id === id ? { ...c, healthScore: score } : c),
  }))

  const counts = {
    green: customers.filter(c => c.healthScore === 'green').length,
    yellow: customers.filter(c => c.healthScore === 'yellow').length,
    red: customers.filter(c => c.healthScore === 'red').length,
    unrated: customers.filter(c => !c.healthScore).length,
  }

  const channelPartnerCount = customers.filter(c => c.channelPartner).length
  const visibleCustomers = showOnlyChannelPartners
    ? customers.filter(c => c.channelPartner)
    : customers

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <HealthTile label="Healthy" count={counts.green} color="#10B981" />
        <HealthTile label="At Risk" count={counts.yellow} color="#F59E0B" />
        <HealthTile label="Critical" count={counts.red} color="#EF4444" />
        <HealthTile label="Unrated" count={counts.unrated} color="#A8A29E" />
      </div>

      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">Customer health scores</div>
        <p className="text-sm text-stone-600 mb-4">
          Manually rate each customer's health. <span className="text-stone-500">In the future, these can be populated automatically from your application.</span>
        </p>

        {customers.length > 0 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">Filter:</span>
            <button
              onClick={() => setShowOnlyChannelPartners(false)}
              className={`text-xs px-2.5 py-1 transition-colors ${!showOnlyChannelPartners ? 'bg-stone-900 text-stone-50' : 'border border-stone-200 text-stone-600 hover:border-stone-900'}`}>
              All ({customers.length})
            </button>
            <button
              onClick={() => setShowOnlyChannelPartners(true)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 transition-colors ${showOnlyChannelPartners ? 'text-white' : 'border text-stone-600 hover:text-stone-900'}`}
              style={showOnlyChannelPartners
                ? { background: CHANNEL_PARTNER_COLOR }
                : { borderColor: '#E7E5E4' }}>
              <Star className="w-3 h-3" style={{ fill: showOnlyChannelPartners ? '#fff' : 'transparent' }} />
              Channel Partners ({channelPartnerCount})
            </button>
          </div>
        )}

        {customers.length === 0 ? (
          <div className="border-2 border-dashed border-stone-300 p-8 text-center">
            <div className="display-font text-lg font-medium text-stone-700 mb-1">No customers yet</div>
            <p className="text-sm text-stone-500">Add customers in the "Launches & TTFV" tab.</p>
          </div>
        ) : visibleCustomers.length === 0 ? (
          <div className="border-2 border-dashed border-stone-300 p-8 text-center">
            <div className="display-font text-lg font-medium text-stone-700 mb-1">No channel partners flagged</div>
            <p className="text-sm text-stone-500">Toggle the <Star className="w-3.5 h-3.5 inline -mt-0.5" /> on a customer in the TTFV tab.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Customer</th>
                  <th className="text-left py-2 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium w-[200px]">Health Score</th>
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map(c => (
                  <tr key={c.id} className="border-b border-stone-100">
                    <td className="py-2 px-3 font-medium text-stone-800">
                      <div className="flex items-center gap-2">
                        {c.channelPartner && (
                          <Star className="w-3.5 h-3.5 flex-shrink-0" style={{ color: CHANNEL_PARTNER_COLOR, fill: CHANNEL_PARTNER_COLOR }} title="Channel Partner" />
                        )}
                        <span>{c.name || <span className="text-stone-400 italic">Unnamed</span>}</span>
                        {c.channelPartner && (
                          <span className="mono-font text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded text-white"
                            style={{ background: CHANNEL_PARTNER_COLOR }}>
                            Priority
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <select value={c.healthScore || ''} onChange={(e) => setHealth(c.id, e.target.value)}
                        className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white"
                        style={{ color: HEALTH_OPTIONS.find(h => h.key === (c.healthScore || ''))?.textColor }}>
                        {HEALTH_OPTIONS.map(h => <option key={h.key} value={h.key}>{h.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function HealthTile({ label, count, color }) {
  return (
    <div className="border border-stone-200 bg-white p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">{label}</div>
      <div className="display-font text-3xl font-medium text-stone-900 num-tabular">{count}</div>
    </div>
  )
}

// ============================================================================
//  Monthly View (with NRR + NPS inputs)
// ============================================================================

function FdeMonthlyView({ profile }) {
  const monthKey = useMemo(() => getMonthKey(), [])
  const { weeks, monthly, loading, saveMonthly } = useMtdData(profile.id, monthKey)
  const { targets } = useTargets(profile.id, profile.role_type)
  const [localMonthly, setLocalMonthly] = useState({})

  useEffect(() => { setLocalMonthly(monthly || {}) }, [monthly])

  const handleSave = (key, value) => {
    const next = { ...localMonthly, [key]: value }
    setLocalMonthly(next)
    saveMonthly({ [key]: value })
  }

  if (loading) return <div className="bg-white border border-stone-200 p-12 flex justify-center"><RocketLoader className="min-h-[160px]" label="Loading…" /></div>

  // Compute NRR
  const startMrr = Number(localMonthly.startingMrr) || 0
  const expansionMrr = Number(localMonthly.expansionMrr) || 0
  const churnedMrr = Number(localMonthly.churnedMrr) || 0
  const contractionMrr = Number(localMonthly.contractionMrr) || 0
  const nrrPct = startMrr > 0 ? ((startMrr + expansionMrr - churnedMrr - contractionMrr) / startMrr) * 100 : null

  // MTD aggregates from weekly data
  let totalLaunches = 0
  let totalTestimonials = 0
  for (const w of weeks) {
    const data = w.data || {}
    if (data.launches) totalLaunches += Number(data.launches.count || 0)
    if (data.testimonials) totalTestimonials += Number(data.testimonials.count || 0)
  }

  const npsScore = localMonthly.npsScore !== undefined && localMonthly.npsScore !== '' && !isNaN(Number(localMonthly.npsScore))
    ? Number(localMonthly.npsScore) : null

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">Net Revenue Retention</div>
        <p className="text-sm text-stone-600 mb-4">Enter monthly MRR figures. NRR = (Starting + Expansion − Churn − Contraction) / Starting.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MonthlyInput label="Starting MRR" value={localMonthly.startingMrr} onChange={(v) => handleSave('startingMrr', v)} prefix="$" />
          <MonthlyInput label="Expansion MRR" value={localMonthly.expansionMrr} onChange={(v) => handleSave('expansionMrr', v)} prefix="$" />
          <MonthlyInput label="Churned MRR" value={localMonthly.churnedMrr} onChange={(v) => handleSave('churnedMrr', v)} prefix="$" />
          <MonthlyInput label="Contraction MRR" value={localMonthly.contractionMrr} onChange={(v) => handleSave('contractionMrr', v)} prefix="$" />
        </div>
      </div>

      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">NPS Score</div>
        <p className="text-sm text-stone-600 mb-4">Aggregate NPS from customer surveys this month. Range: -100 to +100.</p>
        <div className="max-w-xs">
          <MonthlyInput label="NPS Score" value={localMonthly.npsScore} onChange={(v) => handleSave('npsScore', v)} placeholder="e.g. 47" />
        </div>
      </div>

      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">Month-to-date</div>
        <div className="text-sm text-stone-600 mb-4">{formatMonthLabel(monthKey)} · {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} of data</div>
        <MtdLegend />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MtdCard label="Net Revenue Retention" value={nrrPct} target={targets.nrr_pct} unit="pct" />
          <MtdCard label="NPS Score" value={npsScore} target={targets.nps_score} />
          <MtdCard label="Launches" value={totalLaunches} target={targets.launches_count} />
          <MtdCard label="Testimonials" value={totalTestimonials} target={targets.testimonials_count} />
        </div>
      </div>
    </div>
  )
}

function MonthlyInput({ label, value, onChange, prefix, placeholder }) {
  return (
    <div className="border border-stone-200 p-4">
      <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">{label}</div>
      <div className="flex items-baseline gap-1">
        {prefix && <span className="text-stone-500 display-font text-xl">{prefix}</span>}
        <input type="number" step="any" value={value || ''} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || '0'}
          className="w-full py-2 px-2 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-xl display-font font-medium bg-transparent" />
      </div>
    </div>
  )
}
