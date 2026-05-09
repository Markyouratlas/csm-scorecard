import React from 'react'
import { LogOut, Settings as SettingsIcon, Crown, Mail, Sparkles } from 'lucide-react'
import { useState } from 'react'
import AtlasLogo from './AtlasLogo'
import SettingsModal from './SettingsModal'
import { getRoleLabel } from './teams'

// Shown to Leadership team members who are awaiting executive approval.
// They land here instead of an empty/irrelevant scorecard.
//
// Once an executive flips their access in Roster, they sign back in and
// land on the Executive Dashboard instead of this screen.
export default function LeadershipPendingView({ profile, onSignOut, onProfileUpdated }) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="min-h-screen" style={{ background: 'radial-gradient(ellipse at top, #FAFAF7 0%, #EDE7F5 100%)' }}>
      <header className="sticky top-0 z-30 bg-stone-50/90 backdrop-blur border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <AtlasLogo height={28} />
            <div className="hidden md:block h-8 w-px bg-stone-300" />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: profile.color, fontFamily: "'Instrument Serif', serif" }}>
                {profile.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div className="display-font text-base font-medium text-stone-900 leading-tight">{profile.name}</div>
                <div className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{profile.title || 'Leadership'}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm" title="Settings">
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button onClick={onSignOut} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-20">
        <div className="text-center fade-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6" style={{ background: '#F5F0FA' }}>
            <Crown className="w-8 h-8" style={{ color: '#6639a6' }} />
          </div>

          <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">Awaiting executive approval</div>
          <h1 className="display-font text-4xl md:text-5xl font-medium leading-[1.05] tracking-tight text-stone-900 mb-4">
            Welcome to <em className="font-light">Atlas Scorecard</em>, {profile.name.split(' ')[0]}.
          </h1>
          <p className="text-stone-600 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
            Your account has been created. An existing executive needs to grant you executive access before you can see the dashboard.
          </p>

          <div className="bg-white border border-stone-200 p-8 mb-6 text-left">
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mono-font text-sm font-bold" style={{ background: '#F5F0FA', color: '#6639a6' }}>1</div>
              <div>
                <div className="font-medium text-stone-900 mb-1">Reach out to an executive</div>
                <p className="text-sm text-stone-600 leading-relaxed">
                  Ask any current executive to promote your account. They can do this in 2 clicks from the Roster page.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mono-font text-sm font-bold" style={{ background: '#F5F0FA', color: '#6639a6' }}>2</div>
              <div>
                <div className="font-medium text-stone-900 mb-1">Sign out and back in</div>
                <p className="text-sm text-stone-600 leading-relaxed">
                  Once you've been promoted, sign out (top-right) and sign back in to refresh your permissions.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mono-font text-sm font-bold" style={{ background: '#F5F0FA', color: '#6639a6' }}>3</div>
              <div>
                <div className="font-medium text-stone-900 mb-1">You'll land on the Executive Dashboard</div>
                <p className="text-sm text-stone-600 leading-relaxed">
                  Full visibility across every team and member. You can drill into any individual scorecard from there.
                </p>
              </div>
            </div>
          </div>

          <div className="text-sm text-stone-500">
            Wrong account? <button onClick={onSignOut} className="underline hover:no-underline">Sign out</button> and try again.
          </div>
        </div>
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
