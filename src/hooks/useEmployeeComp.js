import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// =============================================================================
//  useEmployeeComp
//
//  Per-employee salaries (employee_compensation, see src/25-employee-compensation.sql).
//  EXECUTIVE-ONLY: the table's RLS blocks everyone else, so for non-execs the query
//  returns nothing and every total is 0 — nothing leaks. Salaries are keyed by
//  profile_id and never live on the world-readable `profiles` table.
//
//  Powers the exec-only salary field on the Roster and feeds useCogs:
//    • deliveryMonthlySalaries → gross-margin delivery labor (rows flagged counts_in_cogs)
//    • totalMonthlySalaries    → operating-margin cost base (all rows)
// =============================================================================

const KEY = ['employee-comp']

export function useEmployeeComp() {
  const queryClient = useQueryClient()

  const { data, isPending, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_compensation')
        .select('profile_id, annual_salary, counts_in_cogs, notes, profiles(name)')
      if (error) { console.warn('useEmployeeComp: unavailable (non-exec or migration not run) —', error.message); return [] }
      return data || []
    },
  })

  const rows = data || []
  const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY })

  const derived = useMemo(() => {
    const byProfileId = {}
    const deliveryRows = []           // per-person delivery-labor rows (for the GM modal)
    let totalMonthlySalaries = 0
    let deliveryMonthlySalaries = 0
    for (const r of rows) {
      byProfileId[r.profile_id] = { annual_salary: r.annual_salary, counts_in_cogs: !!r.counts_in_cogs, notes: r.notes }
      const monthly = r.annual_salary != null ? Number(r.annual_salary) / 12 : 0
      totalMonthlySalaries += monthly
      if (r.counts_in_cogs) {
        deliveryMonthlySalaries += monthly
        deliveryRows.push({ profile_id: r.profile_id, name: r.profiles?.name || 'Unknown', monthly })
      }
    }
    deliveryRows.sort((a, b) => b.monthly - a.monthly)
    return { byProfileId, deliveryRows, totalMonthlySalaries, deliveryMonthlySalaries }
  }, [rows])

  // Upsert one employee's comp (executive-only; RLS also enforces).
  const setComp = useCallback(async (profileId, patch, userId = null) => {
    const payload = { profile_id: profileId, updated_at: new Date().toISOString() }
    if (patch.annual_salary !== undefined) payload.annual_salary = patch.annual_salary === '' || patch.annual_salary == null ? null : Number(patch.annual_salary)
    if (patch.counts_in_cogs !== undefined) payload.counts_in_cogs = !!patch.counts_in_cogs
    if (patch.notes !== undefined) payload.notes = patch.notes
    if (userId) payload.updated_by = userId
    const { error: e } = await supabase.from('employee_compensation').upsert(payload, { onConflict: 'profile_id' })
    if (e) throw e
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    loading: isPending,
    error: error ?? null,
    rows,
    ...derived,
    setComp,
    refresh: refetch,
  }
}
