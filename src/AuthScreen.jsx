import React, { useState, useMemo } from 'react'
import { Sparkles, ChevronRight, Loader2 } from 'lucide-react'
import { supabase } from './supabase'
import { TEAMS, DEFAULT_WORK_DAYS } from './teams'
import AtlasLogo, { ATLAS_PURPLE } from './AtlasLogo'

export default function AuthScreen() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [team, setTeam] = useState('customer_success')
  const [roleType, setRoleType] = useState('csm')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [info, setInfo] = useState('')

  const availableRoles = useMemo(
    () => TEAMS.find(t => t.key === team)?.roles || [],
    [team]
  )

  // When team changes, reset role to first role of that team
  const handleTeamChange = (newTeam) => {
    setTeam(newTeam)
    const firstRole = TEAMS.find(t => t.key === newTeam)?.roles?.[0]?.key
    if (firstRole) setRoleType(firstRole)
  }

  const handleSubmit = async () => {
    setError('')
    setInfo('')
    if (!email || !password) {
      setError('Email and password are required.')
      return
    }
    if (mode === 'signup' && !name) {
      setError('Please enter your full name.')
      return
    }
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email, password,
          options: { data: { name, title } },
        })
        if (signUpError) throw signUpError

        if (data.user) {
          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })

          const isFirstUser = (count ?? 0) === 0
          const colors = ['#C2410C', '#0F766E', '#7C3AED', '#B91C1C', '#0369A1', '#A16207', '#BE185D', '#1E40AF']
          const color = colors[(count ?? 0) % colors.length]

          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            name,
            title: title || (TEAMS.find(t => t.key === team)?.roles.find(r => r.key === roleType)?.label || ''),
            color,
            // First user automatically becomes executive in the legacy `role` column.
            // The Phase 1 migration ensures executives have `role_type='executive'` but
            // we also want first-user to have their actual job role preserved for their
            // personal scorecard. We handle this by storing actual role in role_type,
            // and using `role='executive'` as the access flag.
            role: isFirstUser ? 'executive' : 'member',
            team,
            role_type: roleType,
            is_team_lead: isFirstUser ? true : false,
            work_days: DEFAULT_WORK_DAYS,
          })
          if (profileError) throw profileError
        }

        if (!data.session) {
          setInfo('Check your email to confirm your account, then come back and sign in.')
        } else {
          // Profile is freshly inserted but the auth session may not yet have
          // the proper RLS context to read it back. Force a sign-out and sign-in
          // to establish a clean session that can read the profile.
          await supabase.auth.signOut()
          // Brief delay to ensure the profile insert is fully committed
          await new Promise(r => setTimeout(r, 300))
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
          if (signInError) throw signInError
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      }
    } catch (e) {
      setError(e.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12" style={{ background: 'radial-gradient(ellipse at top, #FAFAF7 0%, #EDE7F5 100%)' }}>
      <div className="w-full max-w-md fade-up">
        <div className="mb-8 flex items-center gap-3">
          <AtlasLogo height={48} />
          <div className="border-l border-stone-300 pl-3 ml-1">
            <div className="mono-font text-[10px] uppercase tracking-[0.2em] text-stone-500">Scorecard</div>
            <div className="text-xs text-stone-600 mt-0.5">Internal Tool</div>
          </div>
        </div>
        <h1 className="display-font text-5xl md:text-6xl font-medium leading-[0.95] tracking-tight text-stone-900 mb-3">
          {mode === 'signin' ? <>Welcome <em className="display-font-i font-normal" style={{ color: '#6639A6' }}>back.</em></> : <>Get <em className="display-font-i font-normal" style={{ color: '#6639A6' }}>started.</em></>}
        </h1>
        <p className="text-stone-600 text-base max-w-xl mb-10 leading-relaxed">
          {mode === 'signin' ? 'Sign in to log your week.' : 'Create your account to get started.'}
        </p>

        <div className="bg-white border border-stone-200 p-6 space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1">Full name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Carter"
                  className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm" />
              </div>
              <div>
                <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1">Job title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="(optional — defaults to your role)"
                  className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1">Team</label>
                  <select value={team} onChange={(e) => handleTeamChange(e.target.value)}
                    className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm bg-white">
                    {TEAMS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1">
                    {team === 'leadership' ? 'Title' : 'Role'}
                  </label>
                  <select value={roleType} onChange={(e) => setRoleType(e.target.value)}
                    className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm bg-white">
                    {availableRoles.map(r => (
                      <option key={r.key} value={r.key}>
                        {r.label}{r.status === 'coming_soon' ? ' (preview)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {team === 'leadership' && (
                <div className="text-xs text-stone-600 leading-relaxed p-3 border-l-2 bg-stone-50" style={{ borderColor: '#6639a6' }}>
                  <strong style={{ color: '#6639a6' }}>Heads up:</strong> Leadership members don't have a personal scorecard.
                  After signup, an existing executive will need to grant you executive access — then you'll land on the Executive Dashboard with full visibility.
                </div>
              )}
            </>
          )}
          <div>
            <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
              className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm" />
          </div>
          <div>
            <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters"
              className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm" />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{error}</div>}
          {info && <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2">{info}</div>}

          <button onClick={handleSubmit} disabled={loading}
            style={{ backgroundColor: ATLAS_PURPLE }}
            className="w-full flex items-center justify-center gap-2 py-3 text-stone-50 hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          <div className="text-center text-sm text-stone-600">
            {mode === 'signin' ? "Don't have an account? " : 'Already have one? '}
            <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setInfo('') }}
              className="text-stone-900 font-medium underline hover:no-underline">
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>

        <div className="text-xs text-stone-500 mt-6 text-center">
          The first person to sign up becomes an executive. Everyone after picks their team and role.
        </div>
      </div>
    </div>
  )
}
