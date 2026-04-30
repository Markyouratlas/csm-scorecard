import React, { useState } from 'react'
import { X, Loader2, Check, Settings as SettingsIcon } from 'lucide-react'
import { supabase } from './supabase'
import { DAY_NAMES, DEFAULT_WORK_DAYS } from './teams'

export default function SettingsModal({ profile, onClose, onSaved }) {
  const initialDays = (profile.work_days && profile.work_days.length) ? profile.work_days : DEFAULT_WORK_DAYS
  const [workDays, setWorkDays] = useState(initialDays)
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
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ work_days: workDays })
      .eq('id', profile.id)
    setSaving(false)
    if (error) {
      setError(error.message)
    } else {
      setSavedFlash(true)
      setTimeout(() => {
        onSaved && onSaved({ ...profile, work_days: workDays })
        onClose()
      }, 700)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-stone-50 max-w-lg w-full p-8 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-stone-500 hover:text-stone-900 transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="w-5 h-5 text-stone-700" />
          <h2 className="display-font text-2xl font-medium text-stone-900">Settings</h2>
        </div>

        <div className="mb-6">
          <div className="mono-font text-[11px] uppercase tracking-widest text-stone-500 mb-3">Working days</div>
          <p className="text-sm text-stone-600 mb-4">
            Pick the days you work. Your scorecard will only show input rows for these days.
          </p>
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_NAMES.map((name, idx) => {
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
                  {name.slice(0, 3)}
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
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {savedFlash ? <><Check className="w-4 h-4" /> Saved</> : saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving</> : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
