import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase.js'

const MAX_DEPTH = 4

// Stringify a primitive sample value for display, truncated.
function sampleOf(v) {
  if (v === null) return 'null'
  if (typeof v === 'string') {
    const s = v.length > 60 ? v.slice(0, 60) + '…' : v
    return `"${s}"`
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

// Recursively flatten an object into [{ path, type, sample }] rows. Nested objects
// recurse (dotted paths); arrays expand only their first element ([0]) with a length
// note; primitives record JS type + a truncated sample. Depth-capped so a huge `raw`
// jsonb (e.g. Cal's full booking) stays readable.
function flatten(value, path, out, depth) {
  if (depth > MAX_DEPTH) {
    out.push({ path, type: 'json', sample: '… (max depth)' })
    return
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push({ path, type: 'array', sample: '[] (0)' })
      return
    }
    out.push({ path, type: 'array', sample: `[${value.length}]` })
    flatten(value[0], `${path}[0]`, out, depth + 1)
    return
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) {
      out.push({ path, type: 'object', sample: '{}' })
      return
    }
    for (const k of keys) {
      flatten(value[k], path ? `${path}.${k}` : k, out, depth + 1)
    }
    return
  }
  // primitive (incl. null)
  out.push({ path, type: value === null ? 'null' : typeof value, sample: sampleOf(value) })
}

// Fetches the most recent row from `table` (ordered by `order` desc) and flattens it
// into a field list, so the UI can show every data point we actually store. Read-only.
export function useSourceInspect(table, order = 'synced_at', refreshKey = 0) {
  const [state, setState] = useState({ loading: true, error: null, fields: [], empty: false })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order(order, { ascending: false })
        .limit(1)
      if (error) throw error

      const row = (data || [])[0]
      if (!row) {
        setState({ loading: false, error: null, fields: [], empty: true })
        return
      }
      const fields = []
      // Flatten the top-level columns (each column may itself be a jsonb object/array).
      for (const k of Object.keys(row)) {
        flatten(row[k], k, fields, 1)
      }
      setState({ loading: false, error: null, fields, empty: false })
    } catch (e) {
      console.error('useSourceInspect:', e)
      setState({ loading: false, error: e, fields: [], empty: false })
    }
  }, [table, order, refreshKey])

  useEffect(() => { load() }, [load])
  return { ...state, refresh: load }
}
