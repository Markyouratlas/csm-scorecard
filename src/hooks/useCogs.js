import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// =============================================================================
//  useCogs({ mrr, canEdit, userId })
//
//  Backs the Odyssey Gross Margin tile. Reads the editable COGS inputs
//  (cogs_line_items + cogs_config, see src/24-cogs-line-items.sql) and computes
//  both gross-margin views against the MRR single-source-of-truth passed in
//  (mrrStat.value from OdysseyView — manual total-mrr override, else live Stripe).
//
//  Infra subtotal is the sum of the 7 vendor line items ONCE all are entered;
//  until then it falls back to config.interim_infra_total ($16,498) and, once
//  fully entered, exposes the variance vs that interim figure.
//
//  Write-back: whenever an executive is viewing and the headline margin changes,
//  it upserts atlas_targets['gross-margin'] (source 'finance') so the Investor
//  gauge + the other Odyssey tiles reflect it with no extra wiring. RLS restricts
//  both the cogs tables and this write to executive tier.
// =============================================================================

const COGS_KEY = ['cogs']

function currentMonthDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export function useCogs({ mrr = null, canEdit = false, userId = null } = {}) {
  const queryClient = useQueryClient()

  const { data, isPending, error, refetch } = useQuery({
    queryKey: COGS_KEY,
    queryFn: async () => {
      const [itemsRes, configRes] = await Promise.all([
        supabase.from('cogs_line_items').select('*').eq('active', true).order('sort_order', { ascending: true }),
        supabase.from('cogs_config').select('*').limit(1).maybeSingle(),
      ])
      // RLS blocks non-executives — treat that as "no data" rather than throwing.
      if (itemsRes.error) { console.warn('useCogs: cogs_line_items unavailable —', itemsRes.error.message); return { items: [], config: null } }
      return { items: itemsRes.data || [], config: configRes.data || null }
    },
  })

  const items = data?.items || []
  const config = data?.config || null
  const invalidate = () => queryClient.invalidateQueries({ queryKey: COGS_KEY })

  const computed = useMemo(() => {
    const num = (v) => (v == null || v === '' ? null : Number(v))
    const infraItems = items.filter(i => i.category === 'infra')
    const laborItems = items.filter(i => i.category === 'labor')

    const infraEntered = infraItems.filter(i => num(i.monthly_amount) != null)
    const allInfraEntered = infraItems.length > 0 && infraEntered.length === infraItems.length
    const infraEnteredSum = infraEntered.reduce((s, i) => s + Number(i.monthly_amount), 0)
    const interimInfraTotal = num(config?.interim_infra_total) ?? 16498
    const infraSubtotal = allInfraEntered ? infraEnteredSum : interimInfraTotal
    const infraVariance = allInfraEntered ? infraEnteredSum - interimInfraTotal : null

    const laborSubtotal = laborItems.reduce((s, i) => s + (num(i.monthly_amount) || 0), 0)

    const totalCogsInfra = infraSubtotal
    const totalCogsLoaded = infraSubtotal + laborSubtotal

    const hasMrr = mrr != null && Number(mrr) > 0
    const marginInfra = hasMrr ? ((mrr - totalCogsInfra) / mrr) * 100 : null
    const marginLoaded = hasMrr ? ((mrr - totalCogsLoaded) / mrr) * 100 : null
    const grossProfitInfra = mrr != null ? mrr - totalCogsInfra : null
    const grossProfitLoaded = mrr != null ? mrr - totalCogsLoaded : null

    const headlineView = config?.headline_view === 'loaded' ? 'loaded' : 'infra'
    const headlineMargin = headlineView === 'loaded' ? marginLoaded : marginInfra
    const headlineProfit = headlineView === 'loaded' ? grossProfitLoaded : grossProfitInfra
    const headlineCogs = headlineView === 'loaded' ? totalCogsLoaded : totalCogsInfra

    return {
      infraItems, laborItems,
      allInfraEntered, infraEnteredSum, interimInfraTotal, infraSubtotal, infraVariance,
      laborSubtotal, totalCogsInfra, totalCogsLoaded,
      marginInfra, marginLoaded, grossProfitInfra, grossProfitLoaded,
      headlineView, headlineMargin, headlineProfit, headlineCogs,
    }
  }, [items, config, mrr])

  // ---- Mutations (executive-only; RLS also enforces) ----
  const saveItem = useCallback(async (id, patch) => {
    const { error: e } = await supabase.from('cogs_line_items')
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: userId })
      .eq('id', id)
    if (e) throw e
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const addItem = useCallback(async (category, fields = {}) => {
    const siblings = items.filter(i => i.category === category)
    const nextSort = siblings.reduce((m, i) => Math.max(m, i.sort_order || 0), 0) + 1
    const { error: e } = await supabase.from('cogs_line_items')
      .insert({ category, name: fields.name || 'New line item', sort_order: nextSort, updated_by: userId, ...fields })
    if (e) throw e
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, userId])

  const removeItem = useCallback(async (id) => {
    const { error: e } = await supabase.from('cogs_line_items').delete().eq('id', id)
    if (e) throw e
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveConfig = useCallback(async (patch) => {
    const { error: e } = await supabase.from('cogs_config')
      .upsert({ id: true, ...patch, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: 'id' })
    if (e) throw e
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // ---- Write-back the headline margin to atlas_targets['gross-margin'] ----
  // Keeps the Investor gauge + Odyssey tiles in sync with the live computation.
  // Fires only for executives (canEdit) and only when the rounded value changes,
  // so it can't loop and non-execs never attempt a (RLS-blocked) write.
  const monthDate = currentMonthDate()
  const lastWritten = useRef(null)
  useEffect(() => {
    if (!canEdit) return
    const m = computed.headlineMargin
    if (m == null || !Number.isFinite(m)) return
    const rounded = Math.round(m * 10) / 10
    if (lastWritten.current === rounded) return
    lastWritten.current = rounded
    ;(async () => {
      const { error: e } = await supabase.from('atlas_targets').upsert({
        metric_key: 'gross-margin',
        month_key: monthDate,
        actual_value: rounded,
        actual_source: 'finance',
        updated_at: new Date().toISOString(),
        ...(userId ? { updated_by: userId } : {}),
      }, { onConflict: 'metric_key,month_key' })
      if (e) { lastWritten.current = null; console.warn('useCogs: gross-margin write-back failed —', e.message) }
    })()
  }, [canEdit, computed.headlineMargin, userId, monthDate])

  return {
    loading: isPending,
    error: error ?? null,
    config,
    ...computed,
    saveItem, addItem, removeItem, saveConfig,
    refresh: refetch,
  }
}
