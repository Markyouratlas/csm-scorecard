import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  LayoutDashboard, Users, UserCircle2, Award, Clock, Quote,
  CalendarCheck, Loader2, Shield, ShieldOff, ShieldCheck, Trash2, Download,
  Crown, UserCheck, Briefcase, Ticket, Headphones, Target, BarChart3, Megaphone, Star,
  Archive, ArchiveRestore, Eye, Lightbulb, UserMinus, DollarSign, Check,
  ChevronLeft, ChevronRight, ChevronDown, Phone, Handshake
} from 'lucide-react'
import { supabase } from './supabase'
import { useQuery } from '@tanstack/react-query'
import {
  sum, BLANK_WEEK, PIPELINE_STAGES, MEETING_CATEGORIES, avgTtfv, customerTtfv,
  cancellationCategoryLabel
} from './constants'
import { sumDays, avgDays, cpl, ctr, cpm, bookingRate, showUpRate, closeRate } from './metrics'
import { getWeekKey, formatWeekLabel, stepWeek } from './dateUtils'
import { TEAMS, getTeam, getRoleLabel, getTeamLabel, getTeamColor, accessTier, leadTeamKeys, DEFAULT_WORK_DAYS, isLeadershipRole } from './teams'

import ScorecardViewer from './ScorecardViewer'
import RocketLoader from './RocketLoader'
import AtlasLogo, { ATLAS_PURPLE } from './AtlasLogo'
import HeaderNav from './HeaderNav'
import SettingsModal from './SettingsModal'
import { useGlassInteraction } from './hooks/useGlassInteraction.js'

async function fetchManagerData(weekKey) {
  const { data: profiles, error: pErr } = await supabase
    .from('profiles').select('*').order('created_at', { ascending: true })
  if (pErr) console.error(pErr)
  const { data: scorecards, error: sErr } = await supabase
    .from('weekly_scorecards').select('*').eq('week_key', weekKey)
  if (sErr) console.error(sErr)
  const scorecardData = {}; const submittedMap = {}
  ;(scorecards || []).forEach(s => {
    scorecardData[s.user_id] = s.data
    submittedMap[s.user_id] = s.submitted_at || null
  })
  return { allProfiles: profiles || [], scorecardData, submittedMap }
}

export default function ManagerView({ profile, initialTeam, onSignOut, onSwitchToSelf, onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership, onSwitchToCommissions, onProfileUpdated }) {
  const tier = accessTier(profile)
  const isExec = tier === 'executive'
  const headerRef = useGlassInteraction()
  const [showSettings, setShowSettings] = useState(false)

  // Team leads see their own team + any granted managed_teams (cross-team access).
  const leadTeams = useMemo(() => leadTeamKeys(profile), [profile])
  const visibleTeams = useMemo(() => {
    if (isExec) return TEAMS
    return TEAMS.filter(t => leadTeams.includes(t.key))
  }, [isExec, leadTeams])

  // Default tab: a focused team (when launched from a Quick Log department card),
  // else 'overview' for execs and the lead's first managed team.
  // initialTeam is only honored if the viewer is allowed to see that team.
  const [tab, setTab] = useState(() => {
    if (initialTeam && (isExec || leadTeams.includes(initialTeam))) return initialTeam
    return isExec ? 'overview' : (leadTeams[0] || profile.team)
  })
  // When set, we're viewing one specific member's scorecard (not the dashboard).
  // Persisted to sessionStorage so executives drilling into a specific member's
  // scorecard don't lose their place when switching browser tabs.
  const [viewingMember, setViewingMemberRaw] = useState(null)
  const setViewingMember = useCallback((member) => {
    setViewingMemberRaw(member)
    try {
      if (member?.id) sessionStorage.setItem('atlas:viewingMemberId', member.id)
      else sessionStorage.removeItem('atlas:viewingMemberId')
    } catch {}
  }, [])

  // Whether to include archived users in the visible roster + dashboards.
  const [showArchived, setShowArchived] = useState(false)
  // Time range selector — week is the only fully built mode for now.
  // Other modes render a "coming soon" callout so the team knows it's planned.
  const [timeRange, setTimeRange] = useState('week') // 'week' | 'month' | 'quarter' | 'year'
  // weekKey is now state (not a memo) so the selector below can change it.
  const [weekKey, setWeekKey] = useState(() => getWeekKey())
  const currentWeekKey = getWeekKey()
  const isViewingCurrentWeek = weekKey === currentWeekKey

  // Manager dashboard data (all profiles + this week's scorecards), cached at
  // the app-root QueryClient and keyed by weekKey so switching weeks and
  // returning renders from cache and refreshes in the background.
  const { data: managerData, isPending, refetch } = useQuery({
    queryKey: ['manager', weekKey],
    queryFn: () => fetchManagerData(weekKey),
  })

  const allProfiles = managerData?.allProfiles ?? []
  const scorecardData = managerData?.scorecardData ?? {}
  // user_id → submitted_at; drives the "Submitted" badge.
  const submittedMap = managerData?.submittedMap ?? {}
  const loading = isPending
  const reload = refetch

  // Rehydrate viewingMember from sessionStorage once profiles are loaded, so an
  // exec drilling into a member "sticks" across tab switches. The `prev ||`
  // guard ensures it never overrides a current selection.
  useEffect(() => {
    try {
      const savedId = sessionStorage.getItem('atlas:viewingMemberId')
      if (savedId && allProfiles.length) {
        setViewingMemberRaw(prev => prev || (allProfiles.find(p => p.id === savedId) || null))
      }
    } catch {}
  }, [allProfiles])

  // Filter profiles for team leads — they see their own team + managed_teams.
  // Also filter out archived users unless showArchived is enabled
  const visibleProfiles = useMemo(() => {
    let result = isExec ? allProfiles : allProfiles.filter(p => leadTeams.includes(p.team))
    if (!showArchived) {
      result = result.filter(p => !p.archived_at)
    }
    return result
  }, [isExec, allProfiles, leadTeams, showArchived])

  const archivedCount = useMemo(
    () => (isExec ? allProfiles : allProfiles.filter(p => leadTeams.includes(p.team))).filter(p => p.archived_at).length,
    [isExec, allProfiles, leadTeams]
  )

  if (loading) return <RocketLoader className="min-h-screen" label="Loading the dashboard…" />

  // If viewing a specific member's scorecard, render that instead of the dashboard
  if (viewingMember) {
    return (
      <ScorecardViewer
        targetProfile={viewingMember}
        viewer={profile}
        onSignOut={onSignOut}
        onBack={() => {
          setViewingMember(null)
          reload()  // refresh data when returning, in case edits were made
        }}
      />
    )
  }

  return (
    <div className="min-h-screen">
      <header ref={headerRef} className="glass-nav glass-nav-strip sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <AtlasLogo height={32} />
            <div className="border-l border-stone-300 pl-4">
              <div className="display-font text-lg font-medium text-stone-900 leading-tight">
                {isExec ? 'Executive Dashboard' : `${getTeamLabel(leadTeams[0] || profile.team)} Dashboard`}
              </div>
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">Week of {formatWeekLabel(weekKey)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {archivedCount > 0 && (
              <button
                onClick={() => setShowArchived(s => !s)}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 transition-colors ${showArchived ? 'bg-stone-200 text-stone-900' : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'}`}
                title={showArchived ? 'Hide archived users' : `Show ${archivedCount} archived user${archivedCount === 1 ? '' : 's'}`}
              >
                <Archive className="w-3.5 h-3.5" />
                {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
              </button>
            )}
            <HeaderNav
              currentPage="manager"
              onSwitchToLeadership={onSwitchToLeadership}
              onSwitchToIntegrations={onSwitchToIntegrations}
              onSwitchToFeatureRequests={onSwitchToFeatureRequests}
              onSwitchToCancellations={onSwitchToCancellations}
              onSwitchToCommissions={onSwitchToCommissions}
              onSwitchToApiGuide={onSwitchToApiGuide}
              onSwitchToSelf={isLeadershipRole(profile.role_type) ? null : onSwitchToSelf}
              onOpenSettings={() => setShowSettings(true)}
              onSignOut={onSignOut}
            />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Tab nav */}
        <div className="flex flex-wrap gap-2 mb-8">
          {isExec && (
            <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={LayoutDashboard}>Overview</TabButton>
          )}
          {visibleTeams.map(team => (
            <TabButton key={team.key} active={tab === team.key} onClick={() => setTab(team.key)} icon={Briefcase} color={team.color}>
              {team.label}
            </TabButton>
          ))}
          {/* Testimonials tab — visible to executives, or to team leads of CS or FDE teams */}
          {(isExec || (profile.is_team_lead && (profile.team === 'customer_success' || profile.team === 'forward_deployed'))) && (
            <TabButton active={tab === 'testimonials'} onClick={() => setTab('testimonials')} icon={Quote}>Testimonials</TabButton>
          )}
          <TabButton active={tab === 'roster'} onClick={() => setTab('roster')} icon={UserCircle2}>Roster</TabButton>
        </div>

        {/* Time range selector — only on time-sensitive tabs (overview + team tabs).
            Roster and Testimonials don't aggregate by time so we hide it there. */}
        {(tab === 'overview' || visibleTeams.find(t => t.key === tab)) && (
          <TimeRangeSelector
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            weekKey={weekKey}
            setWeekKey={setWeekKey}
            currentWeekKey={currentWeekKey}
            isViewingCurrentWeek={isViewingCurrentWeek}
          />
        )}

        {tab === 'overview' && isExec && timeRange === 'week' && (
          <ExecOverviewTab profiles={visibleProfiles} data={scorecardData} submittedMap={submittedMap} isViewingCurrentWeek={isViewingCurrentWeek} weekKey={weekKey} />
        )}
        {visibleTeams.find(t => t.key === tab) && timeRange === 'week' && (
          <TeamTab teamKey={tab} profiles={visibleProfiles} data={scorecardData} submittedMap={submittedMap} onViewMember={setViewingMember} isViewingCurrentWeek={isViewingCurrentWeek} weekKey={weekKey} />
        )}
        {/* Coming-soon placeholder when a longer time range is selected */}
        {(tab === 'overview' || visibleTeams.find(t => t.key === tab)) && timeRange !== 'week' && (
          <ComingSoonRange range={timeRange} />
        )}
        {tab === 'testimonials' && <TestimonialsManagerTab profiles={visibleProfiles} />}
        {tab === 'roster' && <RosterTab profiles={visibleProfiles} currentUser={profile} reload={reload} isExec={isExec} />}
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

function TabButton({ active, onClick, icon: Icon, children, color }) {
  const ref = useGlassInteraction()
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm transition-all ${active ? 'glass-tab glass-tab-active' : 'glass-tab text-stone-700'}`}
    >
      {Icon && <Icon className="w-4 h-4" style={!active && color ? { color } : {}} />} {children}
    </button>
  )
}

// ============================================================================
//  Executive Overview — one row per team
// ============================================================================

function ExecOverviewTab({ profiles, data, submittedMap, isViewingCurrentWeek, weekKey }) {
  const teamStats = useMemo(() => {
    return TEAMS.map(team => {
      const members = profiles.filter(p => p.team === team.key)
      // For now, only CSM team has live scorecard data flowing through
      const launched = members.reduce((s, m) => s + (data[m.id]?.launchedThisWeek || 0), 0)
      const allCustomers = members.flatMap(m => data[m.id]?.ttfvCustomers || [])
      const ttfv = avgTtfv(allCustomers)
      // Submission count for this team — how many members have submitted
      // their scorecard this week. Useful at-a-glance signal for leadership.
      const submittedCount = members.filter(m => submittedMap?.[m.id]).length
      return {
        team,
        memberCount: members.length,
        leadCount: members.filter(m => m.is_team_lead).length,
        liveRoles: team.roles.filter(r => r.status === 'live').length,
        totalRoles: team.roles.length,
        launched,
        ttfv,
        submittedCount,
      }
    })
  }, [profiles, data, submittedMap])

  return (
    <div className="space-y-8">
      <div className="fade-up">
        <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">
          Executive view · {isViewingCurrentWeek ? 'this week' : `week of ${formatWeekLabel(weekKey)}`}
        </div>
        <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1] tracking-tight text-stone-900">
          Every team's <em className="font-light">scorecard.</em>
        </h1>
      </div>

      <div className="grid md:grid-cols-2 gap-4 fade-up" style={{ animationDelay: '60ms' }}>
        {teamStats.map(({ team, memberCount, leadCount, liveRoles, totalRoles, launched, ttfv, submittedCount }) => {
          const allSubmitted = submittedCount > 0 && submittedCount === memberCount
          return (
          <div key={team.key} className="bg-white border border-stone-200 p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: team.color }} />
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="display-font text-2xl font-medium text-stone-900">{team.label}</div>
                <div className="text-xs text-stone-500 mt-1">{memberCount} member{memberCount !== 1 ? 's' : ''} · {leadCount} lead{leadCount !== 1 ? 's' : ''}</div>
              </div>
              <Briefcase className="w-5 h-5" style={{ color: team.color }} />
            </div>
            {/* Weekly submission status — visible regardless of team type so
                leadership can see at a glance who's wrapped up the week. */}
            {memberCount > 0 && (
              <div
                className="flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded text-xs"
                style={{
                  background: allSubmitted ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.06)',
                  color: allSubmitted ? '#065F46' : '#92400E',
                  border: `1px solid ${allSubmitted ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
                }}
              >
                {allSubmitted ? <Check className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                <span className="font-medium">{submittedCount} of {memberCount} submitted {isViewingCurrentWeek ? 'this week' : 'that week'}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {team.key === 'customer_success' ? (
                <>
                  <MiniStat label="Launched" value={launched} />
                  <MiniStat label="Avg TTFV" value={ttfv ? `${ttfv}d` : '—'} />
                </>
              ) : (
                <>
                  <MiniStat label="Roles built" value={`${liveRoles}/${totalRoles}`} sublabel={liveRoles === totalRoles ? '✓ Complete' : '○ Phasing in'} />
                  <MiniStat label="Members" value={memberCount} />
                </>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {team.roles.map(r => (
                <span key={r.key}
                  className={`mono-font text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded ${r.status === 'live' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                  {r.label}{r.status === 'coming_soon' ? ' · soon' : ''}
                </span>
              ))}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}

function MiniStat({ label, value, sublabel }) {
  return (
    <div className="border border-stone-200 p-3">
      <div className="mono-font text-[9px] uppercase tracking-widest text-stone-500 mb-1">{label}</div>
      <div className="display-font text-2xl font-medium text-stone-900 num-tabular leading-none">{value}</div>
      {sublabel && <div className="text-[10px] text-stone-500 mt-1">{sublabel}</div>}
    </div>
  )
}

// Time-range selector for the Manager view.
//
// • Tab strip on the left: Week (live) + Month/Quarter/Year (coming soon)
// • Week navigator on the right: appears only when in week mode — prev/next
//   arrows + the week label + a "Jump to current" shortcut when off-current
//
// The longer ranges intentionally render disabled buttons so the team can
// see what's planned without being able to break things by clicking through.
function TimeRangeSelector({ timeRange, setTimeRange, weekKey, setWeekKey, currentWeekKey, isViewingCurrentWeek }) {
  const ranges = [
    { key: 'week',    label: 'Week',    available: true },
    { key: 'month',   label: 'Month',   available: false },
    { key: 'quarter', label: 'Quarter', available: false },
    { key: 'year',    label: 'Year',    available: false },
  ]
  return (
    <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
      {/* Range tabs */}
      <div className="inline-flex bg-stone-100 rounded-lg p-1 gap-1">
        {ranges.map(r => {
          const active = r.key === timeRange
          return (
            <button
              key={r.key}
              onClick={() => r.available && setTimeRange(r.key)}
              disabled={!r.available}
              className={`relative px-4 py-1.5 text-sm rounded-md transition-all ${
                active
                  ? 'bg-white text-stone-900 shadow-sm font-medium'
                  : r.available
                    ? 'text-stone-600 hover:text-stone-900'
                    : 'text-stone-400 cursor-not-allowed'
              }`}
              title={!r.available ? 'Coming soon' : undefined}
            >
              {r.label}
              {!r.available && (
                <span className="ml-1.5 mono-font text-[8px] uppercase tracking-widest text-amber-700 align-top">soon</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Week navigator — only visible in week mode */}
      {timeRange === 'week' && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setWeekKey(stepWeek(weekKey, -1))}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-stone-700 hover:text-stone-900 hover:bg-stone-100 transition-colors rounded"
            title="Previous week"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <div className="flex flex-col items-center px-3 py-1 min-w-[180px]">
            <div className="mono-font text-[9px] uppercase tracking-widest text-stone-500">Viewing</div>
            <div className="font-medium text-stone-900 num-tabular text-sm">Week of {formatWeekLabel(weekKey)}</div>
          </div>
          <button
            onClick={() => setWeekKey(stepWeek(weekKey, 1))}
            disabled={weekKey >= currentWeekKey}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-stone-700 hover:text-stone-900 hover:bg-stone-100 transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
            title="Next week"
          >
            Next <ChevronRight className="w-4 h-4" />
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
      )}
    </div>
  )
}

// Placeholder shown when a non-week time range is selected. Real rollups
// (sum vs avg vs snapshot, per-metric per-team) require a design pass that
// hasn't happened yet — see the chat with Mark for the open questions.
function ComingSoonRange({ range }) {
  const labels = { month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' }
  const label = labels[range] || 'This view'
  return (
    <div
      className="rounded-lg p-10 text-center border border-dashed"
      style={{ borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.04)' }}
    >
      <div className="mono-font text-[10px] uppercase tracking-widest text-amber-700 mb-2">Coming soon</div>
      <div className="display-font text-2xl font-medium text-stone-900 mb-2">{label} rollups</div>
      <p className="text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
        We're working on aggregating these metrics across longer time ranges.
        Each KPI needs its own rule (sum, average, or snapshot) — we'll roll this
        out per team. For now, switch back to <span className="font-medium">Week</span> to
        navigate through past weeks individually.
      </p>
    </div>
  )
}

// Compact submission status indicator for member rows. Green pill when
// submitted (with a hover-revealed timestamp), grey "Not yet" when not.
function SubmissionPill({ submittedAt }) {
  const stamp = useMemo(() => {
    if (!submittedAt) return ''
    try {
      const d = new Date(submittedAt)
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    } catch { return '' }
  }, [submittedAt])
  if (submittedAt) {
    return (
      <span
        className="inline-flex items-center gap-1.5 mono-font text-[9px] uppercase tracking-widest px-2 py-1 rounded"
        style={{ background: 'rgba(16,185,129,0.1)', color: '#065F46', border: '1px solid rgba(16,185,129,0.25)' }}
        title={`Submitted ${stamp}`}
      >
        <Check className="w-3 h-3" /> Submitted
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 mono-font text-[9px] uppercase tracking-widest px-2 py-1 rounded text-stone-500"
      style={{ background: '#FAFAF9', border: '1px solid #E7E5E4' }}
    >
      <Clock className="w-3 h-3" /> Not yet
    </span>
  )
}

// ============================================================================
//  Team Tab — one component, switches by team key
// ============================================================================

function TeamTab({ teamKey, profiles, data, submittedMap, onViewMember, isViewingCurrentWeek, weekKey }) {
  const team = getTeam(teamKey)
  const members = profiles.filter(p => p.team === teamKey)
  const [roleSubTab, setRoleSubTab] = useState(team.roles[0].key)
  const activeRole = team.roles.find(r => r.key === roleSubTab) || team.roles[0]
  const roleMembers = members.filter(m => m.role_type === activeRole.key)

  return (
    <div className="space-y-8">
      <div className="fade-up">
        <div className="mono-font text-xs uppercase tracking-[0.2em] mb-3" style={{ color: team.color }}>
          {team.label} · {isViewingCurrentWeek ? 'this week' : `week of ${formatWeekLabel(weekKey)}`}
        </div>
        <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1] tracking-tight text-stone-900">
          {team.label} <em className="font-light">team.</em>
        </h1>
      </div>

      {/* Role sub-tabs */}
      {team.roles.length > 1 && (
        <div className="flex flex-wrap gap-2 fade-up">
          {team.roles.map(r => {
            const active = r.key === roleSubTab
            const count = members.filter(m => m.role_type === r.key).length
            return (
              <button key={r.key} onClick={() => setRoleSubTab(r.key)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm transition-all ${active ? 'bg-stone-900 text-stone-50' : 'bg-white border border-stone-200 text-stone-700 hover:border-stone-900'}`}>
                {r.label}
                <span className={`mono-font text-[9px] px-1.5 py-0.5 rounded ${active ? 'bg-stone-700' : 'bg-stone-100'}`}>{count}</span>
                {r.status === 'coming_soon' && <span className="mono-font text-[9px] uppercase tracking-widest text-amber-700">soon</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Role section */}
      {teamKey === 'customer_success' && activeRole.key === 'csm' ? (
        <CsmTeamSection members={roleMembers} data={data} submittedMap={submittedMap} onViewMember={onViewMember} />
      ) : (
        <RoleTeamSection role={activeRole} members={roleMembers} data={data} submittedMap={submittedMap} onViewMember={onViewMember} />
      )}
    </div>
  )
}

// ============================================================================
//  CSM team section (existing functionality, ported in)
// ============================================================================

function CsmTeamSection({ members, data, submittedMap, onViewMember }) {
  const totalLaunched = members.reduce((s, c) => s + (data[c.id]?.launchedThisWeek || 0), 0)
  const allCustomers = members.flatMap(c => data[c.id]?.ttfvCustomers || [])
  const teamAvgTtfv = avgTtfv(allCustomers)
  const totalMeetings = members.reduce((s, c) => {
    const m = data[c.id]?.meetings
    if (!m) return s
    return s + Object.values(m).reduce((sub, arr) => sub + sum(arr), 0)
  }, 0)
  // Phone-call rollups (defensive against old shapes without phoneCalls)
  const totalCallAttempts  = members.reduce((s, c) => s + sum((data[c.id]?.phoneCalls?.attempts)  || []), 0)
  const totalCallContacted = members.reduce((s, c) => s + sum((data[c.id]?.phoneCalls?.contacted) || []), 0)
  const teamContactRate = totalCallAttempts > 0
    ? Math.round((totalCallContacted / totalCallAttempts) * 100)
    : null
  const totals = PIPELINE_STAGES.reduce(
    (acc, p) => ({ ...acc, [p.key]: members.reduce((s, c) => s + (data[c.id]?.pipeline?.[p.key] || 0), 0) }), {})
  const grandTotal = PIPELINE_STAGES.reduce((s, p) => s + totals[p.key], 0)

  return (
    <div className="space-y-6">
      {/* KPIs — 5-up on wide screens so phone calls fit alongside the rest */}
      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiTile label="Launched" value={totalLaunched} sublabel="This week" color="#0F766E" icon={Award} />
        <KpiTile label="Avg TTFV" value={teamAvgTtfv || '—'} unit={teamAvgTtfv ? 'days' : ''} sublabel={teamAvgTtfv && teamAvgTtfv <= 14 ? '✓ On target' : teamAvgTtfv ? '↑ Above goal' : 'No data'} color="#1C1917" icon={Clock} />
        <KpiTile label="Meetings" value={totalMeetings} sublabel="All categories" color="#C2410C" icon={CalendarCheck} />
        <KpiTile
          label="Phone calls"
          value={totalCallAttempts}
          sublabel={teamContactRate !== null ? `${totalCallContacted} contacted · ${teamContactRate}%` : 'No attempts logged'}
          color="#6639A6"
          icon={Phone}
        />
        <KpiTile label="Customers in pipeline" value={grandTotal} sublabel="Across all CSMs" color="#7C3AED" icon={Users} />
      </div>

      {/* Per-CSM breakdown */}
      <div>
        <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">By CSM</div>
        <div className="bg-white border border-stone-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left py-3 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">CSM</th>
                <th className="text-left py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Status</th>
                <th className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Launched</th>
                <th className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Avg TTFV</th>
                <th className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium"># Customers</th>
                <th className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Meetings</th>
                <th className="text-right py-3 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Calls</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-stone-500">No CSMs yet.</td></tr>}
              {members.map(c => {
                const d = data[c.id]
                const customers = d?.ttfvCustomers || []
                const ttfv = avgTtfv(customers)
                const meetings = d?.meetings ? Object.values(d.meetings).reduce((s, arr) => s + sum(arr), 0) : 0
                const attempts  = sum((d?.phoneCalls?.attempts)  || [])
                const contacted = sum((d?.phoneCalls?.contacted) || [])
                const submittedAt = submittedMap?.[c.id]
                return (
                  <tr key={c.id}
                      onClick={() => onViewMember && onViewMember(c)}
                      className={`border-b border-stone-100 transition-colors ${onViewMember ? 'cursor-pointer hover:bg-stone-50' : 'hover:bg-stone-50/40'}`}
                      title={onViewMember ? `View ${c.name}'s scorecard` : undefined}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs" style={{ background: c.color, fontFamily: "'Instrument Serif', serif" }}>
                          {c.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-stone-900 flex items-center gap-1.5">
                            {c.name}
                            {c.is_team_lead && <span title="Team Lead"><UserCheck className="w-3.5 h-3.5 text-amber-600" /></span>}
                          </div>
                          <div className="text-xs text-stone-500">{c.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3"><SubmissionPill submittedAt={submittedAt} /></td>
                    <td className="py-3 px-3 text-right num-tabular font-semibold text-stone-900">{d?.launchedThisWeek || 0}</td>
                    <td className="py-3 px-3 text-right num-tabular text-stone-700">{ttfv ? `${ttfv}d` : '—'}</td>
                    <td className="py-3 px-3 text-right num-tabular text-stone-700">{customers.length}</td>
                    <td className="py-3 px-3 text-right num-tabular text-stone-700">{meetings}</td>
                    <td className="py-3 px-4 text-right num-tabular text-stone-700">
                      {attempts > 0 ? (
                        <span title={`${attempts} attempts · ${contacted} contacted`}>
                          {attempts}
                          <span className="text-stone-400 text-xs ml-1">/ {contacted}</span>
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pipeline rollup */}
      {members.length > 0 && (
        <div>
          <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">Customer pipeline</div>
          <div className="bg-white border border-stone-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left py-3 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Stage</th>
                  {members.map(c => (
                    <th key={c.id} className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest font-medium" style={{ color: c.color }}>
                      {c.name.split(' ')[0]}
                    </th>
                  ))}
                  <th className="text-right py-3 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-900 font-bold bg-stone-100">Total</th>
                </tr>
              </thead>
              <tbody>
                {PIPELINE_STAGES.map(stage => (
                  <tr key={stage.key} className="border-b border-stone-100 hover:bg-stone-50/40 transition-colors">
                    <td className="py-3 px-4 font-medium text-stone-800">
                      {stage.label}
                      {stage.key === 'launch' && <span className="ml-2 mono-font text-[9px] uppercase tracking-widest text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">North Star</span>}
                    </td>
                    {members.map(c => (
                      <td key={c.id} className="py-3 px-3 text-right num-tabular text-stone-700">{data[c.id]?.pipeline?.[stage.key] || 0}</td>
                    ))}
                    <td className="py-3 px-4 text-right num-tabular font-bold text-stone-900 bg-stone-100">{totals[stage.key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancellations + Feature Requests rollup (Batch 3) */}
      {members.length > 0 && <CsmCancellationsFeatureRequestsRollup members={members} />}
    </div>
  )
}

function CsmCancellationsFeatureRequestsRollup({ members }) {
  const [cancellations, setCancellations] = useState([])
  const [featureRequests, setFeatureRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const memberIds = members.map(m => m.id)
    if (memberIds.length === 0) { setLoading(false); return }
    Promise.all([
      supabase.from('cancellations').select('*').in('csm_id', memberIds),
      // Feature requests are now company-wide; filter to those logged by CS team members
      supabase.from('feature_requests').select('*').in('logged_by_id', memberIds),
    ]).then(([c, f]) => {
      if (cancelled) return
      if (c.error) console.error('Cancellations load error', c.error)
      if (f.error) console.error('Feature requests load error', f.error)
      setCancellations(c.data || [])
      setFeatureRequests(f.data || [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [members])

  const monthStart = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  }, [])

  const cancelledThisMonth = cancellations.filter(c => c.cancelled_date && new Date(c.cancelled_date + 'T00:00:00') >= monthStart)
  const mrrLost = cancelledThisMonth.reduce((s, c) => s + (Number(c.monthly_amount) || 0), 0)

  // Top reason
  const reasonCounts = cancellations.reduce((acc, c) => {
    const k = c.reason_category || 'other'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})
  const topReasonEntry = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]
  const topReason = topReasonEntry ? cancellationCategoryLabel(topReasonEntry[0]) : '—'

  // Feature request stats — open = anything not shipped or declined
  const frActive = featureRequests.filter(r => r.status !== 'shipped' && r.status !== 'declined').length
  const frShipped = featureRequests.filter(r => r.status === 'shipped').length

  if (loading) {
    return (
      <div>
        <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">Customer signals</div>
        <div className="bg-white border border-stone-200 p-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-500" /></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">Customer signals · all time</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile label="Cancellations (month)" value={cancelledThisMonth.length} sublabel={`${cancellations.length} all-time`} color="#B91C1C" icon={UserMinus} />
          <KpiTile label="MRR Lost (month)" value={`$${mrrLost.toFixed(0)}`} sublabel="Sum of monthly recurring" color="#A16207" icon={DollarSign} />
          <KpiTile label="Top cancel reason" value={<span className="text-2xl">{topReason}</span>} sublabel={topReasonEntry ? `${topReasonEntry[1]} of ${cancellations.length}` : 'No data yet'} color="#7C3AED" icon={Star} />
          <KpiTile label="Active feature requests" value={frActive} sublabel={`${frShipped} shipped`} color="#F59E0B" icon={Lightbulb} />
        </div>
      </div>

      {cancellations.length > 0 && (
        <div>
          <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">Cancellations by reason · all time</div>
          <div className="bg-white border border-stone-200 p-5">
            <div className="space-y-2">
              {Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).map(([key, count]) => {
                const pct = Math.round((count / cancellations.length) * 100)
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-44 text-sm text-stone-700 flex-shrink-0">{cancellationCategoryLabel(key)}</div>
                    <div className="flex-1 bg-stone-100 h-6 relative overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-stone-900" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-24 text-right text-sm num-tabular text-stone-700 flex-shrink-0">
                      <span className="font-semibold text-stone-900">{count}</span>
                      <span className="text-stone-500 ml-1.5">({pct}%)</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RoleTeamSection({ role, members, data, submittedMap, onViewMember }) {
  if (members.length === 0) {
    return (
      <div className="bg-white border border-stone-200 p-8">
        <div className="display-font text-xl font-medium text-stone-900 mb-1">No {role.label}s yet</div>
        <p className="text-sm text-stone-600">When someone signs up under this role, they'll appear here with their weekly stats.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <RoleKpis role={role} members={members} data={data} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500">By {role.label}</div>
          {onViewMember && (
            <div className="text-xs text-stone-500 italic">
              Click a row to view their full scorecard
            </div>
          )}
        </div>
        <div className="bg-white border border-stone-200 overflow-x-auto">
          <RoleMemberTable role={role} members={members} data={data} submittedMap={submittedMap} onViewMember={onViewMember} />
        </div>
      </div>
    </div>
  )
}

function RoleKpis({ role, members, data }) {
  // Compute role-specific aggregates
  let kpis = []

  if (role.key === 'implementation') {
    const totalCompleted = members.reduce((s, m) => {
      const wd = m.work_days || DEFAULT_WORK_DAYS
      const daily = data[m.id]?.daily || []
      return s + wd.reduce((sub, di) => sub + (Number(daily[di]?.completed) || 0), 0)
    }, 0)
    const totalNew = members.reduce((s, m) => {
      const wd = m.work_days || DEFAULT_WORK_DAYS
      const daily = data[m.id]?.daily || []
      return s + wd.reduce((sub, di) => sub + (Number(daily[di]?.newTickets) || 0), 0)
    }, 0)
    const totalProjects = members.reduce((s, m) => s + ((data[m.id]?.projects || []).length), 0)
    const stuck = members.reduce((s, m) => s + (data[m.id]?.projects || []).filter(p => p.status === 'stuck').length, 0)
    kpis = [
      { label: 'Tickets Completed', value: totalCompleted, sublabel: 'This week', color: '#0F766E', icon: Award },
      { label: 'New Tickets', value: totalNew, sublabel: 'Inbound load', color: '#1C1917', icon: Ticket },
      { label: 'Active Projects', value: totalProjects, sublabel: 'Across team', color: '#7C3AED', icon: Briefcase },
      { label: 'Stuck', value: stuck, sublabel: stuck > 0 ? '⚠ Needs attention' : '✓ All flowing', color: stuck > 0 ? '#B91C1C' : '#0F766E', icon: Clock },
    ]
  } else if (role.key === 'support') {
    const totalClosed = members.reduce((s, m) => {
      const wd = m.work_days || DEFAULT_WORK_DAYS
      const daily = data[m.id]?.daily || []
      return s + wd.reduce((sub, di) => sub + (Number(daily[di]?.ticketsClosed) || 0), 0)
    }, 0)
    // Avg response time across team
    const respTimes = members.map(m => {
      const wd = m.work_days || DEFAULT_WORK_DAYS
      const daily = data[m.id]?.daily || []
      return avgDays(wd.map(i => daily[i] || {}), 'firstResponseHours', 'ticketsReceived')
    }).filter(v => v !== null)
    const teamAvgResp = respTimes.length ? respTimes.reduce((s, v) => s + v, 0) / respTimes.length : null
    // Avg CSAT
    const csatPerMember = members.map(m => {
      const wd = m.work_days || DEFAULT_WORK_DAYS
      const daily = data[m.id]?.csat?.daily || []
      const valid = wd.map(i => daily[i]).filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v)))
      return valid.length ? valid.reduce((s, v) => s + Number(v), 0) / valid.length : null
    }).filter(v => v !== null)
    const teamAvgCsat = csatPerMember.length ? csatPerMember.reduce((s, v) => s + v, 0) / csatPerMember.length : null
    const totalEscalations = members.reduce((s, m) => s + ((data[m.id]?.escalations || []).length), 0)
    kpis = [
      { label: 'Tickets Closed', value: totalClosed, sublabel: 'This week', color: '#0F766E', icon: Award },
      { label: 'Avg Response', value: teamAvgResp !== null ? teamAvgResp.toFixed(1) : '—', unit: teamAvgResp !== null ? 'hrs' : '', sublabel: teamAvgResp !== null ? (teamAvgResp <= 4 ? '✓ Fast' : '↑ Slow') : '—', color: '#1C1917', icon: Clock },
      { label: 'Avg CSAT', value: teamAvgCsat !== null ? teamAvgCsat.toFixed(2) : '—', unit: teamAvgCsat !== null ? '/5' : '', sublabel: '—', color: '#7C3AED', icon: Star },
      { label: 'Escalations', value: totalEscalations, sublabel: 'This week', color: '#A16207', icon: Headphones },
    ]
  } else if (role.key === 'account_executive') {
    let totalBooked = 0, totalCompleted = 0, totalSignups = 0, pipeValue = 0
    members.forEach(m => {
      const wd = m.work_days || DEFAULT_WORK_DAYS
      const daily = data[m.id]?.daily || []
      wd.forEach(di => {
        totalBooked += Number(daily[di]?.demosBooked) || 0
        totalCompleted += Number(daily[di]?.demosCompleted) || 0
        totalSignups += Number(daily[di]?.trialSignups) || 0
      })
      pipeValue += (data[m.id]?.deals || []).reduce((s, d) => s + (Number(d.value) || 0), 0)
    })
    const showUp = showUpRate(totalCompleted, totalBooked)
    const close = closeRate(totalSignups, totalCompleted)
    kpis = [
      { label: 'Demos Completed', value: totalCompleted, sublabel: 'This week', color: '#1E40AF', icon: Award },
      { label: 'Show-Up Rate', value: showUp !== null ? `${(showUp * 100).toFixed(1)}%` : '—', sublabel: showUp !== null ? (showUp >= 0.75 ? '✓ At target' : '↓ Below') : '—', color: '#1C1917', icon: Users },
      { label: 'Close Rate', value: close !== null ? `${(close * 100).toFixed(1)}%` : '—', sublabel: close !== null ? (close >= 0.30 ? '✓ At target' : '↓ Below') : '—', color: '#0F766E', icon: Target },
      { label: 'Pipeline Value', value: pipeValue > 0 ? `$${(pipeValue / 1000).toFixed(0)}k` : '—', sublabel: 'Active deals', color: '#7C3AED', icon: Briefcase },
    ]
  } else if (role.key === 'growth_manager' || role.key === 'ad_strategist') {
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalLeads = 0, totalBooked = 0
    members.forEach(m => {
      const wd = m.work_days || DEFAULT_WORK_DAYS
      const daily = data[m.id]?.daily || []
      wd.forEach(di => {
        totalSpend += Number(daily[di]?.adSpend) || 0
        totalImpressions += Number(daily[di]?.impressions) || 0
        totalClicks += Number(daily[di]?.clicks) || 0
        totalLeads += Number(daily[di]?.leads) || 0
        totalBooked += Number(daily[di]?.demosBooked) || 0
      })
    })
    const cplValue = cpl(totalSpend, totalLeads)
    const ctrValue = ctr(totalClicks, totalImpressions)
    const cpmValue = cpm(totalSpend, totalImpressions)
    if (role.key === 'growth_manager') {
      const bookingValue = bookingRate(totalBooked, totalLeads)
      kpis = [
        { label: 'Total Leads', value: totalLeads, sublabel: 'This week', color: '#BE185D', icon: Users },
        { label: 'CPL', value: cplValue !== null ? `$${cplValue.toFixed(2)}` : '—', sublabel: cplValue !== null ? (cplValue <= 5 ? '✓ At/below $5' : '↑ Above $5') : '—', color: '#1C1917', icon: BarChart3 },
        { label: 'Booking Rate', value: bookingValue !== null ? `${(bookingValue * 100).toFixed(1)}%` : '—', sublabel: bookingValue !== null ? (bookingValue >= 0.20 ? '✓ At target' : '↓ Below') : '—', color: '#0F766E', icon: Target },
        { label: 'Ad Spend', value: totalSpend > 0 ? `$${totalSpend.toLocaleString()}` : '—', sublabel: 'This week', color: '#A16207', icon: Megaphone },
      ]
    } else {
      kpis = [
        { label: 'CPL', value: cplValue !== null ? `$${cplValue.toFixed(2)}` : '—', sublabel: cplValue !== null ? (cplValue <= 5 ? '✓ At/below $5' : '↑ Above $5') : '—', color: '#BE185D', icon: BarChart3 },
        { label: 'CTR', value: ctrValue !== null ? `${(ctrValue * 100).toFixed(2)}%` : '—', sublabel: ctrValue !== null ? (ctrValue >= 0.05 ? '✓ At target' : '↓ Below') : '—', color: '#1C1917', icon: Target },
        { label: 'CPM', value: cpmValue !== null ? `$${cpmValue.toFixed(2)}` : '—', sublabel: cpmValue !== null ? (cpmValue <= 10 ? '✓ At/below $10' : '↑ Above $10') : '—', color: '#0F766E', icon: Users },
        { label: 'Spend', value: totalSpend > 0 ? `$${totalSpend.toLocaleString()}` : '—', sublabel: 'This week', color: '#A16207', icon: Megaphone },
      ]
    }
  } else if (role.key === 'engineer') {
    let totalItems = 0, totalPrs = 0, totalBugs = 0
    const categoryTotals = {}
    members.forEach(m => {
      const d = data[m.id] || {}
      const themes = d.themes || []
      for (const t of themes) {
        const count = (t.bullets || []).length
        totalItems += count
        const cat = t.category || 'Uncategorized'
        categoryTotals[cat] = (categoryTotals[cat] || 0) + count
      }
      if (d.prsMerged !== '' && d.prsMerged !== null && !isNaN(Number(d.prsMerged))) totalPrs += Number(d.prsMerged)
      if (d.bugsIntroduced !== '' && d.bugsIntroduced !== null && !isNaN(Number(d.bugsIntroduced))) totalBugs += Number(d.bugsIntroduced)
    })
    const topCategory = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a)[0]
    kpis = [
      { label: 'Items Shipped', value: totalItems, sublabel: 'This week', color: '#7C3AED', icon: Award },
      { label: 'PRs Merged', value: totalPrs, sublabel: 'Self-reported', color: '#1C1917', icon: Briefcase },
      { label: 'Bugs Introduced', value: totalBugs, sublabel: totalBugs <= 12 ? '✓ Under team target' : '↑ Above team target', color: totalBugs <= 12 ? '#0F766E' : '#A16207', icon: BarChart3 },
      { label: 'Top Focus', value: topCategory ? topCategory[0] : '—', sublabel: topCategory ? `${topCategory[1]} items` : 'No data', color: '#BE185D', icon: Target },
    ]
  } else {
    return null
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((k, i) => (
        <KpiTile key={i} label={k.label} value={k.value} unit={k.unit} sublabel={k.sublabel} color={k.color} icon={k.icon} />
      ))}
    </div>
  )
}

function RoleMemberTable({ role, members, data, submittedMap, onViewMember }) {
  // Each role gets its own column set
  let columns = []
  if (role.key === 'implementation') {
    columns = [
      { key: 'completed', label: 'Completed', compute: (m) => sumWorkDays(m, data, 'completed') },
      { key: 'newTickets', label: 'New', compute: (m) => sumWorkDays(m, data, 'newTickets') },
      { key: 'pending', label: 'Pending (EOD)', compute: (m) => endOfWeekValue(m, data, 'pending') },
      { key: 'projects', label: 'Active Projects', compute: (m) => (data[m.id]?.projects || []).length },
    ]
  } else if (role.key === 'support') {
    columns = [
      { key: 'closed', label: 'Closed', compute: (m) => sumWorkDays(m, data, 'ticketsClosed') },
      { key: 'received', label: 'Received', compute: (m) => sumWorkDays(m, data, 'ticketsReceived') },
      { key: 'response', label: 'Avg Response', compute: (m) => avgResponseStr(m, data) },
      { key: 'csat', label: 'CSAT', compute: (m) => avgCsatStr(m, data) },
    ]
  } else if (role.key === 'account_executive') {
    columns = [
      { key: 'completed', label: 'Demos Completed', compute: (m) => sumWorkDays(m, data, 'demosCompleted') },
      { key: 'booked', label: 'Demos Booked', compute: (m) => sumWorkDays(m, data, 'demosBooked') },
      { key: 'signups', label: 'Closes', compute: (m) => sumWorkDays(m, data, 'trialSignups') },
      { key: 'pipeline', label: 'Pipeline ($)', compute: (m) => {
        const v = (data[m.id]?.deals || []).reduce((s, d) => s + (Number(d.value) || 0), 0)
        return v > 0 ? `$${v.toLocaleString()}` : '—'
      } },
    ]
  } else if (role.key === 'growth_manager') {
    columns = [
      { key: 'leads', label: 'Leads', compute: (m) => sumWorkDays(m, data, 'leads') },
      { key: 'spend', label: 'Spend', compute: (m) => `$${sumWorkDays(m, data, 'adSpend').toLocaleString()}` },
      { key: 'cpl', label: 'CPL', compute: (m) => {
        const spend = sumWorkDays(m, data, 'adSpend')
        const leads = sumWorkDays(m, data, 'leads')
        const v = cpl(spend, leads)
        return v !== null ? `$${v.toFixed(2)}` : '—'
      } },
      { key: 'demos', label: 'Demos Booked', compute: (m) => sumWorkDays(m, data, 'demosBooked') },
    ]
  } else if (role.key === 'ad_strategist') {
    columns = [
      { key: 'spend', label: 'Spend', compute: (m) => `$${sumWorkDays(m, data, 'adSpend').toLocaleString()}` },
      { key: 'impressions', label: 'Impressions', compute: (m) => sumWorkDays(m, data, 'impressions').toLocaleString() },
      { key: 'leads', label: 'Leads', compute: (m) => sumWorkDays(m, data, 'leads') },
      { key: 'cpl', label: 'CPL', compute: (m) => {
        const spend = sumWorkDays(m, data, 'adSpend')
        const leads = sumWorkDays(m, data, 'leads')
        const v = cpl(spend, leads)
        return v !== null ? `$${v.toFixed(2)}` : '—'
      } },
    ]
  } else if (role.key === 'engineer') {
    columns = [
      { key: 'items', label: 'Items Shipped', compute: (m) => {
        const themes = data[m.id]?.themes || []
        return themes.reduce((s, t) => s + (t.bullets || []).length, 0)
      } },
      { key: 'prs', label: 'PRs Merged', compute: (m) => data[m.id]?.prsMerged || '—' },
      { key: 'bugs', label: 'Bugs', compute: (m) => data[m.id]?.bugsIntroduced || '—' },
      { key: 'topFocus', label: 'Top Focus', compute: (m) => {
        const themes = data[m.id]?.themes || []
        const cats = {}
        for (const t of themes) {
          const cat = t.category || 'Uncategorized'
          cats[cat] = (cats[cat] || 0) + (t.bullets || []).length
        }
        const top = Object.entries(cats).sort(([, a], [, b]) => b - a)[0]
        return top ? top[0] : '—'
      } },
    ]
  }

  return (
    <table className="w-full text-sm min-w-[760px]">
      <thead>
        <tr className="border-b border-stone-200 bg-stone-50">
          <th className="text-left py-3 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Member</th>
          <th className="text-left py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Status</th>
          {columns.map(c => (
            <th key={c.key} className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {members.map(m => (
          <tr key={m.id}
              onClick={() => onViewMember && onViewMember(m)}
              className={`border-b border-stone-100 transition-colors ${onViewMember ? 'cursor-pointer hover:bg-stone-50' : 'hover:bg-stone-50/40'}`}
              title={onViewMember ? `View ${m.name}'s scorecard` : undefined}>
            <td className="py-3 px-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs" style={{ background: m.color, fontFamily: "'Instrument Serif', serif" }}>
                  {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <div className="font-medium text-stone-900 flex items-center gap-1.5">
                    {m.name}
                    {m.is_team_lead && <span title="Team Lead"><UserCheck className="w-3.5 h-3.5 text-amber-600" /></span>}
                  </div>
                  <div className="text-xs text-stone-500">{m.title}</div>
                </div>
              </div>
            </td>
            <td className="py-3 px-3"><SubmissionPill submittedAt={submittedMap?.[m.id]} /></td>
            {columns.map(c => (
              <td key={c.key} className="py-3 px-3 text-right num-tabular text-stone-700">{c.compute(m)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ----- Helpers used by RoleMemberTable -----

function sumWorkDays(member, data, key) {
  const wd = member.work_days || DEFAULT_WORK_DAYS
  const daily = data[member.id]?.daily || []
  return wd.reduce((s, di) => s + (Number(daily[di]?.[key]) || 0), 0)
}

function endOfWeekValue(member, data, key) {
  const wd = member.work_days || DEFAULT_WORK_DAYS
  const daily = data[member.id]?.daily || []
  const lastDay = wd[wd.length - 1]
  return Number(daily[lastDay]?.[key]) || 0
}

function avgResponseStr(member, data) {
  const wd = member.work_days || DEFAULT_WORK_DAYS
  const daily = data[member.id]?.daily || []
  const v = avgDays(wd.map(i => daily[i] || {}), 'firstResponseHours', 'ticketsReceived')
  return v !== null ? `${v.toFixed(1)}h` : '—'
}

function avgCsatStr(member, data) {
  const wd = member.work_days || DEFAULT_WORK_DAYS
  const csatDaily = data[member.id]?.csat?.daily || []
  const valid = wd.map(i => csatDaily[i]).filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v)))
  if (!valid.length) return '—'
  const avg = valid.reduce((s, v) => s + Number(v), 0) / valid.length
  return avg.toFixed(2)
}

function KpiTile({ label, value, unit, sublabel, color, icon: Icon }) {
  return (
    <div className="bg-white border border-stone-200 p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
      <div className="flex items-start justify-between mb-3">
        <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
        <Icon className="w-4 h-4 text-stone-400" />
      </div>
      <div className="display-font text-4xl font-medium text-stone-900 num-tabular leading-none">
        {value}
        {unit && <span className="text-base text-stone-400 ml-2 font-normal">{unit}</span>}
      </div>
      <div className="text-xs text-stone-500 mt-2">{sublabel}</div>
    </div>
  )
}

// ============================================================================
//  Testimonials Manager Tab — unchanged, just visible to leads/execs
// ============================================================================

function TestimonialsManagerTab({ profiles }) {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)

  const csmById = useMemo(() => { const m = {}; profiles.forEach(c => { m[c.id] = c }); return m }, [profiles])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('testimonial_candidates')
      .select('*')
      .order('score', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setCandidates(data || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const toggleQualified = async (cand) => {
    const newVal = !cand.qualified
    const patch = newVal
      ? { qualified: true, qualified_at: new Date().toISOString() }
      : { qualified: false, qualified_at: null }
    setCandidates(prev => prev.map(c => c.id === cand.id ? { ...c, ...patch } : c))
    const { error } = await supabase.from('testimonial_candidates').update(patch).eq('id', cand.id)
    if (error) { console.error(error); load() }
  }

  const removeRow = async (cand) => {
    if (!confirm('Remove this testimonial candidate? This will also delete the uploaded video.')) return
    if (cand.video_path) {
      await supabase.storage.from('testimonial-videos').remove([cand.video_path])
    }
    const { error } = await supabase.from('testimonial_candidates').delete().eq('id', cand.id)
    if (error) { console.error(error); alert(error.message); return }
    setCandidates(prev => prev.filter(c => c.id !== cand.id))
  }

  const downloadVideo = async (cand) => {
    if (!cand.video_path) return
    const { data, error } = await supabase.storage.from('testimonial-videos').createSignedUrl(cand.video_path, 60)
    if (error) { alert('Download failed: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  // Filter to only candidates from CSMs visible to this manager
  const visibleCandidates = candidates.filter(c => csmById[c.csm_id])
  const withVideo = visibleCandidates.filter(c => c.video_uploaded_at)
  const withoutVideo = visibleCandidates.filter(c => !c.video_uploaded_at)

  return (
    <div className="space-y-8">
      <div className="fade-up">
        <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">Testimonials · review & qualify</div>
        <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1] tracking-tight text-stone-900">
          Sign off on <em className="font-light">commissions.</em>
        </h1>
        <p className="text-stone-600 mt-3 max-w-xl">Review uploaded testimonial videos. Mark as Qualified to make them commission-eligible for the CSM.</p>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-500" /></div>
      ) : (
        <>
          <Section title="Uploaded — awaiting your review" count={withVideo.length}>
            {withVideo.length === 0 ? (
              <div className="text-stone-500 text-sm py-6 text-center">No videos uploaded yet.</div>
            ) : (
              <CandidateTable rows={withVideo} csmById={csmById} onToggleQualified={toggleQualified} onDownload={downloadVideo} onRemove={removeRow} showVideo />
            )}
          </Section>

          <Section title="In the pipeline — no video yet" count={withoutVideo.length}>
            {withoutVideo.length === 0 ? (
              <div className="text-stone-500 text-sm py-6 text-center">No pending candidates.</div>
            ) : (
              <CandidateTable rows={withoutVideo} csmById={csmById} onToggleQualified={toggleQualified} onDownload={downloadVideo} onRemove={removeRow} showVideo={false} />
            )}
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, count, children }) {
  return (
    <div className="fade-up">
      <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">{title} · {count}</div>
      <div className="bg-white border border-stone-200 overflow-x-auto">{children}</div>
    </div>
  )
}

function CandidateTable({ rows, csmById, onToggleQualified, onDownload, onRemove, showVideo }) {
  return (
    <table className="w-full text-sm min-w-[760px]">
      <thead>
        <tr className="border-b border-stone-200 bg-stone-50">
          <th className="text-left py-3 px-4 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">CSM</th>
          <th className="text-left py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Customer</th>
          <th className="text-right py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Score</th>
          {showVideo && <th className="text-left py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Video</th>}
          <th className="text-left py-3 px-3 mono-font text-[10px] uppercase tracking-widest text-stone-600 font-medium">Qualified</th>
          <th className="w-10"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(c => {
          const csm = csmById[c.csm_id]
          return (
            <tr key={c.id} className="border-b border-stone-100 hover:bg-stone-50/40 transition-colors">
              <td className="py-3 px-4">
                {csm ? (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-semibold text-[10px]" style={{ background: csm.color, fontFamily: "'Instrument Serif', serif" }}>
                      {csm.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <span className="text-stone-800 font-medium">{csm.name}</span>
                  </div>
                ) : <span className="text-stone-400 italic">Removed CSM</span>}
              </td>
              <td className="py-3 px-3 text-stone-800">{c.customer_name || <span className="text-stone-400 italic">unnamed</span>}</td>
              <td className="py-3 px-3 text-right num-tabular font-semibold text-stone-900">{c.score ?? 0}</td>
              {showVideo && (
                <td className="py-3 px-3">
                  <button onClick={() => onDownload(c)} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-stone-300 hover:border-stone-900 hover:bg-stone-50 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  {c.video_filename && <div className="text-[10px] text-stone-400 mt-1 truncate max-w-[180px]">{c.video_filename}</div>}
                </td>
              )}
              <td className="py-3 px-3">
                <button onClick={() => onToggleQualified(c)}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 transition-colors ${c.qualified ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-stone-300 hover:border-stone-900 text-stone-700'}`}>
                  <ShieldCheck className="w-3.5 h-3.5" /> {c.qualified ? 'Qualified' : 'Mark qualified'}
                </button>
              </td>
              <td className="py-3 px-3 text-right">
                <button onClick={() => onRemove(c)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ============================================================================
//  Roster — now shows team/role/lead with edit controls
// ============================================================================

function RosterTab({ profiles, currentUser, reload, isExec }) {
  const [editing, setEditing] = useState(null) // profile id being edited
  const [showPreview, setShowPreview] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(true)

  const setRole = async (id, newRole) => {
    await supabase.from('profiles').update({ role: newRole }).eq('id', id)
    reload()
  }
  const setTeamLead = async (id, isLead) => {
    await supabase.from('profiles').update({ is_team_lead: isLead }).eq('id', id)
    reload()
  }
  const setTeamRole = async (id, team, role_type) => {
    await supabase.from('profiles').update({ team, role_type }).eq('id', id)
    setEditing(null)
    reload()
  }
  const archiveUser = async (id) => {
    if (!confirm("Archive this user? They'll be hidden from the roster but their data will be preserved. You can restore them later.")) return
    await supabase.from('profiles').update({ archived_at: new Date().toISOString() }).eq('id', id)
    reload()
  }
  const unarchiveUser = async (id) => {
    await supabase.from('profiles').update({ archived_at: null }).eq('id', id)
    reload()
  }
  const removeUser = async (id) => {
    if (!confirm("⚠️ PERMANENTLY DELETE this user?\n\nThis cannot be undone. All their scorecards and data will be lost forever.\n\nIf they just left the company, use 'Archive' instead — that preserves their data.\n\nAre you absolutely sure?")) return
    await supabase.from('profiles').delete().eq('id', id)
    reload()
  }
  const setChannelPartner = async (id, enabled) => {
    await supabase.from('profiles').update({ channel_partner_enabled: enabled }).eq('id', id)
    reload()
  }
  // Assign the rep's Twilio number (caller ID for outbound; inbound routes to them).
  const setTwilioNumber = async (id, number) => {
    const value = (number || '').trim() || null
    const { error } = await supabase.from('profiles').update({ twilio_number: value }).eq('id', id)
    if (error) { alert('Could not save the number: ' + error.message); return }
    reload()
  }
  // Promote/demote an external investor (role_type='investor' → gold-view-only).
  // Reverting drops them back to their team's first role.
  const setInvestor = async (id, makeInvestor, team) => {
    if (makeInvestor) {
      await supabase.from('profiles').update({ role_type: 'investor', role: 'member' }).eq('id', id)
      // Let the investor know access was granted. Best-effort — never block on email.
      try { await supabase.functions.invoke('send-email', { body: { type: 'investor_granted', userId: id } }) }
      catch (e) { console.warn('investor_granted email failed (non-blocking):', e) }
    } else {
      const firstRole = getTeam(team)?.roles?.[0]?.key || 'csm'
      await supabase.from('profiles').update({ role_type: firstRole }).eq('id', id)
    }
    reload()
  }

  const byName = (a, b) => a.name.localeCompare(b.name)
  const active = profiles.filter(p => !p.archived_at)
  const archived = profiles.filter(p => p.archived_at).sort(byName)

  // Group active members by team in TEAMS order, plus any unrecognized teams that still have members.
  const teamKeys = [
    ...TEAMS.map(t => t.key),
    ...[...new Set(active.map(p => p.team))].filter(k => !TEAMS.some(t => t.key === k)),
  ]
  const teamGroups = teamKeys
    .map(key => ({ key, members: active.filter(p => p.team === key).sort(byName) }))
    .filter(g => g.members.length > 0)

  const renderCard = (c) => (
    <RosterCard
      key={c.id}
      profile={c}
      currentUser={currentUser}
      isExec={isExec}
      isEditing={editing === c.id}
      onStartEdit={() => setEditing(c.id)}
      onCancelEdit={() => setEditing(null)}
      onSetRole={(role) => setRole(c.id, role)}
      onSetTwilioNumber={(number) => setTwilioNumber(c.id, number)}
      onSetTeamLead={(isLead) => setTeamLead(c.id, isLead)}
      onSetTeamRole={(team, role_type) => setTeamRole(c.id, team, role_type)}
      onSetInvestor={(makeInvestor) => setInvestor(c.id, makeInvestor, c.team)}
      onArchive={() => archiveUser(c.id)}
      onUnarchive={() => unarchiveUser(c.id)}
      onRemove={() => removeUser(c.id)}
      onToggleChannelPartner={(enabled) => setChannelPartner(c.id, enabled)}
    />
  )

  return (
    <div className="space-y-8">
      <div className="fade-up">
        <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">Roster</div>
        <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1] tracking-tight text-stone-900">
          Manage the <em className="font-light">team.</em>
        </h1>
        <p className="text-stone-600 mt-3 max-w-xl">
          {isExec
            ? 'Promote leads, change teams, mark executives. Members appear automatically when they sign up.'
            : 'Manage members on your team.'}
        </p>
      </div>

      {isExec && (
        <div className="fade-up" style={{ animationDelay: '40ms' }}>
          <button
            onClick={() => setShowPreview(s => !s)}
            className="flex items-center gap-2 px-4 py-2 border border-stone-300 hover:border-stone-900 hover:bg-stone-100 transition-colors text-sm font-medium"
          >
            <Eye className="w-4 h-4" /> {showPreview ? 'Hide' : 'Show'} scorecard previews
          </button>
          {showPreview && <ScorecardPreviews />}
        </div>
      )}

      {teamGroups.map((g, i) => (
        <div key={g.key} className="fade-up" style={{ animationDelay: `${60 + i * 30}ms` }}>
          <div className="flex items-baseline flex-nowrap gap-2 mb-3 pl-3" style={{ borderLeft: `3px solid ${getTeamColor(g.key)}` }}>
            <h2 className="display-font text-2xl font-semibold text-stone-900">{getTeamLabel(g.key)}</h2>
            <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500 whitespace-nowrap">· {g.members.length} member{g.members.length === 1 ? '' : 's'}</span>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {g.members.map(renderCard)}
          </div>
        </div>
      ))}

      {archived.length > 0 && (
        <div className="fade-up">
          <button onClick={() => setArchivedOpen(o => !o)}
            className="flex items-center gap-2 mb-3 text-stone-600 hover:text-stone-900 transition-colors">
            {archivedOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Archive className="w-4 h-4" />
            <h2 className="display-font text-xl font-medium">Archived</h2>
            <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">· {archived.length} member{archived.length === 1 ? '' : 's'}</span>
          </button>
          {archivedOpen && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {archived.map(renderCard)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
//  Scorecard previews — describes what each role's scorecard contains.
//  For a live preview with sample data, use the demo users in the roster.
// ============================================================================

const ROLE_PREVIEWS = {
  csm: {
    name: 'CSM',
    teamLabel: 'Customer Success',
    teamColor: '#0F766E',
    description: 'Tracks daily customer meetings, pipeline, launches, time-to-first-value, testimonials, retention, and customer health scores.',
    sections: ['Daily Meetings', 'Pipeline', 'Launches & TTFV', 'Testimonials', 'Retention', 'Health Scores', 'Monthly View (NRR + NPS)'],
  },
  implementation: {
    name: 'Implementation Specialist',
    teamLabel: 'Customer Success',
    teamColor: '#14B8A6',
    description: 'Tracks daily ticket throughput and per-customer implementation projects with tier-based SLA tracking (14-day Standard / 30-day Enterprise).',
    sections: ['Daily Tickets', 'Projects (with tier + SLA)', 'Monthly View'],
  },
  support: {
    name: 'Customer Support Associate',
    teamLabel: 'Customer Success',
    teamColor: '#06B6D4',
    description: 'Tracks daily ticket volume, response times, CSAT scores, and escalations.',
    sections: ['Daily Tickets', 'Escalations', 'CSAT Tracking', 'Monthly View'],
  },
  account_executive: {
    name: 'Account Executive',
    teamLabel: 'Sales',
    teamColor: '#1E40AF',
    description: 'Tracks daily demos and trial signups, plus a deal pipeline with both MRR and one-time value tracking.',
    sections: ['Daily Funnel', 'Pipeline (MRR + ACV)', 'Monthly View'],
  },
  growth_manager: {
    name: 'Growth Manager',
    teamLabel: 'Marketing',
    teamColor: '#BE185D',
    description: 'Tracks the full funnel: visitors → opt-ins → leads → SQLs → demos → customers, with auto-calculated CPL, CAC, and conversion rates.',
    sections: ['Daily Funnel', 'Monthly View (CAC, CPL, conversion rates)'],
  },
  ad_strategist: {
    name: 'Ad Strategist',
    teamLabel: 'Marketing',
    teamColor: '#DB2777',
    description: 'Tracks daily ad performance (spend, impressions, clicks, leads), active campaigns, and creative tests.',
    sections: ['Daily Performance', 'Active Campaigns', 'Creative Tests', 'Monthly View'],
  },
  engineer: {
    name: 'Engineer',
    teamLabel: 'Product',
    teamColor: '#7C3AED',
    description: 'Themed work format that matches how engineers naturally write Slack updates. Track shipped items by category, with PR links and in-flight work.',
    sections: ['Quick Numbers', 'Work Areas (themed bullets with PRs)', 'In-Flight / Open', 'Monthly View'],
  },
}

function ScorecardPreviews() {
  return (
    <div className="mt-4 bg-white border border-stone-200 p-5 fade-up">
      <div className="text-sm text-stone-600 mb-5">
        Each role has a tailored scorecard. Click into the demo users in your roster to see them with sample data filled in.
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {Object.entries(ROLE_PREVIEWS).map(([key, info]) => (
          <div key={key} className="border border-stone-200 p-4 hover:border-stone-900 transition-colors">
            <div className="mono-font text-[9px] uppercase tracking-widest mb-1.5" style={{ color: info.teamColor }}>
              {info.teamLabel}
            </div>
            <div className="display-font text-base font-medium text-stone-900 mb-2">{info.name}</div>
            <p className="text-xs text-stone-600 mb-3 leading-relaxed">{info.description}</p>
            <div className="text-[10px] mono-font uppercase tracking-widest text-stone-500 mb-1.5">Sections</div>
            <div className="flex flex-wrap gap-1">
              {info.sections.map(s => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-700">{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RosterCard({ profile, currentUser, isExec, isEditing, onStartEdit, onCancelEdit, onSetRole, onSetTeamRole, onSetTeamLead, onSetInvestor, onArchive, onUnarchive, onRemove, onToggleChannelPartner, onSetTwilioNumber }) {
  const team = getTeam(profile.team)
  const roleLabel = getRoleLabel(profile.team, profile.role_type)
  const tier = accessTier(profile)
  const isSelf = profile.id === currentUser.id

  const [editTeam, setEditTeam] = useState(profile.team)
  const [editRole, setEditRole] = useState(profile.role_type)
  const editRolesAvailable = TEAMS.find(t => t.key === editTeam)?.roles || []

  const onTeamChange = (t) => {
    setEditTeam(t)
    const first = TEAMS.find(x => x.key === t)?.roles?.[0]?.key
    if (first) setEditRole(first)
  }

  return (
    <div className={`bg-white border border-stone-200 overflow-hidden transition-opacity ${profile.archived_at ? 'opacity-60' : ''}`}>
      <div className="h-2" style={{ background: profile.archived_at ? '#A8A29E' : profile.color }} />
      {profile.archived_at && (
        <div className="bg-stone-100 border-b border-stone-200 px-3 py-1.5 flex items-center gap-1.5">
          <Archive className="w-3 h-3 text-stone-500" />
          <span className="mono-font text-[10px] uppercase tracking-widest text-stone-600">Archived</span>
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0" style={{ background: profile.color, fontFamily: "'Instrument Serif', serif" }}>
            {profile.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="display-font text-lg font-medium text-stone-900 truncate">{profile.name}</div>
            <div className="text-xs text-stone-500 mt-0.5 truncate">{profile.title}</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tier === 'executive' && <Badge color="amber" icon={Crown}>Executive</Badge>}
              {tier === 'team_lead' && <Badge color="amber" icon={UserCheck}>Lead</Badge>}
              {(tier === 'investor' || tier === 'investor_pending') ? (
                <Badge color={tier === 'investor' ? 'violet' : 'amber'}>{tier === 'investor' ? 'Investor' : 'Pending Investor'}</Badge>
              ) : (
                <>
                  <Badge color="stone">{team?.label || profile.team}</Badge>
                  <Badge color="stone">{roleLabel}</Badge>
                </>
              )}
              {profile.channel_partner_enabled && profile.team === 'sales' && <Badge color="violet" icon={Handshake}>Channel Partner</Badge>}
            </div>
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-2 border-t border-stone-200 pt-3 mt-1">
            <div>
              <label className="mono-font text-[9px] uppercase tracking-widest text-stone-500 block mb-1">Team</label>
              <select value={editTeam} onChange={(e) => onTeamChange(e.target.value)}
                className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white">
                {TEAMS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mono-font text-[9px] uppercase tracking-widest text-stone-500 block mb-1">Role</label>
              <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                className="w-full py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white">
                {editRolesAvailable.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => onSetTeamRole(editTeam, editRole)}
                className="flex-1 py-1.5 bg-stone-900 text-stone-50 text-xs hover:bg-stone-800 transition-colors">Save</button>
              <button onClick={onCancelEdit}
                className="flex-1 py-1.5 border border-stone-300 text-xs hover:bg-stone-100 transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              {isExec ? (
                <button onClick={() => onSetTeamLead(!profile.is_team_lead)} disabled={isSelf || profile.role === 'executive'}
                  title={isSelf ? "Can't change your own lead status" : profile.role === 'executive' ? "Executives don't need lead status — they already see everything" : ''}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 border border-stone-300 hover:bg-stone-100 transition-colors text-xs disabled:opacity-40 disabled:cursor-not-allowed">
                  {profile.is_team_lead ? <><ShieldOff className="w-3 h-3" /> Remove lead</> : <><Shield className="w-3 h-3" /> Make lead</>}
                </button>
              ) : profile.is_team_lead ? (
                <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 border border-amber-200 bg-amber-50 text-amber-900 text-xs">
                  <Shield className="w-3 h-3" /> Team Lead
                </div>
              ) : null}
              <button onClick={onStartEdit}
                className={`${isExec || profile.is_team_lead ? 'flex-1' : 'w-full'} flex items-center justify-center gap-1.5 py-1.5 border border-stone-300 hover:bg-stone-100 transition-colors text-xs`}>
                Edit role
              </button>
            </div>
            {isExec && profile.team === 'sales' && (
              <button onClick={() => onToggleChannelPartner(!profile.channel_partner_enabled)}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 border transition-colors text-xs ${profile.channel_partner_enabled ? 'border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-800' : 'border-stone-300 hover:bg-stone-100'}`}>
                <Handshake className="w-3 h-3" /> {profile.channel_partner_enabled ? 'Disable Channel Partner' : 'Enable Channel Partner'}
              </button>
            )}
            {isExec && (
              <div>
                <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-1">Dialer number</div>
                <input type="tel" defaultValue={profile.twilio_number || ''} placeholder="+1XXXXXXXXXX"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (profile.twilio_number || '')) onSetTwilioNumber(v) }}
                  className="w-full py-1.5 px-2 border border-stone-300 focus:border-stone-900 transition-colors text-xs num-tabular" />
                <div className="text-[10px] text-stone-400 mt-1">Their Twilio number — caller ID for outbound + rings them for inbound.</div>
              </div>
            )}
            {isExec && !isSelf && profile.role !== 'executive' && (
              <button onClick={() => onSetInvestor(tier !== 'investor')}
                title={tier === 'investor' ? 'Revert this investor to a normal team role'
                  : tier === 'investor_pending' ? 'Grant this pending investor access to the gold dashboard'
                  : 'Make this user an external investor (gold dashboard only)'}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 border transition-colors text-xs ${
                  tier === 'investor_pending' ? 'border-transparent text-white hover:opacity-90'
                  : tier === 'investor' ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
                  : 'border-stone-300 hover:bg-stone-100'}`}
                style={tier === 'investor_pending' ? { background: '#B8860B' } : undefined}>
                {tier === 'investor' ? 'Investor — revert to team role'
                  : tier === 'investor_pending' ? 'Grant investor access'
                  : 'Make Investor'}
              </button>
            )}
            {isExec && (
              <div className="flex gap-2">
                {profile.role === 'executive' ? (
                  <button onClick={() => onSetRole('member')} disabled={isSelf}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 transition-colors text-xs disabled:opacity-40">
                    <Crown className="w-3 h-3" /> Demote from exec
                  </button>
                ) : (
                  <button onClick={() => onSetRole('executive')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 border border-stone-300 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900 transition-colors text-xs">
                    <Crown className="w-3 h-3" /> Make exec
                  </button>
                )}
                {profile.archived_at ? (
                  <button onClick={onUnarchive} disabled={isSelf}
                    title="Restore this user — they'll appear in the roster again"
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 transition-colors text-xs disabled:opacity-40">
                    <ArchiveRestore className="w-3 h-3" /> Restore
                  </button>
                ) : (
                  <button onClick={onArchive} disabled={isSelf}
                    title="Archive this user — they're hidden but their data is preserved"
                    className="flex items-center justify-center px-3 py-1.5 border border-stone-300 hover:bg-stone-100 transition-colors text-xs disabled:opacity-40 disabled:cursor-not-allowed">
                    <Archive className="w-3 h-3" />
                  </button>
                )}
                <button onClick={onRemove} disabled={isSelf}
                  title="Permanently delete this user — cannot be undone"
                  className="flex items-center justify-center px-3 py-1.5 border border-stone-300 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors text-xs disabled:opacity-40 disabled:cursor-not-allowed">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Badge({ color, icon: Icon, children }) {
  const colors = {
    amber: 'text-amber-800 bg-amber-50',
    stone: 'text-stone-600 bg-stone-100',
    emerald: 'text-emerald-700 bg-emerald-50',
    violet: 'text-violet-700 bg-violet-50',
  }
  return (
    <span className={`inline-flex items-center gap-1 mono-font text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded ${colors[color] || colors.stone}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  )
}
