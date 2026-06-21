import React, { useState, useEffect, useCallback, useRef } from 'react'
import { LogOut, RefreshCw } from 'lucide-react'
import { supabase } from './supabase'
import AtlasLogo from './AtlasLogo'
import RocketScene from './RocketScene'

// =============================================================================
//  InvestorPendingView — cinematic "awaiting access" screen
//
//  Shown when accessTier(profile) === 'investor_pending': someone signed up as
//  an Investor but an executive hasn't granted access yet. A movie-like rocket
//  launch over a starfield. Polls the profile so that the moment an exec grants
//  access (role_type → 'investor'), the viewer advances to the gold view with
//  no manual re-login. Honors prefers-reduced-motion.
//
//  Props: profile, onSignOut, onProfileUpdated (called with the fresh profile
//  row whenever it changes — App re-routes off the new tier).
// =============================================================================
export default function InvestorPendingView({ profile, onSignOut, onProfileUpdated }) {
  const [checking, setChecking] = useState(false)
  const lastRoleType = useRef(profile?.role_type)

  const check = useCallback(async (manual = false) => {
    if (manual) setChecking(true)
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', profile.id).single()
      if (!error && data && data.role_type !== lastRoleType.current) {
        lastRoleType.current = data.role_type
        onProfileUpdated?.(data) // tier changed (e.g. granted) → App re-routes
      }
    } catch { /* transient — try again next tick */ }
    finally { if (manual) setChecking(false) }
  }, [profile.id, onProfileUpdated])

  // Light poll every 12s so a granted investor advances automatically.
  useEffect(() => {
    const t = setInterval(() => check(false), 12000)
    return () => clearInterval(t)
  }, [check])

  const firstName = (profile?.name || '').split(' ')[0] || 'there'

  return (
    <div className="investor-pending">
      <PendingStyles />

      {/* Starfield + nebula backdrop */}
      <div className="ip-stars" aria-hidden="true" />
      <div className="ip-stars ip-stars-2" aria-hidden="true" />
      <div className="ip-nebula" aria-hidden="true" />

      {/* Sign out — top right */}
      <button onClick={onSignOut} className="ip-signout" aria-label="Sign out">
        <LogOut className="w-3.5 h-3.5" /> Sign out
      </button>

      <div className="ip-content">
        <AtlasLogo height={34} color="#FFFFFF" />

        {/* Cinematic 3D rocket */}
        <div className="ip-stage" aria-hidden="true">
          <RocketScene height={300} />
        </div>

        <div className="ip-eyebrow">Atlas Odyssey · Investor Access</div>
        <h1 className="ip-title">
          Welcome aboard, <em>{firstName}.</em>
        </h1>
        <p className="ip-sub">
          Your investor access is being prepared. An Atlas executive is reviewing your request —
          the moment it's approved, this screen will launch you straight into the dashboard.
          You'll also get an email letting you know.
        </p>

        <div className="ip-actions">
          <button onClick={() => check(true)} disabled={checking} className="ip-check">
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking…' : 'Check access'}
          </button>
        </div>

        <div className="ip-foot">Signed in as {profile?.name}</div>
      </div>
    </div>
  )
}

function PendingStyles() {
  return (
    <style>{`
      .investor-pending {
        position: relative;
        min-height: 100vh;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        font-family: 'Manrope', sans-serif;
        background:
          radial-gradient(ellipse 120% 80% at 50% 120%, rgba(102,57,166,0.45) 0%, transparent 60%),
          linear-gradient(180deg, #0B0620 0%, #160B33 55%, #1F1147 100%);
        color: #fff;
        padding: 32px;
      }
      /* layered starfields (pure CSS, two parallax speeds) */
      .ip-stars, .ip-stars-2 {
        position: absolute; inset: -20% 0; pointer-events: none;
        background-image:
          radial-gradient(1.4px 1.4px at 12% 22%, rgba(255,255,255,0.9), transparent),
          radial-gradient(1.2px 1.2px at 28% 64%, rgba(255,255,255,0.7), transparent),
          radial-gradient(1.6px 1.6px at 47% 38%, rgba(255,255,255,0.85), transparent),
          radial-gradient(1.1px 1.1px at 63% 18%, rgba(255,255,255,0.6), transparent),
          radial-gradient(1.5px 1.5px at 78% 72%, rgba(255,255,255,0.8), transparent),
          radial-gradient(1.2px 1.2px at 88% 34%, rgba(255,255,255,0.7), transparent),
          radial-gradient(1.3px 1.3px at 38% 84%, rgba(255,255,255,0.65), transparent),
          radial-gradient(1.1px 1.1px at 6% 52%, rgba(255,255,255,0.6), transparent);
        animation: ipDrift 90s linear infinite, ipTwinkle 5s ease-in-out infinite;
      }
      .ip-stars-2 { opacity: 0.55; transform: scale(1.6); animation-duration: 140s, 7s; }
      .ip-nebula {
        position: absolute; top: -10%; left: 50%; width: 720px; height: 720px;
        transform: translateX(-50%); pointer-events: none;
        background: radial-gradient(closest-side, rgba(139,92,208,0.28), transparent 70%);
        filter: blur(8px);
      }
      .ip-signout {
        position: absolute; top: 20px; right: 22px; z-index: 5;
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.8);
        padding: 7px 12px; border-radius: 9px;
        border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.06);
        backdrop-filter: blur(6px); transition: background 160ms, color 160ms;
      }
      .ip-signout:hover { background: rgba(255,255,255,0.14); color: #fff; }
      .ip-content { position: relative; z-index: 2; max-width: 540px; }

      .ip-stage { position: relative; margin: 10px 0 6px; }
      .ip-eyebrow {
        font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.22em; color: #B79BE8; margin-top: 14px;
      }
      .ip-title {
        font-family: 'Instrument Serif', serif; font-weight: 400; font-size: clamp(34px, 6vw, 52px);
        line-height: 1.04; letter-spacing: -0.01em; margin-top: 10px; color: #fff;
      }
      .ip-title em { font-style: italic; color: #C9A9F2; }
      .ip-sub { font-size: 14.5px; line-height: 1.6; color: rgba(255,255,255,0.72); margin-top: 16px; }
      .ip-actions { margin-top: 26px; }
      .ip-check {
        display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #1A0F2E;
        padding: 11px 20px; border-radius: 11px; background: #fff;
        box-shadow: 0 8px 28px -8px rgba(255,255,255,0.4); transition: transform 160ms, box-shadow 160ms;
      }
      .ip-check:hover { transform: translateY(-1px); box-shadow: 0 12px 34px -8px rgba(255,255,255,0.5); }
      .ip-check:disabled { opacity: 0.7; }
      .ip-foot { margin-top: 22px; font-size: 11px; color: rgba(255,255,255,0.4); font-family: 'JetBrains Mono', monospace; }

      @keyframes ipTwinkle { 0%,100% { opacity: 0.9 } 50% { opacity: 0.55 } }
      @keyframes ipDrift { from { background-position: 0 0 } to { background-position: 0 -600px } }

      @media (prefers-reduced-motion: reduce) {
        .ip-stars, .ip-stars-2 { animation: none; }
      }
    `}</style>
  )
}
