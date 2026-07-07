import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CAL_API_BASE = 'https://api.cal.com/v2'
const CAL_API_VERSION = '2026-05-01'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // Include the headers supabase-js attaches (x-client-info, apikey) so a browser
  // invoke (the exec "Sync this week" button) isn't blocked by the CORS preflight.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Pull a prospect phone number out of a Cal.com booking, if the event type
// collected one. Cal.com puts it in different places depending on config, so try
// the common paths in order. Tune to the confirmed path once we inspect real
// payloads (see the Phase 0 SQL). Returns null when none looks like a phone.
function extractPhone(b: any): string | null {
  // Anchored: the WHOLE value must look like a phone, so a Zoom URL in `location`
  // (which contains a long digit run) is never mistaken for a number. Confirmed
  // path from real payloads: attendees[0].phoneNumber; the rest are defensive.
  const looksPhone = (v: any) => (typeof v === "string" && /^\+?[0-9][0-9 ()\-]{6,}$/.test(v.trim())) ? v.trim() : null;
  const r = b?.responses || {};
  const respVal = (k: string) => (r[k] && typeof r[k] === "object" ? r[k].value : r[k]);
  return (
    looksPhone(b?.attendees?.[0]?.phoneNumber) ||
    looksPhone(respVal("attendeePhoneNumber")) ||
    looksPhone(respVal("smsReminderNumber")) ||
    looksPhone(respVal("phone")) ||
    looksPhone(b?.location) ||
    null
  );
}

// Map a Cal.com booking to a cal_bookings row. Single source of truth for the
// column shape so every code path stays consistent.
function mapBooking(b: any, syncedAt: string) {
  return {
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
    attendee_phone: extractPhone(b),
    attendees: b.attendees ?? null,
    guests: b.guests ?? null,
    cancellation_reason: b.cancellationReason ?? null,
    cancelled_by_email: b.cancelledByEmail ?? null,
    rescheduled_from_uid: b.rescheduledFromUid ?? null,
    rescheduled_to_uid: b.rescheduledToUid ?? null,
    raw: b,
    synced_at: syncedAt,
  }
}

// Walk ONE status from page 1 (cursor null) to completion, upserting each page.
// No resume state — used by the fast partial modes ('recent', 'recent-extended').
// Same non-JSON guard, 250ms pacing, mapping, and BUDGET_MS break as the full walk.
async function walkStatus(
  supabase: any,
  apiKey: string,
  status: string,
  opts: { afterUpdatedAt?: string | null, startedAt: number, BUDGET_MS: number }
) {
  const { afterUpdatedAt = null, startedAt, BUDGET_MS } = opts
  let cursor: string | null = null
  let pages = 0
  let rows = 0

  while (true) {
    // Out of time — stop cleanly (these modes hold no resume state).
    if (Date.now() - startedAt > BUDGET_MS) break

    let url = `${CAL_API_BASE}/bookings?take=100&status=${status}`
    if (afterUpdatedAt) url += `&afterUpdatedAt=${encodeURIComponent(afterUpdatedAt)}`
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'cal-api-version': CAL_API_VERSION,
      },
    })

    // Read as text first so a non-JSON error page doesn't crash JSON.parse.
    // On a bad response, stop THIS status cleanly (don't kill the whole run).
    const bodyText = await res.text()
    if (!res.ok) {
      console.warn(`cal-sync: status '${status}' returned HTTP ${res.status}, stopping status: ${bodyText.slice(0, 200)}`)
      break
    }
    let json: any
    try {
      json = JSON.parse(bodyText)
    } catch (_) {
      console.warn(`cal-sync: status '${status}' non-JSON response, stopping status: ${bodyText.slice(0, 200)}`)
      break
    }
    if (json.status && json.status !== 'success') {
      throw new Error(`Cal.com API: ${JSON.stringify(json.error || json)}`)
    }

    const data = json.data || []
    const syncedAt = new Date().toISOString()
    const pageRows: any[] = data.map((b: any) => mapBooking(b, syncedAt))

    if (pageRows.length > 0) {
      const { error } = await supabase
        .from('cal_bookings')
        .upsert(pageRows, { onConflict: 'uid' })
      if (error) throw error
      rows += pageRows.length
    }

    pages++

    const nextCursor = json.pagination?.nextCursor || null
    const hasMore = json.pagination?.hasMore
    if (!hasMore || !nextCursor) break
    cursor = nextCursor

    // Gentle pacing to stay well under Cal.com's 120 req/min rate limit.
    await new Promise(r => setTimeout(r, 250))
  }

  return { pages, rows }
}

async function runSync(apiKey: string, mode: string = 'full') {
  // Declared above the try so the catch block can still save progress on error.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  let cursor: string | null = null
  let statusIndex = 0

  // Walk one status at a time, in this order. Omitting status triggers a slow
  // year-2100 uuid scan in Cal.com; status-filtered walks are bounded and fast.
  const STATUSES = ['upcoming', 'recurring', 'unconfirmed', 'past', 'cancelled']

  // Fast partial modes — bounded statuses, NO resume state. Each runs
  // start-to-finish and never touches cal_sync_state.
  if (mode === 'recent' || mode === 'recent-extended') {
    try {
      const startedAt = Date.now()
      const BUDGET_MS = 120000
      let pagesThisRun = 0
      let bookings = 0

      // The fast, bounded statuses.
      const fastStatuses = ['upcoming', 'recurring', 'unconfirmed']
      for (const status of fastStatuses) {
        const r = await walkStatus(supabase, apiKey, status, { startedAt, BUDGET_MS })
        pagesThisRun += r.pages
        bookings += r.rows
      }

      // recent-extended also catches recently-changed/cancelled PAST bookings,
      // filtered by afterUpdatedAt so we skip the deep history scan.
      if (mode === 'recent-extended') {
        const sevenDaysAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const r = await walkStatus(supabase, apiKey, 'past', { afterUpdatedAt: sevenDaysAgoISO, startedAt, BUDGET_MS })
        pagesThisRun += r.pages
        bookings += r.rows
      }

      const result = { ok: true, mode, pagesThisRun, bookings }
      console.log(JSON.stringify(result))
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('cal-sync error:', message)
      return { ok: false, error: message }
    }
  }

  // mode === 'full' (default) — existing per-status resume seed walk. UNCHANGED.
  try {
    // Resume from saved status + cursor (single state row, id=1).
    const { data: stateRow } = await supabase
      .from('cal_sync_state')
      .select('*')
      .eq('id', 1)
      .single()
    cursor = stateRow?.cursor || null
    statusIndex = stateRow?.status_index ?? 0
    let pagesDone = stateRow?.pages_done || 0

    // Wall-clock budget: stop safely before the 150s platform kill so the
    // per-page state we've saved survives and the next run resumes.
    const startedAt = Date.now()
    const BUDGET_MS = 120000 // 120s, leaving margin under the 150s limit
    let pagesThisRun = 0
    let outOfTime = false

    // OUTER loop: advance through statuses in array order.
    while (statusIndex < STATUSES.length) {
      const status = STATUSES[statusIndex]

      // INNER loop: walk the pages of THIS status.
      while (true) {
        // Out of time — the last per-page save already persisted progress.
        if (Date.now() - startedAt > BUDGET_MS) {
          outOfTime = true
          break
        }

        const url = `${CAL_API_BASE}/bookings?take=100&status=${status}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '')
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'cal-api-version': CAL_API_VERSION,
          },
        })

        // Read as text first so a non-JSON error page (rate limit, 5xx, "A
        // server error occurred") doesn't crash JSON.parse. On a bad response,
        // treat THIS status as done for this run and advance to the next one —
        // don't kill the whole run.
        const bodyText = await res.text()
        if (!res.ok) {
          console.warn(`cal-sync: status '${status}' returned HTTP ${res.status}, advancing: ${bodyText.slice(0, 200)}`)
          cursor = null
          statusIndex++
          await supabase
            .from('cal_sync_state')
            .update({ cursor: null, status_index: statusIndex, pages_done: pagesDone, last_run_at: new Date().toISOString() })
            .eq('id', 1)
          break
        }
        let json: any
        try {
          json = JSON.parse(bodyText)
        } catch (_) {
          console.warn(`cal-sync: status '${status}' non-JSON response, advancing: ${bodyText.slice(0, 200)}`)
          cursor = null
          statusIndex++
          await supabase
            .from('cal_sync_state')
            .update({ cursor: null, status_index: statusIndex, pages_done: pagesDone, last_run_at: new Date().toISOString() })
            .eq('id', 1)
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
          // This status is fully walked — advance to the next status, reset cursor.
          cursor = null
          statusIndex++
          await supabase
            .from('cal_sync_state')
            .update({ cursor: null, status_index: statusIndex, pages_done: pagesDone, last_run_at: new Date().toISOString() })
            .eq('id', 1)
          break
        } else {
          cursor = nextCursor
          await supabase
            .from('cal_sync_state')
            .update({ cursor: cursor, status_index: statusIndex, pages_done: pagesDone, last_run_at: new Date().toISOString() })
            .eq('id', 1)
        }

        // Hard safety cap — never run away.
        if (pagesDone > 1000) {
          outOfTime = true
          break
        }

        // Gentle pacing to stay well under Cal.com's 120 req/min rate limit.
        await new Promise(r => setTimeout(r, 250))
      }
      // end inner loop

      if (outOfTime) break // exit the outer loop too
    }
    // end outer loop

    let result: any
    if (!outOfTime && statusIndex >= STATUSES.length) {
      // All statuses finished — seed pass complete. Reset for the next pass so
      // the next run starts fresh from the first status.
      await supabase
        .from('cal_sync_state')
        .update({ cursor: null, status_index: 0, pages_done: 0, seed_complete: true, last_run_at: new Date().toISOString() })
        .eq('id', 1)
      result = { ok: true, pagesThisRun, statusReached: 'complete', seedComplete: true }
    } else {
      // Early exit (budget or hard cap). Per-page state save already persisted
      // the cursor/status, so the next run resumes from here.
      result = { ok: true, pagesThisRun, statusReached: STATUSES[statusIndex] ?? 'complete', cursorRemaining: cursor, seedComplete: false }
    }
    console.log(JSON.stringify(result))
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('cal-sync error:', message)
    // Best-effort: save the current status + cursor so a mid-run error keeps
    // progress. Wrapped so a save failure can't mask the original error.
    try {
      await supabase
        .from('cal_sync_state')
        .update({ cursor: cursor, status_index: statusIndex, last_run_at: new Date().toISOString() })
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

  // Read mode from a ?mode= query param and/or a JSON body { mode }. Body wins
  // if both are present. Default to 'full' when absent or unrecognized.
  let mode = 'full'
  try {
    const qp = new URL(req.url).searchParams.get('mode')
    if (qp) mode = qp
  } catch (_) {
    // ignore URL parse issues
  }
  try {
    const body = await req.json()
    if (body && typeof body.mode === 'string') mode = body.mode
  } catch (_) {
    // no body / not JSON — keep query param or default
  }
  if (mode !== 'recent' && mode !== 'recent-extended') mode = 'full'

  // Run the full sync and wait for it to finish, so the result is reliable.
  // (pg_cron callers must use a longer pg_net timeout than the 5s default.)
  const result = await runSync(apiKey, mode)

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
