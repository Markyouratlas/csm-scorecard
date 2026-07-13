import React from 'react'
import BreakdownModal from './BreakdownModal.jsx'
import { useDailyFunnelByRep } from './hooks/useDailyFunnelByRep.js'

// Per-rep breakdown for the Sales funnel tiles (Demos Booked, Demos Completed,
// Show-Up %, Close %, Closes). Shared by OdysseyView + LeadershipDashboardView;
// reuses BreakdownModal via useDailyFunnelByRep. `metric` selects the column.
export default function FunnelBreakdownModal({ weekKey, metric, onClose }) {
  const { rows, loading } = useDailyFunnelByRep(weekKey)
  const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—')
  const held = (r) => (r.demosCompleted || 0) - (r.demosUnqualified || 0)
  const cfg = {
    booked:        { title: 'Demos Booked · This Week',    subtitle: 'Booked by AE',                                pick: r => r.demosBooked,    sub: () => undefined },
    completed:     { title: 'Demos Completed · This Week', subtitle: 'Attended demos by AE',                        pick: r => r.demosCompleted, sub: r => `of ${r.demosBooked} booked` },
    closes:        { title: 'Closes · This Week',          subtitle: 'Closed Won by AE (bucketed by close week)',   pick: r => r.trialSignups,   sub: r => `of ${held(r)} closeable held` },
    showup:        { title: 'Show-Up Rate · This Week',    subtitle: 'Completed ÷ booked, by AE',                   pick: r => r.demosCompleted, sub: r => `${pct(r.demosCompleted, r.demosBooked)} · ${r.demosBooked} booked` },
    'close-rate':  { title: 'Close Rate · This Week',      subtitle: 'Closes ÷ closeable held, by AE',              pick: r => r.trialSignups,   sub: r => `${pct(r.trialSignups, held(r))} · ${held(r)} held` },
  }[metric] || { title: 'Breakdown', subtitle: '', pick: () => 0, sub: () => undefined }
  const mapped = rows
    .map(r => ({ name: r.name, count: cfg.pick(r), subLabel: cfg.sub(r) }))
    .sort((a, b) => b.count - a.count)
  const total = mapped.reduce((s, r) => s + r.count, 0)
  return <BreakdownModal title={cfg.title} subtitle={cfg.subtitle} rows={mapped} total={total} loading={loading} onClose={onClose} />
}
