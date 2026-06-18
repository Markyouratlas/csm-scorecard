import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CAL_API_BASE = 'https://api.cal.com/v2'
const CAL_API_VERSION = '2026-05-01'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

async function runSync(apiKey: string) {
  // Declared above the try so the catch block can still save progress on error.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  let cursor: string | null = null

  try {
    // Resume pagination from the saved cursor (single state row, id=1).
    const { data: stateRow } = await supabase
      .from('cal_sync_state')
      .select('*')
      .eq('id', 1)
      .single()
    cursor = stateRow?.cursor || null
    let pagesDone = stateRow?.pages_done || 0

    // Wall-clock budget: stop safely before the 150s platform kill so the
    // cursor we've saved per-page survives and the next run resumes.
    const startedAt = Date.now()
    const BUDGET_MS = 120000 // 120s, leaving margin under the 150s limit
    let pagesThisRun = 0

    while (true) {
      // Out of time — the last per-page cursor save already persisted progress.
      if (Date.now() - startedAt > BUDGET_MS) break

      const url = `${CAL_API_BASE}/bookings?take=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '')
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'cal-api-version': CAL_API_VERSION,
        },
      })

      // Read as text first so a non-JSON error page (rate limit, 5xx, "A server
      // error occurred") doesn't crash JSON.parse. If the response isn't OK or
      // isn't JSON, stop gracefully — the cursor from the previous page is already
      // saved, so the next run resumes from here.
      const bodyText = await res.text()
      if (!res.ok) {
        console.warn(`cal-sync: stopping early, Cal.com returned HTTP ${res.status}: ${bodyText.slice(0, 200)}`)
        break
      }
      let json: any
      try {
        json = JSON.parse(bodyText)
      } catch (_) {
        console.warn(`cal-sync: stopping early, non-JSON response: ${bodyText.slice(0, 200)}`)
        break
      }
      if (json.status && json.status !== 'success') {
        throw new Error(`Cal.com API: ${JSON.stringify(json.error || json)}`)
      }

      const data = json.data || []
      // Completion stamp for the rows in THIS page.
      const syncedAt = new Date().toISOString()
      const rows: any[] = data.map((b: any) => ({
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
        synced_at: syncedAt,
      }))

      // Upsert this page immediately so a later timeout doesn't lose it.
      if (rows.length > 0) {
        const { error } = await supabase
          .from('cal_bookings')
          .upsert(rows, { onConflict: 'uid' })
        if (error) throw error
      }

      pagesDone++
      pagesThisRun++

      const nextCursor = json.pagination?.nextCursor || null
      const hasMore = json.pagination?.hasMore

      // Save progress after EACH page.
      if (!hasMore || !nextCursor) {
        // Reached the end — seed pass complete. Reset so the next run starts
        // fresh from newest, catching new/changed bookings.
        await supabase
          .from('cal_sync_state')
          .update({ cursor: null, pages_done: 0, seed_complete: true, last_run_at: new Date().toISOString() })
          .eq('id', 1)
        cursor = null
        break
      } else {
        cursor = nextCursor
        await supabase
          .from('cal_sync_state')
          .update({ cursor: cursor, pages_done: pagesDone, last_run_at: new Date().toISOString() })
          .eq('id', 1)
      }

      // Hard safety cap — never run away.
      if (pagesDone > 500) break

      // Gentle pacing to stay well under Cal.com's 120 req/min rate limit.
      await new Promise(r => setTimeout(r, 250))
    }

    const result = { ok: true, pagesThisRun, cursorRemaining: cursor, seedComplete: (cursor === null) }
    console.log(JSON.stringify(result))
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('cal-sync error:', message)
    // Best-effort: save the current cursor so a mid-run error keeps progress.
    // Wrapped so a save failure can't mask the original error.
    try {
      await supabase
        .from('cal_sync_state')
        .update({ cursor: cursor, last_run_at: new Date().toISOString() })
        .eq('id', 1)
    } catch (_) {
      // ignore — don't overwrite the real error
    }
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
