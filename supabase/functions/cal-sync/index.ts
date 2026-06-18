import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CAL_API_BASE = 'https://api.cal.com/v2'
const CAL_API_VERSION = '2026-05-01'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

async function runSync(apiKey: string) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Fetch all bookings (cursor-based pagination, omit status to get ALL).
    const bookings = []
    let cursor: string | null = null
    let pages = 0
    while (pages < 100) {
      const url = `${CAL_API_BASE}/bookings?take=100` + (cursor ? `&cursor=${cursor}` : '')
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'cal-api-version': CAL_API_VERSION,
        },
      })
      const json = await res.json()
      if (json.status && json.status !== 'success') {
        throw new Error(`Cal.com API: ${JSON.stringify(json.error || json)}`)
      }

      const data = json.data || []
      for (const b of data) bookings.push(b)

      cursor = json.pagination?.nextCursor || null
      pages++
      if (!json.pagination?.hasMore || !cursor) break
    }

    // 2. Map each booking to a cal_bookings row. Guard all nested fields.
    const rows: any[] = bookings.map((b: any) => ({
      uid: b.uid,
      cal_id: b.id ?? null,
      title: b.title ?? null,
      status: b.status ?? null,
      start_time: b.start ?? null,
      end_time: b.end ?? null,
      duration_min: b.duration ?? null,
      created_at_cal: b.createdAt ?? null,
      updated_at_cal: b.updatedAt ?? null,
      event_type_id: b.eventTypeId ?? null,
      event_type_slug: b.eventType?.slug ?? null,
      host_name: b.hosts?.[0]?.name ?? null,
      host_email: b.hosts?.[0]?.email ?? null,
      attendee_name: b.attendees?.[0]?.name ?? null,
      attendee_email: b.attendees?.[0]?.email ?? null,
      attendees: b.attendees ?? null,
      guests: b.guests ?? null,
      cancellation_reason: b.cancellationReason ?? null,
      cancelled_by_email: b.cancelledByEmail ?? null,
      rescheduled_from_uid: b.rescheduledFromUid ?? null,
      rescheduled_to_uid: b.rescheduledToUid ?? null,
      raw: b,
    }))

    // Stamp completion time so "last synced" reflects when data actually landed.
    const syncedAt = new Date().toISOString()
    for (const r of rows) r.synced_at = syncedAt

    if (rows.length > 0) {
      const { error } = await supabase
        .from('cal_bookings')
        .upsert(rows, { onConflict: 'uid' })
      if (error) throw error
    }

    const result = { ok: true, bookings: rows.length, pages }
    console.log(JSON.stringify(result))
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('cal-sync error:', message)
    return { ok: false, error: message }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const apiKey = Deno.env.get('CAL_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'CAL_API_KEY not set' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Run the full sync and wait for it to finish, so the result is reliable.
  // (pg_cron callers must use a longer pg_net timeout than the 5s default.)
  const result = await runSync(apiKey)

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
