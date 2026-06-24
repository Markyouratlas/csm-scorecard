import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { X, Check, AlertCircle, Copy, ClipboardCheck, CalendarDays, Zap, RefreshCw, Eye } from 'lucide-react'
import { useDailyUpdates, mondayOf, todayStr } from './hooks/useDailyUpdates.js'
import { useExecutiveStats } from './hooks/useExecutiveStats.js'
import { useMetaAds } from './hooks/useMetaAds.js'
import { useOdysseyMetrics } from './hooks/useOdysseyMetrics.js'
import { useStripeDailyCash } from './hooks/useStripeDailyCash.js'
import { useDailyUpdatePreview } from './hooks/useDailyUpdatePreview.js'
import {
  PACE_METRICS, DERIVED_METRICS, WEEKLY_TARGET_KEYS,
  buildSlackPost, formatReportDate, fmtCurrency, fmtCount, fmtValue,
  expectedPct, workdayIndex, vsPacePP, paceHex, paceEmoji, fmtPacePP,
  derivedRatio, derivedEmoji, derivedHex,
} from './dailyUpdateFormat.js'

// =============================================================================
//  DailyUpdateModal — exec-only entry form for the investor "Daily Update".
//
//  Auto-pulls today's numbers from the live integrations the exec CAN read
//  (Meta → ad spend, Cal.com → calls booked, sales scorecards → calls held +
//  deals closed, aggregate stats → MRR/customers), pre-filling the form. The
//  exec confirms + saves into atlas_daily_updates, which the investor view reads
//  (investors never hit those APIs directly — RLS + security). Cash collected is
//  split into a Stripe portion + a manual Wire/ACH portion that sum to a total.
//
//  Props: open, onClose, userId
// =============================================================================

const BRAND = '#6639A6'
const BTN = '#5B21B6'
const BORDER = '#E2E8F0'
const DIVIDER = '#F3F4F6'

// Pace inputs rendered as plain fields (cash is handled separately, split).
const PACE_INPUT_METRICS = PACE_METRICS.filter((m) => m.key !== 'cash_collected')
const NUM_KEYS = [
  ...PACE_INPUT_METRICS.map((m) => m.key),
  'total_mrr', 'total_customers', 'cash_stripe', 'cash_wire_ach',
]
const TEXT_KEYS = ['focus', 'focus_metric', 'plan_to_improve', 'key_learning', 'blocker', 'plan_url', 'scorecard_url']

// Which fields are fed by a live integration (shown as a hint + ⚡).
const AUTO_SOURCE = {
  ad_spend: 'Meta', calls_booked: 'Scorecards', calls_held: 'Scorecards',
  deals_closed: 'Scorecards', new_customers: 'Scorecards', mrr_added: 'Stripe',
}

const parseNum = (s) => {
  if (s === '' || s == null) return null
  const n = Number(String(s).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function formFromDay(day) {
  const f = {}
  for (const k of NUM_KEYS) f[k] = day?.[k] != null ? String(day[k]) : ''
  for (const k of TEXT_KEYS) f[k] = day?.[k] ?? ''
  return f
}

// Total cash + the row written to the DB (cash_collected = stripe + wire/ach).
function buildFields(form) {
  const f = {}
  for (const k of NUM_KEYS) f[k] = parseNum(form[k])
  for (const k of TEXT_KEYS) f[k] = (form[k] || '').trim() || null
  f.cash_collected = (f.cash_stripe == null && f.cash_wire_ach == null)
    ? null
    : (f.cash_stripe || 0) + (f.cash_wire_ach || 0)
  return f
}

const inputCls = 'w-full h-9 px-3 text-sm num-tabular bg-white border rounded-lg outline-none transition-shadow focus:ring-2 focus:ring-[#6B21A8]/20'
const labelCls = 'flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] font-semibold text-stone-400 mb-1'

function Field({ label, hint, auto, children }) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {auto && <Zap className="w-2.5 h-2.5" style={{ color: BRAND }} />}
        {hint && <span className="text-stone-300 normal-case tracking-normal font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function NumInput({ value, onChange, prefix, placeholder = '' }) {
  return (
    <div className="flex items-stretch h-9 rounded-lg border bg-white overflow-hidden focus-within:ring-2 focus-within:ring-[#6B21A8]/20" style={{ borderColor: BORDER }}>
      {prefix && <span className="flex items-center justify-center w-8 shrink-0 bg-gray-50 border-r text-stone-400 text-sm select-none" style={{ borderColor: BORDER }}>{prefix}</span>}
      <input
        type="text" inputMode="decimal" value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 px-3 text-sm num-tabular bg-transparent outline-none"
      />
    </div>
  )
}

export default function DailyUpdateModal({ open, onClose, userId }) {
  const queryClient = useQueryClient()
  const du = useDailyUpdates()
  // includeLive:true — this modal is exec-only, so the snapshot can use the LIVE
  // Stripe MRR/customers (same as the Odyssey Executive hero) rather than the
  // stored atlas_targets figure. The captured number is saved for investors to read.
  const stats = useExecutiveStats({ includeLive: true })

  // Live integrations (exec-side only). Used to pre-fill TODAY's empty fields.
  const meta = useMetaAds('today')
  const metaSpendToday = meta?.summary?.totalSpend ?? null
  const ody = useOdysseyMetrics()
  const scCallsHeld = ody?.today?.callsHeldToday ?? null
  const scDealsClosed = ody?.today?.customersClosedToday ?? null
  const scAdSpend = ody?.today?.adSpendToday ?? null         // scorecard fallback for Meta
  const scDemosBooked = ody?.today?.demosBookedToday ?? null // scorecard "demos booked" → Calls Booked

  const [date, setDate] = useState(todayStr())
  // Stripe daily cash for the SELECTED date (works for any day, not just today).
  const stripeDay = useStripeDailyCash(date, { enabled: open })
  const stripeCash = stripeDay.cash
  // Server-computed source values for the SELECTED date (any date) — Cal calls,
  // scorecard calls/deals/customers/ad-spend, snapshot. Shared with the cron.
  const preview = useDailyUpdatePreview(date, { enabled: open })
  const pv = preview.computed
  const [form, setForm] = useState(() => formFromDay(null))
  const [targets, setTargets] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false) // persistent until the next change
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncErr, setSyncErr] = useState(null)
  const [syncTick, setSyncTick] = useState(0)
  const [showPreview, setShowPreview] = useState(false)

  // Load saved values for the selected date (and on date change). Keyed on
  // [open, date, du.loading] so a post-save background refetch never clobbers edits.
  useEffect(() => {
    if (!open || du.loading) return
    setForm(formFromDay(du.getDay(date)))
    const wk = du.getWeeklyTargets(date)
    const t = {}
    for (const k of WEEKLY_TARGET_KEYS) t[k] = wk[k] != null ? String(wk[k]) : ''
    setTargets(t)
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date, du.loading])

  const isToday = date === todayStr()

  // Apply the integration sources to the form. overwrite=false fills only blank
  // fields (used as values arrive, never clobbering saved/typed values);
  // overwrite=true replaces the integration fields with fresh values (used by
  // "Sync now"). Manual-only fields — cold outreach, wire/ACH, the narrative, and
  // the weekly targets — are never touched here.
  const applySources = (overwrite) => {
    const p = pv || {}
    setForm((f) => {
      const n = { ...f }
      const set = (k, v) => {
        if (v == null) return
        if (overwrite || (n[k] ?? '') === '') n[k] = String(Math.round(Number(v)))
      }
      // Today prefers live client sources; preview backs every date (incl. past).
      set('ad_spend', (isToday ? (metaSpendToday ?? scAdSpend) : null) ?? p.ad_spend)
      set('calls_booked', (isToday ? scDemosBooked : null) ?? p.calls_booked) // scorecard demos booked
      set('calls_held', (isToday ? scCallsHeld : null) ?? p.calls_held)
      set('deals_closed', (isToday ? scDealsClosed : null) ?? p.deals_closed)
      set('new_customers', (isToday ? scDealsClosed : null) ?? p.new_customers)
      set('mrr_added', p.mrr_added)                    // Stripe: gross new MRR that day
      set('cash_stripe', stripeCash ?? p.cash_stripe)  // Stripe: live cash, any date
      // Snapshot: live Stripe for today (matches the exec hero); stored for past days.
      set('total_mrr', (isToday ? stats.mrr?.value : null) ?? p.total_mrr)
      set('total_customers', (isToday ? stats.customers?.value : null) ?? p.total_customers)
      return n
    })
  }

  // Top up EMPTY fields as sources arrive. du.loading is in the deps so this
  // re-applies right after the load effect re-sets the form, otherwise fast
  // sources would get blanked by that load and never re-applied.
  useEffect(() => {
    if (!open) return
    applySources(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date, du.loading, isToday, pv, stripeCash, metaSpendToday, scCallsHeld, scDealsClosed, scAdSpend, scDemosBooked, stats.mrr?.value, stats.customers?.value])

  // After "Sync now" finishes refetching, overwrite the integration fields with
  // the freshly-synced values.
  useEffect(() => {
    if (!open || syncTick === 0) return
    applySources(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncTick])

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

  const cashStripe = parseNum(form.cash_stripe)
  const cashWire = parseNum(form.cash_wire_ach)
  const cashTotal = (cashStripe || 0) + (cashWire || 0)
  const hasCash = cashStripe != null || cashWire != null

  const parsedDay = () => ({ ...buildFields(form), update_date: date, updated_at: new Date().toISOString() })
  const parsedTargets = () => {
    const t = {}
    for (const k of WEEKLY_TARGET_KEYS) t[k] = parseNum(targets[k])
    return t
  }

  // WTD reflecting the on-screen today (saved rows for the rest of the week).
  const currentWtd = () => {
    const monday = mondayOf(date)
    const others = du.days.filter((r) => r.update_date >= monday && r.update_date <= date && r.update_date !== date)
    const today = parsedDay()
    const out = {}
    for (const m of PACE_METRICS) {
      let sum = null
      for (const r of others) if (r[m.key] != null) sum = (sum || 0) + Number(r[m.key])
      if (today[m.key] != null) sum = (sum || 0) + Number(today[m.key])
      out[m.key] = sum
    }
    return out
  }

  // Sync now: refresh Cal + Meta from source, then refetch every source the form
  // reads (which re-pulls Stripe LIVE — cash + new MRR — so no slow stripe-sync is
  // needed here). When done, syncTick overwrites the integration fields with the
  // fresh numbers. Mirrors Nick's Growth-view sync (public sync functions, no auth).
  const FN_BASE = 'https://ckobnzvgjeaxxgvmexaz.supabase.co/functions/v1'
  const handleSync = async () => {
    if (syncing) return
    setSyncing(true); setSyncErr(null); setSaved(false)
    try {
      await Promise.allSettled([
        fetch(`${FN_BASE}/meta-sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }),
      ])
      await Promise.allSettled([
        queryClient.refetchQueries({ queryKey: ['meta-ads'] }),
        queryClient.refetchQueries({ queryKey: ['odyssey-metrics'] }),
        queryClient.refetchQueries({ queryKey: ['revenue-breakdown'] }),
        queryClient.refetchQueries({ queryKey: ['stripe-daily-cash', date] }),
        queryClient.refetchQueries({ queryKey: ['daily-update-preview', date] }),
      ])
      setSyncTick((t) => t + 1)
    } catch (e) {
      console.error('Daily update sync failed:', e)
      setSyncErr('Sync failed — check your connection and try again.')
    } finally {
      setSyncing(false)
    }
  }

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      await du.save(date, buildFields(form), userId)
      const monday = mondayOf(date)
      await Promise.all(WEEKLY_TARGET_KEYS.map((k) => du.saveWeeklyTarget(monday, k, parseNum(targets[k]), userId)))
      setSaved(true) // stays until the next edit / sync / date change
    } catch (e) {
      console.error('DailyUpdate save:', e)
      setError(e.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async () => {
    const post = buildSlackPost(parsedDay(), currentWtd(), parsedTargets())
    try { await navigator.clipboard.writeText(post); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { window.prompt('Copy the Slack update:', post) }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 8, 37, 0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
        role="dialog" aria-modal="true" aria-labelledby="daily-update-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-8 pt-6 pb-4 border-b" style={{ borderColor: DIVIDER }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mono-text text-[10px] uppercase tracking-[0.18em] font-semibold mb-2" style={{ color: BRAND }}>
              <CalendarDays className="w-3 h-3" /> Daily Update
            </div>
            <h2 id="daily-update-title" className="display-text text-2xl md:text-3xl font-medium leading-tight text-stone-900">
              Enter today’s numbers
            </h2>
            <p className="text-[13px] text-stone-500 mt-2 leading-relaxed">
              Fields marked <Zap className="inline w-3 h-3" style={{ color: BRAND }} /> auto-fill from live sources (Meta, Cal.com, scorecards for today; Stripe cash for any day) — adjust any of them. Blank = N/A.
            </p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-stone-400 hover:text-stone-700 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-8 pt-5 pb-6 flex-1 space-y-6">
          {showPreview ? (
            <PreviewPanel date={date} day={parsedDay()} wtd={currentWtd()} targets={parsedTargets()} />
          ) : (
          <>
          {/* Date */}
          <Field label="Report date" hint={`· ${formatReportDate(date)}`}>
            <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className={inputCls} style={{ borderColor: BORDER }} />
          </Field>
          {!isToday && (
            <div className="text-[12px] text-amber-700 flex items-center gap-1.5 -mt-3">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> Auto-fill only applies to today — enter past days manually.
            </div>
          )}

          {/* Pace metrics (cash handled separately below) */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-stone-400 mb-3">Today’s metrics</div>
            <div className="grid grid-cols-2 gap-3">
              {PACE_INPUT_METRICS.map((m) => (
                <Field key={m.key} label={m.label} auto={isToday && !!AUTO_SOURCE[m.key]} hint={AUTO_SOURCE[m.key] ? ` ${AUTO_SOURCE[m.key]}` : undefined}>
                  <NumInput value={form[m.key] ?? ''} onChange={setF(m.key)} prefix={m.unit === 'usd' ? '$' : null} placeholder="N/A" />
                </Field>
              ))}
            </div>
          </div>

          {/* Cash collected — Stripe + Wire/ACH → total */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-stone-400 mb-3">Cash collected</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stripe" auto hint={stripeDay.loading ? ' loading…' : ' Stripe'}><NumInput value={form.cash_stripe ?? ''} onChange={setF('cash_stripe')} prefix="$" placeholder="0" /></Field>
              <Field label="Wire / ACH"><NumInput value={form.cash_wire_ach ?? ''} onChange={setF('cash_wire_ach')} prefix="$" placeholder="0" /></Field>
            </div>
            <div className="mt-2 text-[12px] font-mono flex items-center gap-3 flex-wrap" style={{ color: 'var(--text-3, #56506A)' }}>
              <span>Total cash collected: <span className="font-semibold" style={{ color: BRAND }}>{hasCash ? fmtCurrency(cashTotal) : 'N/A'}</span></span>
              {stripeDay.refunds != null && stripeDay.refunds > 0 && (
                <span className="text-stone-400">· Stripe refunds today {fmtCurrency(stripeDay.refunds)} (tracked separately)</span>
              )}
            </div>
          </div>

          {/* Snapshot */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-stone-400 mb-3">Snapshot <span className="text-stone-300 normal-case tracking-normal font-normal">· prefilled from aggregate</span></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total MRR" auto={isToday}><NumInput value={form.total_mrr ?? ''} onChange={setF('total_mrr')} prefix="$" /></Field>
              <Field label="Total Customers" auto={isToday}><NumInput value={form.total_customers ?? ''} onChange={setF('total_customers')} /></Field>
            </div>
          </div>

          {/* Weekly targets */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-stone-400 mb-3">Weekly targets <span className="text-stone-300 normal-case tracking-normal font-normal">· week of {formatReportDate(mondayOf(date))}</span></div>
            <div className="grid grid-cols-2 gap-3">
              {PACE_METRICS.map((m) => (
                <Field key={m.key} label={m.label}>
                  <NumInput value={targets[m.key] ?? ''} onChange={setT(m.key)} prefix={m.unit === 'usd' ? '$' : null} placeholder="N/A" />
                </Field>
              ))}
              {DERIVED_METRICS.map((d) => (
                <Field key={d.key} label={`${d.label} target`} hint="%">
                  <NumInput value={targets[d.key] ?? ''} onChange={setT(d.key)} placeholder="N/A" />
                </Field>
              ))}
            </div>
          </div>

          {/* Qualitative */}
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-widest font-semibold text-stone-400">Narrative</div>
            <Field label="#1 Focus (this week)"><input value={form.focus ?? ''} onChange={(e) => setF('focus')(e.target.value)} className={inputCls} style={{ borderColor: BORDER }} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Focus metric"><input value={form.focus_metric ?? ''} onChange={(e) => setF('focus_metric')(e.target.value)} className={inputCls} style={{ borderColor: BORDER }} /></Field>
              <Field label="Plan to improve" hint="· required"><input value={form.plan_to_improve ?? ''} onChange={(e) => setF('plan_to_improve')(e.target.value)} className={inputCls} style={{ borderColor: BORDER }} /></Field>
            </div>
            <Field label="Key learning"><input value={form.key_learning ?? ''} onChange={(e) => setF('key_learning')(e.target.value)} className={inputCls} style={{ borderColor: BORDER }} /></Field>
            <Field label="Blocker"><input value={form.blocker ?? ''} onChange={(e) => setF('blocker')(e.target.value)} className={inputCls} style={{ borderColor: BORDER }} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plan URL"><input value={form.plan_url ?? ''} onChange={(e) => setF('plan_url')(e.target.value)} placeholder="https://…" className={inputCls} style={{ borderColor: BORDER }} /></Field>
              <Field label="Scorecard URL"><input value={form.scorecard_url ?? ''} onChange={(e) => setF('scorecard_url')(e.target.value)} placeholder="https://…" className={inputCls} style={{ borderColor: BORDER }} /></Field>
            </div>
          </div>
          </>
          )}

          {(error || syncErr) && (
            <div className="text-[12px] text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error || syncErr}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-8 py-4 border-t" style={{ borderColor: DIVIDER }}>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              title="Refresh Cal.com + Meta, and re-pull live Stripe — so today's numbers are current before you save"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border text-[13px] font-semibold disabled:opacity-60 transition-colors"
              style={{ borderColor: 'rgba(102,57,166,0.3)', color: BRAND, background: 'rgba(102,57,166,0.06)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button onClick={handleCopy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border text-[13px] font-semibold text-stone-700 hover:bg-gray-50 transition-colors" style={{ borderColor: BORDER }}>
              {copied ? <ClipboardCheck className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy as Slack update'}
            </button>
            <button
              onClick={() => setShowPreview((p) => !p)}
              title="See exactly what investors see on their Daily tab"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border text-[13px] font-semibold transition-colors"
              style={showPreview
                ? { borderColor: BRAND, color: '#fff', background: BRAND }
                : { borderColor: BORDER, color: '#44403c' }}
            >
              <Eye className="w-3.5 h-3.5" /> {showPreview ? 'Back to edit' : 'Investor preview'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving || saved} className="inline-flex items-center gap-1.5 h-9 px-5 rounded-lg text-white text-[13px] font-semibold disabled:opacity-90 transition-all" style={{ background: saved ? '#15803D' : BTN }}>
              {saved ? <ClipboardCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

// Read-only preview of exactly what investors see on their Daily tab. Every number
// is computed with the SAME shared helpers as the investor view, so the figures and
// structure match; only the chrome uses this modal's design system (to avoid the
// investor prototype's global CSS leaking into the app).
function PreviewLine({ label, value, accent }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-0.5" style={{ color: accent ? BRAND : '#a8a29e' }}>{label}</div>
      <div className="text-[13px] text-stone-800 leading-relaxed">{value}</div>
    </div>
  )
}

function PreviewPanel({ date, day, wtd, targets }) {
  const expPct = expectedPct(date)
  const wi = workdayIndex(date)
  const cell = 'px-3 py-2 text-right mono-text num-tabular text-[13px] whitespace-nowrap'
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border p-4" style={{ borderColor: BORDER, background: '#FAF8FC' }}>
        <div className="mono-text text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: BRAND }}>
          Investor preview · what they see
        </div>
        <div className="display-text text-2xl text-stone-900 mt-1">{formatReportDate(date)}</div>
        {day.focus && (
          <div className="text-[13px] text-stone-700 mt-1"><span className="font-semibold" style={{ color: BRAND }}>#1 Focus:</span> {day.focus}</div>
        )}
        <div className="text-[11px] mono-text text-stone-400 mt-1">Pace vs. weekly target — Day {wi} of 5 ({expPct}% expected)</div>
      </div>

      {/* Pace table */}
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: BORDER }}>
        <table className="w-full text-left" style={{ minWidth: '520px' }}>
          <thead>
            <tr className="mono-text text-[10px] uppercase tracking-wider text-stone-400">
              <th className="px-3 py-2">Metric</th>
              <th className="px-3 py-2 text-right">Today</th>
              <th className="px-3 py-2 text-right">WTD</th>
              <th className="px-3 py-2 text-right">Target</th>
              <th className="px-3 py-2 text-right">vs Pace</th>
            </tr>
          </thead>
          <tbody>
            {PACE_METRICS.map((m) => {
              const target = targets[m.key] ?? null
              const pp = vsPacePP(wtd[m.key], target, expPct)
              const hex = paceHex(pp)
              return (
                <tr key={m.key} className="border-t" style={{ borderColor: DIVIDER }}>
                  <td className="px-3 py-2 text-sm text-stone-700">{m.label}</td>
                  <td className={cell} style={{ color: '#57534e' }}>{day[m.key] == null ? 'N/A' : fmtValue(m.unit, day[m.key])}</td>
                  <td className={cell} style={{ color: '#1c1917' }}>{wtd[m.key] == null ? 'N/A' : fmtValue(m.unit, wtd[m.key])}</td>
                  <td className={cell} style={{ color: '#78716c' }}>{target == null ? 'N/A' : fmtValue(m.unit, target)}</td>
                  <td className={cell} style={{ color: hex || '#a8a29e' }}>{pp == null ? '—' : `${fmtPacePP(pp)} ${paceEmoji(pp)}`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Snapshot + derived */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-3" style={{ borderColor: BORDER }}>
          <div className="text-[10px] uppercase tracking-wider text-stone-400">Total MRR</div>
          <div className="display-text text-2xl text-stone-900">{fmtCurrency(day.total_mrr) ?? 'N/A'}</div>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: BORDER }}>
          <div className="text-[10px] uppercase tracking-wider text-stone-400">Total Customers</div>
          <div className="display-text text-2xl text-stone-900">{fmtCount(day.total_customers) ?? 'N/A'}</div>
        </div>
        {DERIVED_METRICS.map((d) => {
          const r = derivedRatio(wtd[d.numKey], wtd[d.denKey])
          const target = targets[d.key] ?? null
          const hex = r ? derivedHex(r.pct, target) : null
          return (
            <div key={d.key} className="rounded-xl border p-3" style={{ borderColor: BORDER }}>
              <div className="text-[10px] uppercase tracking-wider text-stone-400">{d.label} · WTD</div>
              <div className="display-text text-2xl" style={{ color: hex || (r ? '#1c1917' : '#a8a29e') }}>{r ? `${r.pct}%` : 'N/A'}</div>
              {r && (
                <div className="text-[11px] mono-text text-stone-400 mt-0.5">
                  {r.num}/{r.den}{target != null ? ` · target ${Math.round(target)}% ${derivedEmoji(r.pct, target)}` : ''}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Narrative */}
      {(day.focus_metric || day.plan_to_improve || day.key_learning || day.blocker || day.plan_url || day.scorecard_url) && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: BORDER }}>
          <PreviewLine label="Focus metric" value={day.focus_metric} />
          <PreviewLine label="Plan to improve" value={day.plan_to_improve} accent />
          <PreviewLine label="Key learning" value={day.key_learning} />
          <PreviewLine label="Blocker" value={day.blocker} />
          {(day.plan_url || day.scorecard_url) && (
            <div className="flex gap-4 pt-1 text-[12px] font-semibold" style={{ color: BRAND }}>
              {day.plan_url && <span>Plan ↗</span>}
              {day.scorecard_url && <span>Scorecard ↗</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
