import React, { useState } from 'react'
import { LogOut, LayoutDashboard, Loader2, Check, Settings as SettingsIcon, Lightbulb, Plug } from 'lucide-react'
import { getRoleLabel } from './teams'
import { formatWeekLabel } from './dateUtils'
import SettingsModal from './SettingsModal'
import AtlasLogo from './AtlasLogo'

// Standard header used by every role's scorecard.
// Children = the question/title and content of the page.
export default function ScorecardShell({
  profile,
  weekKey,
  saving,
  savedAt,
  onSignOut,
  onSwitchToManager,
  onSwitchToFeatureRequests,
  onSwitchToIntegrations,
  onProfileUpdated,
  children,
}) {
  const [showSettings, setShowSettings] = useState(false)
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-stone-50/90 backdrop-blur border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <AtlasLogo height={28} />
            <div className="hidden md:block h-8 w-px bg-stone-300" />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0" style={{ background: profile.color, fontFamily: 'Fraunces, serif' }}>
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
          <div className="flex items-center gap-2 flex-wrap">
            <SaveIndicator saving={saving} savedAt={savedAt} />
            {onSwitchToFeatureRequests && (
              <button onClick={onSwitchToFeatureRequests} className="hidden md:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="Feature Requests">
                <Lightbulb className="w-4 h-4" /> <span className="hidden lg:inline">Feature Requests</span>
              </button>
            )}
            {onSwitchToIntegrations && (
              <button onClick={onSwitchToIntegrations} className="hidden md:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="Integrations">
                <Plug className="w-4 h-4" /> <span className="hidden lg:inline">Integrations</span>
              </button>
            )}
            {onSwitchToManager && (
              <button onClick={onSwitchToManager} className="hidden sm:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
                <LayoutDashboard className="w-4 h-4" /> Manager view
              </button>
            )}
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="Settings">
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button onClick={onSignOut} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-6 py-10">
        {children}
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
  if (savedAt) return <div className="flex items-center gap-1.5 text-xs text-emerald-700 px-2"><Check className="w-3 h-3" /> Saved</div>
  return null
}

// ============================================================================
//  Shared widgets — used by every role's view
// ============================================================================

export function NorthStarTile({ label, value, unit, sublabel, color, icon: Icon }) {
  return (
    <div className="bg-white border border-stone-200 p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
      <div className="flex items-start justify-between mb-4">
        <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
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
          <button key={s.id} onClick={() => onChange(s.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm transition-all ${isActive ? 'bg-stone-900 text-stone-50' : 'bg-white border border-stone-200 text-stone-700 hover:border-stone-900'}`}>
            {Icon && <Icon className="w-4 h-4" />} {s.label}
          </button>
        )
      })}
    </div>
  )
}

export function PageHeader({ kicker, kickerColor, title, italicized }) {
  return (
    <div className="mb-10 fade-up">
      <div className="mono-font text-xs uppercase tracking-[0.2em] mb-3" style={{ color: kickerColor || '#78716C' }}>{kicker}</div>
      <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1] tracking-tight text-stone-900">
        {title}{italicized && <> <em className="font-light">{italicized}</em></>}
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
