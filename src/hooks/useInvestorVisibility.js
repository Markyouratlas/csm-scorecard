import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase.js'

// =============================================================================
//  useInvestorVisibility
//
//  Reads/writes the single-row investor_visibility config. A key present & true
//  = visible to investors; absent/false = hidden (FAIL-CLOSED). Executives write
//  via the Access view; investors only read (RLS). Optimistic local updates so
//  the checkbox toggles feel instant.
// =============================================================================

const KEY = ['investor-visibility']

export function useInvestorVisibility() {
  const qc = useQueryClient()
  const { data, isPending, error } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investor_visibility').select('visible').eq('id', 1).maybeSingle()
      if (error) {
        console.warn('useInvestorVisibility: unavailable (migration not run?) —', error.message)
        return {}
      }
      return data?.visible && typeof data.visible === 'object' ? data.visible : {}
    },
  })

  const visible = data || {}
  const isVisible = useCallback((key) => !!visible[key], [visible])

  const setVisible = useCallback(async (key, val) => {
    const next = { ...visible, [key]: !!val }
    qc.setQueryData(KEY, next) // optimistic
    const { error } = await supabase
      .from('investor_visibility')
      .upsert({ id: 1, visible: next, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) { console.error('setVisible failed:', error.message); qc.invalidateQueries({ queryKey: KEY }) }
  }, [visible, qc])

  const toggle = useCallback((key) => setVisible(key, !visible[key]), [visible, setVisible])

  return { loading: isPending, error: error || null, visible, isVisible, toggle, setVisible }
}
