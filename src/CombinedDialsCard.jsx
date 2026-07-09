import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Phone } from 'lucide-react'
import { supabase } from './supabase'

// ============================================================================
//  CombinedDialsCard — dials made this week, from BOTH sources:
//    • Scorecard dialer (call_logs, outbound) — shown on top
//    • GoHighLevel (ghl_call_events, outbound) — shown below
//    • Combined total (added together)
//  Daily breakdown (Mon–Sun) + weekly total. RLS scopes both sources to the rep
//  (managers/execs see anyone via ScorecardViewer drill-in).
// ============================================================================

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_MS = 86400000

export default function CombinedDialsCard({ userId, weekKey }) {
  const start = useMemo(() => new Date(`${weekKey}T00:00:00`), [weekKey])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY_MS)
    return { label: DAY_LABELS[i], num: d.getDate() }
  }), [start])

  const { data, isPending } = useQuery({
    queryKey: ['combined-dials', userId, weekKey],
    enabled: !!userId && !!weekKey,
    refetchInterval: 30000,
    queryFn: async () => {
      const startIso = start.toISOString()
      const endIso = new Date(start.getTime() + 7 * DAY_MS).toISOString()
      const bucket = (ts) => Math.floor((new Date(ts).getTime() - start.getTime()) / DAY_MS)
      const app = Array(7).fill(0), ghl = Array(7).fill(0)

      const [logs, ghlRows] = await Promise.all([
        supabase.from('call_logs').select('started_at')
          .eq('rep_id', userId).eq('direction', 'outbound')
          .gte('started_at', startIso).lt('started_at', endIso).limit(2000),
        supabase.from('ghl_call_events').select('called_at')
          .eq('rep_id', userId).eq('direction', 'outbound')
          .gte('called_at', startIso).lt('called_at', endIso).limit(2000),
      ])
      if (logs.error) console.warn('call_logs dials:', logs.error.message)
      if (ghlRows.error) console.warn('ghl dials:', ghlRows.error.message)
      for (const r of logs.data || []) { const b = bucket(r.started_at); if (b >= 0 && b < 7) app[b]++ }
      for (const r of ghlRows.data || []) { const b = bucket(r.called_at); if (b >= 0 && b < 7) ghl[b]++ }
      return { app, ghl }
    },
  })

  const app = data?.app || Array(7).fill(0)
  const ghl = data?.ghl || Array(7).fill(0)
  const combined = app.map((n, i) => n + ghl[i])
  const sum = (a) => a.reduce((s, n) => s + n, 0)

  const cell = 'text-center py-1.5 px-2 num-tabular'
  const th = 'text-center py-1.5 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium'

  return (
    <div className="bg-white border border-stone-200 p-6">
      <div className="flex items-center gap-2 mb-1">
        <Phone className="w-5 h-5 text-stone-700" />
        <div className="display-font text-2xl font-medium text-stone-900">Dials this week</div>
      </div>
      <p className="text-sm text-stone-600 mb-4">
        Calls made in the in-app dialer and in GoHighLevel, combined. Total:
        <span className="font-semibold text-stone-900 num-tabular"> {sum(combined)}</span>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th className="text-left py-1.5 px-2 mono-font text-[10px] uppercase tracking-widest text-stone-500 font-medium">Source</th>
              {days.map((d, i) => <th key={i} className={th}>{d.label}<div className="text-stone-400 font-normal">{d.num}</div></th>)}
              <th className={`${th} text-stone-900`}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-stone-100">
              <td className="py-1.5 px-2 text-stone-700">Scorecard dialer</td>
              {app.map((n, i) => <td key={i} className={`${cell} ${n ? 'text-stone-800' : 'text-stone-300'}`}>{n}</td>)}
              <td className={`${cell} font-semibold text-stone-900`}>{sum(app)}</td>
            </tr>
            <tr className="border-b border-stone-100">
              <td className="py-1.5 px-2 text-stone-700">GoHighLevel</td>
              {ghl.map((n, i) => <td key={i} className={`${cell} ${n ? 'text-stone-800' : 'text-stone-300'}`}>{n}</td>)}
              <td className={`${cell} font-semibold text-stone-900`}>{sum(ghl)}</td>
            </tr>
            <tr className="bg-stone-50">
              <td className="py-1.5 px-2 font-semibold text-stone-900">Total</td>
              {combined.map((n, i) => <td key={i} className={`${cell} font-semibold ${n ? 'text-stone-900' : 'text-stone-300'}`}>{n}</td>)}
              <td className={`${cell} font-bold text-stone-900`}>{sum(combined)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {isPending && <div className="text-[11px] text-stone-400 mt-2">Loading…</div>}
    </div>
  )
}
