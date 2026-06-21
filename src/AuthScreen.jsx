import React, { useState, useMemo } from 'react'
import { ChevronRight, Loader2, Check, ArrowLeft, Mail } from 'lucide-react'
import { supabase } from './supabase'
import { SIGNUP_DEPARTMENTS, DEFAULT_WORK_DAYS } from './teams'
import AtlasLogo, { ATLAS_PURPLE } from './AtlasLogo'

// Field reveal wrapper — fades up with a stagger so fields appear one-at-a-time.
function Field({ show, delay = 0, children }) {
  if (!show) return null
  return <div className="fade-up" style={{ animationDelay: `${delay}ms` }}>{children}</div>
}

export default function AuthScreen() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [dept, setDept] = useState('')        // department key ('' until chosen)
  const [roleType, setRoleType] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const department = useMemo(() => SIGNUP_DEPARTMENTS.find(d => d.key === dept), [dept])
  const isInvestorDept = !!department?.isInvestor
  const availableRoles = department?.roles || []

  // Progressive reveal (signup). Title + Role + Email mount together once Name is
  // filled, but stagger their fade-up so they cascade in one at a time.
  const showName = !!dept
  const showDetails = showName && name.trim().length > 0
  const showPassword = showDetails && email.trim().length > 0
  const canSubmit = !!dept && name.trim() && email.trim() && password.length >= 6 && (isInvestorDept || !!roleType)

  const chooseDept = (d) => {
    setDept(d.key)
    setError('')
    // Default the role to the department's first role (staff/leadership); investor has none.
    setRoleType(d.roles?.[0]?.key || '')
  }

  const switchMode = (m) => { setMode(m); setError(''); setInfo('') }

  const handleSignup = async () => {
    const { data, error: signUpError } = await supabase.auth.signUp({
      email, password, options: { data: { name, title } },
    })
    if (signUpError) throw signUpError
    if (!data.user) return

    const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
    const isFirstUser = (count ?? 0) === 0
    const colors = ['#C2410C', '#0F766E', '#7C3AED', '#B91C1C', '#0369A1', '#A16207', '#BE185D', '#1E40AF']
    const color = colors[(count ?? 0) % colors.length]

    // Investor signups land in a PENDING state until an exec grants access.
    const team = isInvestorDept ? 'investor' : dept
    const role_type = isInvestorDept ? 'investor_pending' : roleType
    const resolvedTitle = title
      || (isInvestorDept ? 'Investor' : (availableRoles.find(r => r.key === roleType)?.label || ''))

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      name,
      title: resolvedTitle,
      color,
      role: isFirstUser ? 'executive' : 'member',
      team,
      role_type,
      is_team_lead: isFirstUser || (!isInvestorDept && roleType.endsWith('_lead')),
      work_days: DEFAULT_WORK_DAYS,
    })
    if (profileError) throw profileError

    // Notify executives a new person signed up (flagged if they need access granted).
    // Best-effort — never block signup on the email.
    try {
      await supabase.functions.invoke('send-email', { body: { type: 'new_signup', userId: data.user.id } })
    } catch (e) { console.warn('new_signup email failed (non-blocking):', e) }

    if (!data.session) {
      setInfo('Check your email to confirm your account, then come back and sign in.')
    } else {
      // Force a clean session so RLS can read the freshly-inserted profile.
      await supabase.auth.signOut()
      await new Promise(r => setTimeout(r, 300))
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
    }
  }

  const handleSubmit = async () => {
    setError(''); setInfo('')
    if (mode === 'forgot') {
      if (!email) { setError('Enter your email to reset your password.'); return }
      setLoading(true)
      try {
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (resetErr) throw resetErr
        setInfo("If an account exists for that email, a password-reset link is on its way.")
      } catch (e) { setError(e.message || 'Could not send the reset email.') }
      finally { setLoading(false) }
      return
    }

    if (!email || !password) { setError('Email and password are required.'); return }
    if (mode === 'signup') {
      if (!dept) { setError('Pick a department to get started.'); return }
      if (!name.trim()) { setError('Please enter your full name.'); return }
    }
    setLoading(true)
    try {
      if (mode === 'signup') {
        await handleSignup()
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

  const inputCls = "w-full py-2.5 px-3 border border-stone-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-[#6B21A8]/20 outline-none transition-all text-sm"
  const labelCls = "mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1.5"

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
          {mode === 'signin' ? <>Welcome <em className="display-font-i font-normal" style={{ color: ATLAS_PURPLE }}>back.</em></>
            : mode === 'forgot' ? <>Reset your <em className="display-font-i font-normal" style={{ color: ATLAS_PURPLE }}>password.</em></>
            : <>Get <em className="display-font-i font-normal" style={{ color: ATLAS_PURPLE }}>started.</em></>}
        </h1>
        <p className="text-stone-600 text-base mb-8 leading-relaxed">
          {mode === 'signin' ? 'Sign in to log your week.'
            : mode === 'forgot' ? "Enter your email and we'll send you a reset link."
            : 'Pick your department to begin.'}
        </p>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4 shadow-[0_1px_2px_rgba(26,15,46,0.04)]">
          {/* ---- SIGN UP: progressive ---- */}
          {mode === 'signup' && (
            <>
              <div>
                <label className={labelCls}>Department</label>
                <div className="grid grid-cols-2 gap-2">
                  {SIGNUP_DEPARTMENTS.map(d => {
                    const active = dept === d.key
                    return (
                      <button key={d.key} type="button" onClick={() => chooseDept(d)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-sm transition-all"
                        style={{
                          borderColor: active ? d.color : 'rgba(0,0,0,0.12)',
                          background: active ? `${d.color}12` : '#fff',
                          boxShadow: active ? `0 0 0 1px ${d.color}` : 'none',
                        }}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="font-medium text-stone-800 leading-tight">{d.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <Field show={showName} delay={0}>
                <label className={labelCls}>Full name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Carter" className={inputCls} autoFocus />
              </Field>

              {!isInvestorDept && (
                <Field show={showDetails} delay={80}>
                  <label className={labelCls}>{department?.key === 'leadership' ? 'Title' : 'Role'}</label>
                  <select value={roleType} onChange={(e) => setRoleType(e.target.value)} className={`${inputCls} bg-white`}>
                    {availableRoles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </Field>
              )}

              <Field show={showDetails} delay={isInvestorDept ? 80 : 160}>
                <label className={labelCls}>{isInvestorDept ? 'Firm / title (optional)' : 'Job title (optional)'}</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to your role" className={inputCls} />
              </Field>

              <Field show={showDetails} delay={isInvestorDept ? 160 : 240}>
                <label className={labelCls}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={inputCls} />
              </Field>

              <Field show={showPassword} delay={0}>
                <label className={labelCls}>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()} placeholder="At least 6 characters" className={inputCls} />
              </Field>

              {isInvestorDept && showName && (
                <Field show delay={240}>
                  <div className="text-xs text-stone-600 leading-relaxed p-3 border-l-2 bg-amber-50/60 rounded-r-lg" style={{ borderColor: '#B8860B' }}>
                    <strong style={{ color: '#8A6D1B' }}>Investor access</strong> is granted by an Atlas executive. After you sign up you'll see a holding screen, and we'll email you the moment you're approved.
                  </div>
                </Field>
              )}
            </>
          )}

          {/* ---- SIGN IN / FORGOT ---- */}
          {mode !== 'signup' && (
            <>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && mode === 'forgot' && handleSubmit()} placeholder="you@company.com" className={inputCls} />
              </div>
              {mode === 'signin' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500">Password</label>
                    <button type="button" onClick={() => switchMode('forgot')} className="text-[11px] text-stone-500 hover:text-stone-900 underline">Forgot password?</button>
                  </div>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} placeholder="Your password" className={inputCls} />
                </div>
              )}
            </>
          )}

          {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2 rounded-lg">{error}</div>}
          {info && <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2 rounded-lg">{info}</div>}

          <button onClick={handleSubmit} disabled={loading || (mode === 'signup' && !canSubmit)}
            style={{ backgroundColor: ATLAS_PURPLE }}
            className="w-full flex items-center justify-center gap-2 py-3 text-stone-50 hover:opacity-90 transition-opacity text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" />
              : mode === 'forgot' ? <Mail className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />}
            {mode === 'signin' ? 'Sign in' : mode === 'forgot' ? 'Send reset link' : 'Create account'}
          </button>

          <div className="text-center text-sm text-stone-600">
            {mode === 'forgot' ? (
              <button onClick={() => switchMode('signin')} className="inline-flex items-center gap-1.5 text-stone-900 font-medium hover:underline">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
              </button>
            ) : (
              <>
                {mode === 'signin' ? "Don't have an account? " : 'Already have one? '}
                <button onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')} className="text-stone-900 font-medium underline hover:no-underline">
                  {mode === 'signin' ? 'Sign up' : 'Sign in'}
                </button>
              </>
            )}
          </div>
        </div>

        {mode === 'signup' && (
          <div className="text-xs text-stone-500 mt-6 text-center">
            The first person to sign up becomes an executive. Investors get access once an exec approves them.
          </div>
        )}
      </div>
    </div>
  )
}
