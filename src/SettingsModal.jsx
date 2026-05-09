import React, { useState } from 'react'
import { X, Loader2, Check, Settings as SettingsIcon, User, Briefcase, Calendar } from 'lucide-react'
import { supabase } from './supabase'
import { DAY_NAMES, DEFAULT_WORK_DAYS } from './teams'

export default function SettingsModal({ profile, onClose, onSaved }) {
  const [name, setName] = useState(profile.name || '')
  const [title, setTitle] = useState(profile.title || '')
  const [workDays, setWorkDays] = useState(
    (profile.work_days && profile.work_days.length) ? profile.work_days : DEFAULT_WORK_DAYS
  )
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState(null)

  const toggle = (idx) => {
    setWorkDays(prev => prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort())
  }

  const save = async () => {
    if (workDays.length === 0) {
      setError('Pick at least one working day.')
      return
    }
    if (!name.trim()) {
      setError('Name cannot be empty.')
      return
    }
    setSaving(true)
    setError(null)
    const updates = {
      name: name.trim(),
      title: title.trim(),
      work_days: workDays,
    }
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id)
    setSaving(false)
    if (error) {
      setError(error.message)
    } else {
      setSavedFlash(true)
      setTimeout(() => {
        onSaved && onSaved({ ...profile, ...updates })
        onClose()
      }, 700)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white max-w-lg w-full p-8 relative max-h-[90vh] overflow-y-auto rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-stone-500 hover:text-stone-900 transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="w-5 h-5" style={{ color: '#6639A6' }} />
          <h2 className="display-font text-3xl font-medium text-stone-900">Your <em className="display-font-i font-normal" style={{ color: '#6639A6' }}>profile</em></h2>
        </div>

        {/* Name */}
        <div className="mb-5">
          <label className="flex items-center gap-1.5 mb-2">
            <User className="w-3.5 h-3.5 text-stone-500" />
            <div className="mono-font text-[11px] uppercase tracking-widest text-stone-500">Name</div>
          </label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className="w-full py-2.5 px-3 border border-stone-200 focus:border-stone-900 transition-colors text-base bg-white"
          />
        </div>

        {/* Title */}
        <div className="mb-5">
          <label className="flex items-center gap-1.5 mb-2">
            <Briefcase className="w-3.5 h-3.5 text-stone-500" />
            <div className="mono-font text-[11px] uppercase tracking-widest text-stone-500">Job Title</div>
          </label>
          <input
            type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Customer Success Manager"
            className="w-full py-2.5 px-3 border border-stone-200 focus:border-stone-900 transition-colors text-base bg-white"
          />
          <p className="text-[11px] text-stone-500 mt-1.5">
            Update this if your title changes (e.g., promotion, role change). It's shown next to your name in the app.
          </p>
        </div>

        {/* Working days */}
        <div className="mb-6">
          <label className="flex items-center gap-1.5 mb-2">
            <Calendar className="w-3.5 h-3.5 text-stone-500" />
            <div className="mono-font text-[11px] uppercase tracking-widest text-stone-500">Working days</div>
          </label>
          <p className="text-sm text-stone-600 mb-3">
            Your scorecard will only show input rows for these days.
          </p>
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_NAMES.map((day, idx) => {
              const isOn = workDays.includes(idx)
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggle(idx)}
                  className={`px-2 py-3 text-xs font-medium transition-all border ${
                    isOn
                      ? 'bg-stone-900 text-stone-50 border-stone-900'
                      : 'bg-white text-stone-700 border-stone-200 hover:border-stone-900'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              )
            })}
          </div>
          <div className="text-xs text-stone-500 mt-2">
            {workDays.length} {workDays.length === 1 ? 'day' : 'days'} selected
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || savedFlash}
            style={{ backgroundColor: '#6639a6' }}
            className="flex items-center gap-2 px-4 py-2 text-stone-50 hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50"
          >
            {savedFlash ? <><Check className="w-4 h-4" /> Saved</> : saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving</> : 'Save profile'}
          </button>
        </div>
      </div>
    </div>
  )
}
