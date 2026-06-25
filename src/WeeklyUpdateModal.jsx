import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, AlertCircle, Copy, ClipboardCheck, CalendarRange } from 'lucide-react'
import { getWeekKey, stepWeek } from './dateUtils.js'
import { useWeeklyUpdate } from './hooks/useWeeklyUpdate.js'
import { useExecutiveStats } from './hooks/useExecutiveStats.js'
import { PACE_METRICS, DERIVED_METRICS, WEEKLY_TARGET_KEYS } from './dailyUpdateFormat.js'
import { vsTargetPct, fmtVsTarget, vsTargetEmoji, weekFridayLabel, buildWeeklySlackPost } from './weeklyUpdateFormat.js'

// =============================================================================
//  WeeklyUpdateModal — exec-only entry for the investors' Weekly Update.
//
//  "This Wk" per metric is auto-summed from that week's daily rows (read-only);
//  the weekly Target sits beside each (writes the SAME atlas_weekly_targets the
//  daily uses). The exec fills the weekly-only fields — snapshot extras, narrative,
//  Core Rocks, Asks — and can Copy the spec-exact Slack post. Saves to
//  atlas_weekly_updates. Props: open, onClose, userId.
// =============================================================================

const BRAND = '#6639A6'
const BTN = '#5B21B6'
const BORDER = '#E2E8F0'
const DIVIDER = '#F3F4F6'

const NUM_KEYS = ['total_mrr', 'total_customers', 'churned_this_week', 'pipeline_amount', 'pipeline_count', 'cash_on_hand', 'runway_months']
const TEXT_KEYS = ['focus', 'focus_metric', 'plan_to_improve', 'key_learning', 'blocker', 'rocks_product', 'rocks_team', 'rocks_general', 'asks', 'plan_url', 'scorecard_url']

const parseNum = (s) => {
  if (s === '' || s == null) return null
  const n = Number(String(s).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}
function formFromWeek(week) {
  const f = {}
  for (const k of NUM_KEYS) f[k] = week?.[k] != null ? String(week[k]) : ''
  for (const k of TEXT_KEYS) f[k] = week?.[k] ?? ''
  return f
}

const inputCls = 'w-full h-9 px-3 text-sm num-tabular bg-white border rounded-lg outline-none transition-shadow focus:ring-2 focus:ring-[#6B21A8]/20'
const areaCls = 'w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition-shadow focus:ring-2 focus:ring-[#6B21A8]/20'
const labelCls = 'block text-[10px] uppercase tracking-[0.12em] font-semibold text-stone-400 mb-1'

function Field({ label, hint, children }) {
  return (
    <div>
      <label className={labelCls}>{label}{hint && <span className="text-stone-300 normal-case tracking-normal font-normal ml-1">{hint}</span>}</label>
      {children}
    </div>
  )
}
function NumInput({ value, onChange, prefix, placeholder = '' }) {
  return (
    <div className="flex items-stretch h-9 rounded-lg border bg-white overflow-hidden focus-within:ring-2 focus-within:ring-[#6B21A8]/20" style={{ borderColor: BORDER }}>
      {prefix && <span className="flex items-center justify-center w-8 shrink-0 bg-gray-50 border-r text-stone-400 text-sm select-none" style={{ borderColor: BORDER }}>{prefix}</span>}
      <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="flex-1 min-w-0 px-3 text-sm num-tabular bg-transparent outline-none" />
    </div>
  )
}

export default function WeeklyUpdateModal({ open, onClose, userId }) {
  const wu = useWeeklyUpdate()
  const stats = useExecutiveStats({ includeLive: true })

  const [weekKey, setWeekKey] = useState(getWeekKey())
  const [form, setForm] = useState(() => formFromWeek(null))
  const [targets, setTargets] = useState({})
  // Per-metric This-Wk overrides (string-keyed for the inputs). Blank = use the
  // calculated daily sum; any typed value (incl. 0) overrides it.
  const [overrides, setOverrides] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  // Load saved week + targets when data settles / week changes.
  useEffect(() => {
    if (!open || wu.loading) return
    setForm(formFromWeek(wu.getWeek(weekKey)))
    const wk = wu.getWeeklyTargets(weekKey)
    const t = {}
    for (const k of WEEKLY_TARGET_KEYS) t[k] = wk[k] != null ? String(wk[k]) : ''
    setTargets(t)
    const ov = wu.getMetricOverrides(weekKey)
    const o = {}
    for (const m of PACE_METRICS) if (m.key in ov && ov[m.key] != null) o[m.key] = String(ov[m.key])
    setOverrides(o)
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, weekKey, wu.loading])

  // Prefill end-of-week MRR/customers from live when blank.
  useEffect(() => {
    if (!open) return
    setForm((f) => {
      const n = { ...f }
      if ((n.total_mrr ?? '') === '' && stats.mrr?.value != null) n.total_mrr = String(Math.round(stats.mrr.value))
      if ((n.total_customers ?? '') === '' && stats.customers?.value != null) n.total_customers = String(Math.round(stats.customers.value))
      return n
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, weekKey, stats.mrr?.value, stats.customers?.value])

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev }
  }, [open, onClose])

  if (!open) return null

  const setF = (k) => (v) => { setSaved(false); setForm((f) => ({ ...f, [k]: v })) }
  const setT = (k) => (v) => { setSaved(false); setTargets((t) => ({ ...t, [k]: v })) }
  const setOv = (k) => (v) => { setSaved(false); setOverrides((o) => ({ ...o, [k]: v })) }

  // "This Wk": calculated daily sum per metric, overridden by any typed value.
  const calc = wu.thisWeekCalculated(weekKey)
  const thisWk = {}
  for (const m of PACE_METRICS) {
    const ov = overrides[m.key]
    thisWk[m.key] = ov != null && ov !== '' ? parseNum(ov) : calc[m.key]
  }

  const buildMetricOverrides = () => {
    const o = {}
    for (const m of PACE_METRICS) {
      const v = overrides[m.key]
      if (v != null && v !== '') { const n = parseNum(v); if (n != null) o[m.key] = n }
    }
    return o
  }

  const buildFields = () => {
    const f = {}
    for (const k of NUM_KEYS) f[k] = parseNum(form[k])
    for (const k of TEXT_KEYS) f[k] = (form[k] || '').trim() || null
    f.metric_overrides = buildMetricOverrides()
    return f
  }
  const parsedWeek = () => ({ ...buildFields(), week_key: weekKey, updated_at: new Date().toISOString() })
  const parsedTargets = () => {
    const t = {}
    for (const k of WEEKLY_TARGET_KEYS) t[k] = parseNum(targets[k])
    return t
  }
  const deltas = () => {
    const prev = wu.getWeek(stepWeek(weekKey, -1))
    const cur = parsedWeek()
    const d = (a, b) => (a != null && b != null ? Number(a) - Number(b) : null)
    return { mrr: d(cur.total_mrr, prev?.total_mrr), customers: d(cur.total_customers, prev?.total_customers) }
  }

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      await wu.save(weekKey, buildFields(), userId)
      await Promise.all(WEEKLY_TARGET_KEYS.map((k) => wu.saveWeeklyTarget(weekKey, k, parseNum(targets[k]), userId)))
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) { console.error('WeeklyUpdate save:', e); setError(e.message || 'Failed to save.') }
    finally { setSaving(false) }
  }
  const handleCopy = async () => {
    const post = buildWeeklySlackPost(parsedWeek(), thisWk, parsedTargets(), deltas())
    try { await navigator.clipboard.writeText(post); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { window.prompt('Copy the weekly update:', post) }
  }

  // Week options: the recent ~12 weeks (Mondays), newest first.
  const weekOptions = Array.from({ length: 12 }, (_, i) => stepWeek(getWeekKey(), -i))

  const modal = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15, 8, 37, 0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-8 pt-6 pb-4 border-b" style={{ borderColor: DIVIDER }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-2" style={{ color: BRAND }}>
              <CalendarRange className="w-3 h-3" /> Weekly Update
            </div>
            <h2 className="display-text text-2xl md:text-3xl font-medium leading-tight text-stone-900">This week's update</h2>
            <p className="text-[13px] text-stone-500 mt-2 leading-relaxed">"This Wk" is summed from the daily entries; targets are shared with the daily update. Fill the snapshot, narrative, rocks &amp; asks, then Copy as Slack.</p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-stone-400 hover:text-stone-700 transition-colors" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-8 pt-5 pb-6 flex-1 space-y-6">
          {/* Week picker */}
          <Field label="Week" hint={`· ${weekFridayLabel(weekKey)}`}>
            <select value={weekKey} onChange={(e) => setWeekKey(e.target.value)} className={inputCls} style={{ borderColor: BORDER }}>
              {weekOptions.map((wk) => <option key={wk} value={wk}>{weekFridayLabel(wk)}</option>)}
            </select>
          </Field>

          {/* This week vs target */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-stone-400 mb-1">This week vs. target</div>
            <p className="text-[11px] text-stone-400 mb-3">“This Wk” is calculated from the daily entries — leave a cell blank to use it, or type to override. <span className="font-semibold" style={{ color: BRAND }}>Target</span> is shared with the daily update.</p>
            <div className="space-y-2">
              <div className="grid items-center gap-2 pb-1 border-b" style={{ gridTemplateColumns: '1fr 104px 104px 72px', borderColor: DIVIDER }}>
                <div></div>
                <div className="text-[9px] uppercase tracking-widest text-stone-400 text-right">This Wk</div>
                <div className="text-[9px] uppercase tracking-widest font-bold text-center" style={{ color: BRAND }}>Target ✎</div>
                <div className="text-[9px] uppercase tracking-widest text-stone-400 text-right">vs</div>
              </div>
              {PACE_METRICS.map((m) => {
                const tw = thisWk[m.key]
                const tgt = parseNum(targets[m.key])
                const pct = vsTargetPct(tw, tgt)
                return (
                  <div key={m.key} className="grid items-center gap-2" style={{ gridTemplateColumns: '1fr 104px 104px 72px' }}>
                    <div className="text-sm text-stone-700">{m.label}</div>
                    <NumInput value={overrides[m.key] ?? ''} onChange={setOv(m.key)} prefix={m.unit === 'usd' ? '$' : null}
                      placeholder={calc[m.key] == null ? 'calc' : String(Math.round(calc[m.key]))} />
                    <NumInput value={targets[m.key] ?? ''} onChange={setT(m.key)} prefix={m.unit === 'usd' ? '$' : null} placeholder="target" />
                    <div className="text-right num-tabular text-[12px]" style={{ color: pct == null ? '#a8a29e' : (pct >= 0 ? '#15803D' : pct >= -20 ? '#B45309' : '#DC2626') }}>
                      {pct == null ? '—' : `${fmtVsTarget(pct)} ${vsTargetEmoji(pct)}`}
                    </div>
                  </div>
                )
              })}
              <div className="grid items-center gap-2 pt-1" style={{ gridTemplateColumns: '1fr 104px 104px 72px' }}>
                {DERIVED_METRICS.map((d) => (
                  <React.Fragment key={d.key}>
                    <div className="text-sm text-stone-500">{d.label} target</div>
                    <div></div>
                    <NumInput value={targets[d.key] ?? ''} onChange={setT(d.key)} placeholder="%" />
                    <div></div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Snapshot */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-stone-400 mb-3">Snapshot <span className="text-stone-300 normal-case tracking-normal font-normal">· MRR/Customers prefilled from live</span></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total MRR"><NumInput value={form.total_mrr ?? ''} onChange={setF('total_mrr')} prefix="$" /></Field>
              <Field label="Total Customers"><NumInput value={form.total_customers ?? ''} onChange={setF('total_customers')} /></Field>
              <Field label="Churned this week"><NumInput value={form.churned_this_week ?? ''} onChange={setF('churned_this_week')} placeholder="0" /></Field>
              <Field label="Pipeline amount"><NumInput value={form.pipeline_amount ?? ''} onChange={setF('pipeline_amount')} prefix="$" /></Field>
              <Field label="Pipeline opps (count)"><NumInput value={form.pipeline_count ?? ''} onChange={setF('pipeline_count')} /></Field>
              <Field label="Cash on hand"><NumInput value={form.cash_on_hand ?? ''} onChange={setF('cash_on_hand')} prefix="$" /></Field>
              <Field label="Runway (months)"><NumInput value={form.runway_months ?? ''} onChange={setF('runway_months')} /></Field>
            </div>
          </div>

          {/* Narrative */}
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-widest font-semibold text-stone-400">Narrative</div>
            <Field label="#1 Focus (this week)"><input value={form.focus ?? ''} onChange={(e) => setF('focus')(e.target.value)} className={inputCls} style={{ borderColor: BORDER }} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Focus metric"><input value={form.focus_metric ?? ''} onChange={(e) => setF('focus_metric')(e.target.value)} className={inputCls} style={{ borderColor: BORDER }} /></Field>
              <Field label="Plan to improve" hint="· required"><input value={form.plan_to_improve ?? ''} onChange={(e) => setF('plan_to_improve')(e.target.value)} className={inputCls} style={{ borderColor: BORDER }} /></Field>
            </div>
            <Field label="Key learning"><input value={form.key_learning ?? ''} onChange={(e) => setF('key_learning')(e.target.value)} className={inputCls} style={{ borderColor: BORDER }} /></Field>
            <Field label="Blocker"><input value={form.blocker ?? ''} onChange={(e) => setF('blocker')(e.target.value)} className={inputCls} style={{ borderColor: BORDER }} /></Field>
          </div>

          {/* Core Rocks + Asks (one bullet per line) */}
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-widest font-semibold text-stone-400">Core Rocks <span className="text-stone-300 normal-case tracking-normal font-normal">· one bullet per line</span></div>
            <Field label="Product"><textarea rows={2} value={form.rocks_product ?? ''} onChange={(e) => setF('rocks_product')(e.target.value)} className={areaCls} style={{ borderColor: BORDER }} /></Field>
            <Field label="Team"><textarea rows={2} value={form.rocks_team ?? ''} onChange={(e) => setF('rocks_team')(e.target.value)} className={areaCls} style={{ borderColor: BORDER }} /></Field>
            <Field label="General"><textarea rows={2} value={form.rocks_general ?? ''} onChange={(e) => setF('rocks_general')(e.target.value)} className={areaCls} style={{ borderColor: BORDER }} /></Field>
            <Field label="Asks" hint="· one per line"><textarea rows={2} value={form.asks ?? ''} onChange={(e) => setF('asks')(e.target.value)} className={areaCls} style={{ borderColor: BORDER }} /></Field>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan URL"><input value={form.plan_url ?? ''} onChange={(e) => setF('plan_url')(e.target.value)} placeholder="https://…" className={inputCls} style={{ borderColor: BORDER }} /></Field>
            <Field label="Scorecard URL"><input value={form.scorecard_url ?? ''} onChange={(e) => setF('scorecard_url')(e.target.value)} placeholder="https://…" className={inputCls} style={{ borderColor: BORDER }} /></Field>
          </div>

          {error && <div className="text-[12px] text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-8 py-4 border-t" style={{ borderColor: DIVIDER }}>
          <button onClick={handleCopy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border text-[13px] font-semibold text-stone-700 hover:bg-gray-50 transition-colors" style={{ borderColor: BORDER }}>
            {copied ? <ClipboardCheck className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy as Slack update'}
          </button>
          <button onClick={handleSave} disabled={saving || saved} className="inline-flex items-center gap-1.5 h-9 px-5 rounded-lg text-white text-[13px] font-semibold disabled:opacity-90 transition-all" style={{ background: saved ? '#15803D' : BTN }}>
            {saved ? <ClipboardCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
