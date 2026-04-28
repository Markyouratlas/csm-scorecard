import React, { useState } from 'react'
import { Sparkles, ChevronRight, Loader2 } from 'lucide-react'
import { supabase } from './supabase'

export default function AuthScreen() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [title, setTitle] = useState('Customer Success Manager')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [info, setInfo] = useState('')

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
          email,
          password,
          options: {
            data: { name, title },
          },
        })
        if (signUpError) throw signUpError

        // Insert into profiles table. The first user becomes the manager automatically.
        if (data.user) {
          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })

          const isFirstUser = (count ?? 0) === 0
          const colors = ['#C2410C', '#0F766E', '#7C3AED', '#B91C1C', '#0369A1', '#A16207', '#BE185D']
          const color = colors[(count ?? 0) % colors.length]

          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            name,
            title,
            color,
            role: isFirstUser ? 'manager' : 'csm',
          })
          if (profileError) throw profileError
        }

        if (!data.session) {
          setInfo('Check your email to confirm your account, then come back and sign in.')
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
    <div className="min-h-screen flex items-center justify-center px-6 py-12" style={{ background: 'radial-gradient(ellipse at top, #FAF8F4 0%, #F0EBE0 100%)' }}>
      <div className="w-full max-w-md fade-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: '#1C1917' }}>
            <Sparkles className="w-5 h-5" style={{ color: '#F59E0B' }} strokeWidth={2.5} />
          </div>
          <div className="mono-font text-xs uppercase tracking-[0.2em] text-stone-600">Customer Success / Internal</div>
        </div>
        <h1 className="display-font text-5xl md:text-6xl font-medium leading-[0.95] tracking-tight text-stone-900 mb-3">
          The <em className="font-light">Scorecard</em>
        </h1>
        <p className="text-stone-600 text-base max-w-xl mb-10 leading-relaxed">
          {mode === 'signin' ? 'Sign in to log your week.' : 'Create your account to get started.'}
        </p>

        <div className="bg-white border border-stone-200 p-6 space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1">Full name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Carter"
                  className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm"
                />
              </div>
              <div>
                <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1">Job title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm"
                />
              </div>
            </>
          )}
          <div>
            <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm"
            />
          </div>
          <div>
            <label className="mono-font text-[10px] uppercase tracking-widest text-stone-500 block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full py-2 px-3 border border-stone-300 focus:border-stone-900 transition-colors text-sm"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{error}</div>
          )}
          {info && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2">{info}</div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          <div className="text-center text-sm text-stone-600">
            {mode === 'signin' ? "Don't have an account? " : 'Already have one? '}
            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setInfo('') }}
              className="text-stone-900 font-medium underline hover:no-underline"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>

        <div className="text-xs text-stone-500 mt-6 text-center">
          The first person to sign up becomes the manager. Everyone after is a CSM.
        </div>
      </div>
    </div>
  )
}
