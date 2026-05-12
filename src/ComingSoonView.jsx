import React from 'react'
import { LogOut, LayoutDashboard, Sparkles, Clock, Lightbulb, Plug, Crown, Zap, UserMinus } from 'lucide-react'
import { getRoleLabel, getTeamLabel, getTeamColor } from './teams'
import { useGlassInteraction } from './hooks/useGlassInteraction.js'

export default function ComingSoonView({ profile, onSignOut, onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations, onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership }) {
  const teamLabel = getTeamLabel(profile.team)
  const roleLabel = getRoleLabel(profile.team, profile.role_type)
  const color = getTeamColor(profile.team)
  const headerRef = useGlassInteraction()

  return (
    <div className="min-h-screen">
      <header ref={headerRef} className="glass-nav glass-nav-strip sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: profile.color, fontFamily: "'Instrument Serif', serif" }}>
              {profile.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div className="display-font text-lg font-medium text-stone-900 leading-tight">{profile.name}</div>
              <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{profile.title || roleLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onSwitchToLeadership && (
              <button onClick={onSwitchToLeadership} className="hidden md:flex items-center gap-2 text-sm transition-colors px-3 py-2 rounded-sm hover:opacity-80"
                style={{ background: 'rgba(102, 57, 166, 0.08)', color: '#6639A6' }} title="Leadership Dashboard">
                <Crown className="w-4 h-4" /> <span className="hidden lg:inline">Leadership</span>
              </button>
            )}
            {onSwitchToApiGuide && (
              <button onClick={onSwitchToApiGuide} className="hidden md:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="API Setup">
                <Zap className="w-4 h-4" /> <span className="hidden lg:inline">API Setup</span>
              </button>
            )}
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
            {onSwitchToCancellations && (
              <button onClick={onSwitchToCancellations} className="hidden md:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="Cancellations">
                <UserMinus className="w-4 h-4" /> <span className="hidden lg:inline">Cancellations</span>
              </button>
            )}
            {onSwitchToManager && (
              <button onClick={onSwitchToManager} className="hidden sm:flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
                <LayoutDashboard className="w-4 h-4" /> Manager view
              </button>
            )}
            <button onClick={onSignOut} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="fade-up">
          <div className="mono-font text-xs uppercase tracking-[0.2em] mb-3" style={{ color }}>
            {teamLabel} · {roleLabel}
          </div>
          <h1 className="display-font text-4xl md:text-6xl font-medium leading-[1] tracking-tight text-stone-900 mb-4">
            Your scorecard <em className="font-light">is on the way.</em>
          </h1>
          <p className="text-stone-600 text-lg leading-relaxed max-w-xl">
            We're building a custom weekly scorecard for the <strong>{roleLabel}</strong> role on the <strong>{teamLabel}</strong> team. It'll be ready in the next update.
          </p>
        </div>

        <div className="mt-12 fade-up" style={{ animationDelay: '120ms' }}>
          <div className="bg-white border border-stone-200 p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-sm flex items-center justify-center flex-shrink-0" style={{ background: color }}>
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="display-font text-xl font-medium text-stone-900 mb-2">In the meantime</div>
                <p className="text-stone-600 text-sm leading-relaxed mb-3">
                  Your account is fully set up. You'll appear on the team roster, and once your scorecard
                  ships you'll be able to start tracking your week immediately.
                </p>
                <p className="text-stone-600 text-sm leading-relaxed">
                  If you're a team lead or executive, you can use the <strong>Manager view</strong> in the
                  top right to see what's been built so far.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-stone-400">
          <Sparkles className="w-4 h-4" style={{ color: '#F59E0B' }} />
          <span className="mono-font text-[10px] uppercase tracking-widest">Coming Soon</span>
          <Sparkles className="w-4 h-4" style={{ color: '#F59E0B' }} />
        </div>
      </div>
    </div>
  )
}
