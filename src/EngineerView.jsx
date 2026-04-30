import React, { useState, useMemo } from 'react'
import {
  Loader2, Layers, Briefcase, FileText, Calendar, Plus, Trash2, Link as LinkIcon,
  GitPullRequest, Bug, Clock, ListChecks, ChevronDown, ChevronRight, AlertCircle, Rocket
} from 'lucide-react'
import { useScorecard } from './useScorecard'
import { useTargets } from './useTargets'
import { useMtdData, getMonthKey, formatMonthLabel } from './useMtd'
import { getWeekKey, formatWeekLabel } from './dateUtils'
import { BLANK_ENGINEER_WEEK, ENGINEER_CATEGORIES, IN_FLIGHT_STATUSES, newId } from './roleConstants'
import ScorecardShell, { NorthStarTile, SectionTabs, PageHeader } from './ScorecardShell'
import { MtdCard, MtdLegend } from './MtdWidgets'

// Color tokens for categories
const CATEGORY_COLORS = {
  'Reliability':         '#0F766E',
  'Features':            '#7C3AED',
  'Bug Fixes':           '#B91C1C',
  'Performance':         '#1E40AF',
  'Integrations':        '#BE185D',
  'Infrastructure':      '#A16207',
  'Security & Privacy':  '#1F2937',
  'Tech Debt':           '#78716C',
  'Tooling / DX':        '#0EA5E9',
}
const colorFor = (cat) => CATEGORY_COLORS[cat] || '#78716C'

const STATUS_COLORS = {
  'New':         '#0EA5E9',
  'In Progress': '#7C3AED',
  'Stale':       '#A16207',
  'Blocked':     '#B91C1C',
  'Carry-over':  '#78716C',
}

export default function EngineerView({ profile, onSignOut, onSwitchToManager, onProfileUpdated }) {
  const weekKey = useMemo(() => getWeekKey(), [])
  const monthKey = useMemo(() => getMonthKey(), [])
  const { weekData, loading, saving, savedAt, update } = useScorecard(profile.id, weekKey, BLANK_ENGINEER_WEEK)
  const { targets } = useTargets(profile.id, profile.role_type)
  const [section, setSection] = useState('weekly')

  if (loading || !weekData) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-700" /></div>
  }

  // Derived metrics
  const themes = weekData.themes || []
  const totalBullets = themes.reduce((s, t) => s + (t.bullets || []).length, 0)
  const categoryBreakdown = themes.reduce((acc, t) => {
    const cat = t.category || 'Uncategorized'
    const count = (t.bullets || []).length
    acc[cat] = (acc[cat] || 0) + count
    return acc
  }, {})

  const sections = [
    { id: 'weekly', label: 'This Week', icon: Briefcase },
    { id: 'monthly', label: 'Monthly View', icon: Calendar },
  ]

  return (
    <ScorecardShell profile={profile} weekKey={weekKey} saving={saving} savedAt={savedAt}
      onSignOut={onSignOut} onSwitchToManager={onSwitchToManager} onProfileUpdated={onProfileUpdated}>
      <PageHeader
        kicker={`Engineer · Week of ${formatWeekLabel(weekKey)}`}
        kickerColor="#7C3AED"
        title="What did"
        italicized={`you ship this week, ${profile.name.split(' ')[0]}?`}
      />

      <div className="grid md:grid-cols-3 gap-4 mb-12 fade-up" style={{ animationDelay: '80ms' }}>
        <NorthStarTile label="Items Shipped" value={totalBullets} sublabel={`Across ${themes.length} ${themes.length === 1 ? 'theme' : 'themes'}`} color="#7C3AED" icon={ListChecks} />
        <NorthStarTile
          label="PRs Merged"
          value={weekData.prsMerged || '—'}
          sublabel="Self-reported"
          color="#1C1917"
          icon={GitPullRequest}
        />
        <NorthStarTile
          label="Bugs Introduced"
          value={weekData.bugsIntroduced === '' || weekData.bugsIntroduced === null || weekData.bugsIntroduced === undefined ? '—' : weekData.bugsIntroduced}
          sublabel={Number(weekData.bugsIntroduced) <= 3 ? '✓ Under target' : '↑ Above target'}
          color={Number(weekData.bugsIntroduced) <= 3 ? '#0F766E' : '#A16207'}
          icon={Bug}
        />
      </div>

      <SectionTabs sections={sections} active={section} onChange={setSection} />

      <div className="fade-up" style={{ animationDelay: '160ms' }}>
        {section === 'weekly' && <WeeklySection weekData={weekData} update={update} categoryBreakdown={categoryBreakdown} />}
        {section === 'monthly' && <MonthlyView profile={profile} monthKey={monthKey} targets={targets} />}
      </div>
    </ScorecardShell>
  )
}

// ============================================================================
//  Weekly view: self-reports + themes + in-flight + notes
// ============================================================================

function WeeklySection({ weekData, update, categoryBreakdown }) {
  return (
    <div className="space-y-6">
      {/* Quick numbers row */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">Quick numbers</div>
        <p className="text-sm text-stone-600 mb-4">End-of-week estimates. All optional — fill in what you track.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SimpleField label="PRs Merged" value={weekData.prsMerged} onChange={(v) => update(d => ({ ...d, prsMerged: v }))} icon={GitPullRequest} />
          <SimpleField label="Bugs Introduced" value={weekData.bugsIntroduced} onChange={(v) => update(d => ({ ...d, bugsIntroduced: v }))} icon={Bug} help="Lower is better (target ≤3/mo)" />
          <SimpleField label="Code Review (avg hrs)" value={weekData.codeReviewHours} onChange={(v) => update(d => ({ ...d, codeReviewHours: v }))} icon={Clock} step="0.1" />
          <SimpleField label="User Adoption Rate" value={weekData.userAdoptionRate} onChange={(v) => update(d => ({ ...d, userAdoptionRate: v }))} suffix="%" step="0.1" />
        </div>
      </div>

      {/* Category breakdown (only show if there's data) */}
      {Object.keys(categoryBreakdown).length > 0 && (
        <div className="bg-white border border-stone-200 p-6">
          <div className="display-font text-xl font-medium text-stone-900 mb-1">Effort breakdown</div>
          <p className="text-sm text-stone-600 mb-4">Items shipped by category this week.</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(categoryBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, count]) => (
                <div key={cat} className="flex items-center gap-2 px-3 py-1.5 border border-stone-200 bg-stone-50">
                  <div className="w-2 h-2 rounded-full" style={{ background: colorFor(cat) }} />
                  <span className="text-sm font-medium text-stone-800">{cat}</span>
                  <span className="num-tabular text-sm text-stone-600 font-semibold">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <ThemesSection weekData={weekData} update={update} />
      <InFlightSection weekData={weekData} update={update} />

      {/* Notes */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-xl font-medium text-stone-900 mb-1">Notes</div>
        <p className="text-sm text-stone-600 mb-4">Anything else worth flagging — wins, frustrations, ideas.</p>
        <textarea rows={6} value={weekData.notes || ''} onChange={(e) => update(d => ({ ...d, notes: e.target.value }))}
          placeholder="What didn't fit above? What do you want the team to know?"
          className="w-full py-3 px-4 border border-stone-300 focus:border-stone-900 transition-colors text-sm leading-relaxed" />
      </div>
    </div>
  )
}

function SimpleField({ label, value, onChange, suffix, icon: Icon, help, step }) {
  return (
    <div className="border border-stone-200 p-4">
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-stone-500" />}
        <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
      </div>
      <div className="flex items-baseline gap-2">
        <input type="number" min="0" step={step || '1'} value={value || ''} onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          className="w-full py-2 px-3 border border-stone-200 focus:border-stone-900 transition-colors num-tabular text-2xl display-font font-medium" />
        {suffix && <span className="text-sm text-stone-500">{suffix}</span>}
      </div>
      {help && <div className="text-[11px] text-stone-500 mt-2">{help}</div>}
    </div>
  )
}

// ============================================================================
//  Themes section — repeatable themed work areas
// ============================================================================

function ThemesSection({ weekData, update }) {
  const themes = weekData.themes || []

  const addTheme = () => update(d => ({
    ...d,
    themes: [...(d.themes || []), { id: newId('th'), title: '', category: 'Features', bullets: [{ id: newId('b'), text: '', link: '' }] }],
  }))
  const updateTheme = (id, patch) => update(d => ({
    ...d, themes: d.themes.map(t => t.id === id ? { ...t, ...patch } : t),
  }))
  const removeTheme = (id) => update(d => ({ ...d, themes: d.themes.filter(t => t.id !== id) }))

  const addBullet = (themeId) => update(d => ({
    ...d, themes: d.themes.map(t => t.id === themeId
      ? { ...t, bullets: [...(t.bullets || []), { id: newId('b'), text: '', link: '' }] }
      : t),
  }))
  const updateBullet = (themeId, bulletId, patch) => update(d => ({
    ...d, themes: d.themes.map(t => t.id === themeId
      ? { ...t, bullets: t.bullets.map(b => b.id === bulletId ? { ...b, ...patch } : b) }
      : t),
  }))
  const removeBullet = (themeId, bulletId) => update(d => ({
    ...d, themes: d.themes.map(t => t.id === themeId
      ? { ...t, bullets: t.bullets.filter(b => b.id !== bulletId) }
      : t),
  }))

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
        <div>
          <div className="display-font text-2xl font-medium text-stone-900">Work areas this week</div>
          <p className="text-sm text-stone-600 mt-1">Group your work by theme or project. Each bullet is one shipped item.</p>
        </div>
        <button onClick={addTheme} className="flex items-center gap-2 px-3 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Add theme
        </button>
      </div>

      {themes.length === 0 ? (
        <div className="mt-6 border-2 border-dashed border-stone-300 p-8 text-center">
          <div className="display-font text-lg font-medium text-stone-700 mb-2">Start tracking your work</div>
          <p className="text-sm text-stone-500 mb-4 max-w-md mx-auto">Add themes like "Voice AI Reliability" or "Customer Dashboard" with bullets for each thing you shipped under that theme.</p>
          <button onClick={addTheme} className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" /> Add first theme
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {themes.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              onUpdate={(patch) => updateTheme(theme.id, patch)}
              onRemove={() => removeTheme(theme.id)}
              onAddBullet={() => addBullet(theme.id)}
              onUpdateBullet={(bId, patch) => updateBullet(theme.id, bId, patch)}
              onRemoveBullet={(bId) => removeBullet(theme.id, bId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ThemeCard({ theme, onUpdate, onRemove, onAddBullet, onUpdateBullet, onRemoveBullet }) {
  const [collapsed, setCollapsed] = useState(false)
  const cat = theme.category || 'Features'
  const color = colorFor(cat)
  const bullets = theme.bullets || []

  return (
    <div className="border border-stone-200 bg-stone-50/40">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 bg-white border-b border-stone-200" style={{ borderLeftWidth: '3px', borderLeftColor: color }}>
        <button onClick={() => setCollapsed(c => !c)} className="text-stone-400 hover:text-stone-700">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <input value={theme.title} onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Theme name (e.g., 'Voice AI Reliability')"
          className="flex-1 py-1.5 px-2 border border-transparent hover:border-stone-200 focus:border-stone-900 transition-colors text-base font-medium bg-transparent" />
        <select value={cat} onChange={(e) => onUpdate({ category: e.target.value })}
          className="py-1.5 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-sm bg-white"
          style={{ color }}>
          {ENGINEER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={onRemove} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Bullets */}
      {!collapsed && (
        <div className="p-4 space-y-2">
          {bullets.length === 0 && (
            <div className="text-sm text-stone-500 italic">No items yet — add one below.</div>
          )}
          {bullets.map((bullet, idx) => (
            <div key={bullet.id} className="flex items-start gap-2 group">
              <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-3" style={{ background: color }} />
              <input value={bullet.text} onChange={(e) => onUpdateBullet(bullet.id, { text: e.target.value })}
                placeholder="What did you ship?"
                className="flex-1 py-1.5 px-2 border border-transparent hover:border-stone-200 focus:border-stone-900 transition-colors text-sm bg-transparent" />
              <input value={bullet.link || ''} onChange={(e) => onUpdateBullet(bullet.id, { link: e.target.value })}
                placeholder="PR or link (optional)"
                className="w-44 py-1.5 px-2 border border-transparent hover:border-stone-200 focus:border-stone-900 transition-colors text-xs bg-transparent num-tabular" />
              {bullet.link && (
                <a href={bullet.link} target="_blank" rel="noopener noreferrer" className="p-1.5 text-stone-400 hover:text-stone-700 transition-colors" title="Open link">
                  <LinkIcon className="w-3.5 h-3.5" />
                </a>
              )}
              <button onClick={() => onRemoveBullet(bullet.id)} className="p-1.5 text-stone-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button onClick={onAddBullet} className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 transition-colors mt-3 ml-3">
            <Plus className="w-3.5 h-3.5" /> Add item
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
//  In-flight section
// ============================================================================

function InFlightSection({ weekData, update }) {
  const items = weekData.inFlight || []

  const addItem = () => update(d => ({
    ...d, inFlight: [...(d.inFlight || []), { id: newId('if'), text: '', link: '', status: 'New' }],
  }))
  const updateItem = (id, patch) => update(d => ({
    ...d, inFlight: d.inFlight.map(i => i.id === id ? { ...i, ...patch } : i),
  }))
  const removeItem = (id) => update(d => ({ ...d, inFlight: d.inFlight.filter(i => i.id !== id) }))

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
        <div>
          <div className="display-font text-2xl font-medium text-stone-900">Open / In flight</div>
          <p className="text-sm text-stone-600 mt-1">Things teed up for next week, blocked, or stale.</p>
        </div>
        <button onClick={addItem} className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-200 hover:border-stone-900 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Add item
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 text-sm text-stone-500 italic">Nothing in flight yet.</div>
      ) : (
        <div className="mt-6 space-y-2">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 group p-2 hover:bg-stone-50 transition-colors">
              <select value={item.status} onChange={(e) => updateItem(item.id, { status: e.target.value })}
                className="py-1 px-2 border border-stone-200 focus:border-stone-900 transition-colors text-xs bg-white font-medium"
                style={{ color: STATUS_COLORS[item.status] || '#1C1917' }}>
                {IN_FLIGHT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input value={item.text} onChange={(e) => updateItem(item.id, { text: e.target.value })}
                placeholder="What's in flight?"
                className="flex-1 py-1.5 px-2 border border-transparent hover:border-stone-200 focus:border-stone-900 transition-colors text-sm bg-transparent" />
              <input value={item.link || ''} onChange={(e) => updateItem(item.id, { link: e.target.value })}
                placeholder="Link (optional)"
                className="w-44 py-1.5 px-2 border border-transparent hover:border-stone-200 focus:border-stone-900 transition-colors text-xs bg-transparent" />
              {item.link && (
                <a href={item.link} target="_blank" rel="noopener noreferrer" className="p-1.5 text-stone-400 hover:text-stone-700">
                  <LinkIcon className="w-3.5 h-3.5" />
                </a>
              )}
              <button onClick={() => removeItem(item.id)} className="p-1.5 text-stone-300 hover:text-red-600 opacity-0 group-hover:opacity-100">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
//  Monthly view — MTD aggregates from weekly themed data
// ============================================================================

function MonthlyView({ profile, monthKey, targets }) {
  const { weeks, loading } = useMtdData(profile.id, monthKey)
  if (loading) return <div className="bg-white border border-stone-200 p-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-700" /></div>

  // Aggregate across weeks
  let totalItems = 0
  let totalPrs = 0
  let totalBugs = 0
  let totalReviewSum = 0
  let weeksWithReview = 0
  let totalAdoptionSum = 0
  let weeksWithAdoption = 0
  const categoryTotals = {}

  for (const w of weeks) {
    const data = w.data || {}
    const themes = data.themes || []
    for (const t of themes) {
      const count = (t.bullets || []).length
      totalItems += count
      const cat = t.category || 'Uncategorized'
      categoryTotals[cat] = (categoryTotals[cat] || 0) + count
    }
    if (data.prsMerged !== '' && data.prsMerged !== null && !isNaN(Number(data.prsMerged))) totalPrs += Number(data.prsMerged)
    if (data.bugsIntroduced !== '' && data.bugsIntroduced !== null && !isNaN(Number(data.bugsIntroduced))) totalBugs += Number(data.bugsIntroduced)
    if (data.codeReviewHours !== '' && data.codeReviewHours !== null && !isNaN(Number(data.codeReviewHours))) {
      totalReviewSum += Number(data.codeReviewHours); weeksWithReview += 1
    }
    if (data.userAdoptionRate !== '' && data.userAdoptionRate !== null && !isNaN(Number(data.userAdoptionRate))) {
      totalAdoptionSum += Number(data.userAdoptionRate); weeksWithAdoption += 1
    }
  }

  const avgReview = weeksWithReview > 0 ? totalReviewSum / weeksWithReview : null
  const avgAdoption = weeksWithAdoption > 0 ? totalAdoptionSum / weeksWithAdoption : null

  // Sort categories by count
  const sortedCats = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a)
  const totalCatItems = sortedCats.reduce((s, [, c]) => s + c, 0)

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 p-6">
        <div className="display-font text-2xl font-medium text-stone-900 mb-1">Month-to-date</div>
        <div className="text-sm text-stone-600 mb-4">{formatMonthLabel(monthKey)} · {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} of data</div>
        <MtdLegend />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MtdCard label="Items Shipped" value={totalItems} target={targets.sprint_items} />
          <MtdCard label="PRs Merged" value={totalPrs} target={targets.prs_deployed} />
          <MtdCard label="Bugs Introduced" value={totalBugs} target={targets.bugs_reported} />
          <MtdCard label="Code Review (avg hrs)" value={avgReview} target={targets.code_review_hours} />
          <MtdCard label="User Adoption" value={avgAdoption} target={targets.user_adoption_rate} unit="pct" />
        </div>
      </div>

      {sortedCats.length > 0 && (
        <div className="bg-white border border-stone-200 p-6">
          <div className="display-font text-xl font-medium text-stone-900 mb-1">Where time went</div>
          <p className="text-sm text-stone-600 mb-5">Effort breakdown across categories this month.</p>
          <div className="space-y-3">
            {sortedCats.map(([cat, count]) => {
              const pct = totalCatItems > 0 ? (count / totalCatItems) * 100 : 0
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: colorFor(cat) }} />
                      <span className="text-sm font-medium text-stone-800">{cat}</span>
                    </div>
                    <span className="text-sm num-tabular text-stone-600">
                      <span className="font-semibold">{count}</span> <span className="text-stone-400">·</span> {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, background: colorFor(cat) }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
