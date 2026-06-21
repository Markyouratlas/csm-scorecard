import React, { useState } from 'react'
import { ChevronRight, Loader2, Check, KeyRound } from 'lucide-react'
import { supabase } from './supabase'
import AtlasLogo, { ATLAS_PURPLE } from './AtlasLogo'

// =============================================================================
//  ResetPasswordView — set a new password after clicking the recovery email.
//
//  Reached when Supabase fires the PASSWORD_RECOVERY auth event (the user
//  arrived via the reset link, which establishes a temporary recovery session).
//  Sets the new password via supabase.auth.updateUser, then hands control back
//  to App via onDone() — the user is signed in and routes normally.
// =============================================================================
export default function ResetPasswordView({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async () => {
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password })
      if (updErr) throw updErr
      setDone(true)
      setTimeout(() => onDone?.(), 1400)
    } catch (e) {
      setError(e.message || 'Could not reset your password. The link may have expired — request a new one.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12" style={{ background: 'radial-gradient(ellipse at top, #FAFAF7 0%, #EDE7F5 100%)' }}>
      <div className="w-full max-w-md fade-up">
        <div className="mb-8 flex items-center gap-3">
          <AtlasLogo height={44} />
          <div className="border-l border-stone-300 pl-3 ml-1">
            <div className="mono-font text-[10px] uppercase tracking-[0.2em] text-stone-500">Scorecard</div>
            <div className="text-xs text-stone-600 mt-0.5">Reset password</div>
          </div>
        </div>

        {done ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
            <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)' }}>
              <Check className="w-6 h-6" style={{ color: '#15803D' }} />
            </div>
            <div className="display-font text-2xl font-medium text-stone-900 mb-1">Password updated</div>
            <p className="text-stone-600 text-sm">Signing you in…</p>
          </div>
        ) : (
          <>
            <h1 className="display-font text-5xl md:text-6xl font-medium leading-[0.95] tracking-tight text-stone-900 mb-3">
              Set a <em className="display-font-i font-normal" style={{ color: ATLAS_PURPLE }}>new password.</em>
            </h1>
            <p className="text-stone-600 text-base mb-8 leading-relaxed">Choose a new password for your Atlas account.</p>

            <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
              <div>
                <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1">New password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters"
                  className="w-full py-2.5 px-3 border border-stone-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-[#6B21A8]/20 outline-none transition-all text-sm" />
              </div>
              <div>
                <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1">Confirm password</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Re-enter password"
                  className="w-full py-2.5 px-3 border border-stone-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-[#6B21A8]/20 outline-none transition-all text-sm" />
              </div>

              {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2 rounded-lg">{error}</div>}

              <button onClick={submit} disabled={loading}
                style={{ backgroundColor: ATLAS_PURPLE }}
                className="w-full flex items-center justify-center gap-2 py-3 text-stone-50 hover:opacity-90 transition-opacity text-sm font-medium rounded-lg disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Update password
                {!loading && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
