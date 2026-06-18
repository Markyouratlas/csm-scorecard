import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const AD_ACCOUNT_ID = 'act_855275706589462'
const API_VERSION = 'v21.0'
const DATE_PRESETS = ['today', 'last_7d', 'last_30d', 'last_90d']
const FIELDS = 'spend,impressions,reach,cpm,ctr,inline_link_clicks,inline_link_click_ctr,actions'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

async function runSync(token: string) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Fetch all campaigns (paginated, so we capture more than the first page).
    const campaigns = []
    let campNext = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/campaigns?fields=id,name,status&limit=500&access_token=${token}`
    let campPages = 0
    while (campNext && campPages < 20) {
      const campRes = await fetch(campNext)
      const campJson = await campRes.json()
      if (campJson.error) throw new Error(`Meta API: ${campJson.error.message}`)
      for (const c of (campJson.data || [])) campaigns.push(c)
      campNext = campJson.paging?.next || null
      campPages++
    }
    // Map campaign_id -> status so account-level insight rows (which lack status)
    // can still carry the real delivery status for Live/Paused badges.
    const statusById = new Map(campaigns.map(c => [c.id, c.status]))

    // 2. For each date preset, fetch account-level campaign insights (paginated).
    // level=campaign returns one row per campaign with campaign_id/campaign_name as
    // fields, so we no longer loop per campaign (1 paginated call per preset, not 4×N).
    const rows = []
    for (const preset of DATE_PRESETS) {
      let presetNext = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights?fields=${FIELDS},campaign_id,campaign_name&level=campaign&date_preset=${preset}&limit=500&access_token=${token}`
      let presetPages = 0
      while (presetNext && presetPages < 20) {
        const insightRes = await fetch(presetNext)
        const insightJson = await insightRes.json()
        if (insightJson.error) throw new Error(`Meta insights API (${preset}): ${insightJson.error.message}`)

        for (const insight of (insightJson.data || [])) {
          rows.push({
            fetch_date: new Date().toISOString().split('T')[0],
            date_preset: preset,
            campaign_id: insight.campaign_id,
            campaign_name: insight.campaign_name,
            status: statusById.get(insight.campaign_id) ?? null,
            spend: insight.spend ? parseFloat(insight.spend) : null,
            impressions: insight.impressions ? parseInt(insight.impressions) : null,
            reach: insight.reach ? parseInt(insight.reach) : null,
            cpm: insight.cpm ? parseFloat(insight.cpm) : null,
            ctr: insight.ctr ? parseFloat(insight.ctr) : null,
            inline_link_clicks: insight.inline_link_clicks ? parseInt(insight.inline_link_clicks) : null,
            inline_link_click_ctr: insight.inline_link_click_ctr ? parseFloat(insight.inline_link_click_ctr) : null,
            actions: insight.actions || null,
          })
        }

        presetNext = insightJson.paging?.next || null
        presetPages++
      }
    }

    // 2.5 Daily time-series — last 90 days, one row per campaign per day.
    // Uses time_increment=1 so Meta returns a daily breakdown in one call per campaign.
    const today = new Date()
    const since = new Date(today)
    since.setDate(since.getDate() - 90)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    const timeRange = `{"since":"${fmt(since)}","until":"${fmt(today)}"}`

    // Single account-level paginated call (level=campaign, time_increment=1) instead of
    // a per-campaign loop; each row carries campaign_id/campaign_name.
    const dailyRows = []
    let dailyNext = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights?fields=${FIELDS},campaign_id,campaign_name&level=campaign&time_range=${encodeURIComponent(timeRange)}&time_increment=1&limit=500&access_token=${token}`
    let dailyPages = 0
    while (dailyNext && dailyPages < 20) {
      const dailyRes = await fetch(dailyNext)
      const dailyJson = await dailyRes.json()
      if (dailyJson.error) throw new Error(`Meta daily API: ${dailyJson.error.message}`)

      for (const day of (dailyJson.data || [])) {
        dailyRows.push({
          campaign_id: day.campaign_id,
          campaign_name: day.campaign_name,
          status: statusById.get(day.campaign_id) ?? null,
          date_start: day.date_start,
          spend: day.spend ? parseFloat(day.spend) : null,
          impressions: day.impressions ? parseInt(day.impressions) : null,
          reach: day.reach ? parseInt(day.reach) : null,
          cpm: day.cpm ? parseFloat(day.cpm) : null,
          ctr: day.ctr ? parseFloat(day.ctr) : null,
          inline_link_clicks: day.inline_link_clicks ? parseInt(day.inline_link_clicks) : null,
          inline_link_click_ctr: day.inline_link_click_ctr ? parseFloat(day.inline_link_click_ctr) : null,
          actions: day.actions || null,
        })
      }

      dailyNext = dailyJson.paging?.next || null
      dailyPages++
    }

    // Stamp completion time so "last synced" reflects when data actually landed.
    const syncedAt = new Date().toISOString()
    for (const r of dailyRows) r.synced_at = syncedAt

    if (dailyRows.length > 0) {
      const { error: dailyError } = await supabase
        .from('meta_ads_daily')
        .upsert(dailyRows, { onConflict: 'campaign_id,date_start' })
      if (dailyError) throw dailyError
    }

    // 2.6 Ad-set daily time-series — last 90 days, one row per ad set per day.
    // Pulled at the account level with level=adset so we get adset_id/adset_name.
    const adsetUrl = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights?fields=${FIELDS},adset_id,adset_name,campaign_id,campaign_name&level=adset&time_range=${encodeURIComponent(timeRange)}&time_increment=1&limit=500&access_token=${token}`

    const adsetRows = []
    let adsetNext = adsetUrl
    let adsetPages = 0
    while (adsetNext && adsetPages < 20) {
      const adsetRes = await fetch(adsetNext)
      const adsetJson = await adsetRes.json()
      if (adsetJson.error) throw new Error(`Meta adset API: ${adsetJson.error.message}`)

      for (const row of (adsetJson.data || [])) {
        adsetRows.push({
          campaign_id: row.campaign_id || null,
          campaign_name: row.campaign_name || null,
          adset_id: row.adset_id,
          adset_name: row.adset_name || row.adset_id,
          status: null,
          date_start: row.date_start,
          spend: row.spend ? parseFloat(row.spend) : null,
          impressions: row.impressions ? parseInt(row.impressions) : null,
          reach: row.reach ? parseInt(row.reach) : null,
          cpm: row.cpm ? parseFloat(row.cpm) : null,
          ctr: row.ctr ? parseFloat(row.ctr) : null,
          inline_link_clicks: row.inline_link_clicks ? parseInt(row.inline_link_clicks) : null,
          inline_link_click_ctr: row.inline_link_click_ctr ? parseFloat(row.inline_link_click_ctr) : null,
          actions: row.actions || null,
          synced_at: syncedAt,
        })
      }

      adsetNext = adsetJson.paging?.next || null
      adsetPages++
    }

    if (adsetRows.length > 0) {
      const { error: adsetError } = await supabase
        .from('meta_ad_sets_daily')
        .upsert(adsetRows, { onConflict: 'adset_id,date_start' })
      if (adsetError) throw adsetError
    }

    // 3. Upsert all rows
    const { error } = await supabase
      .from('meta_ads_metrics')
      .upsert(rows, { onConflict: 'campaign_id,date_preset,fetch_date' })

    if (error) throw error

    const result = { ok: true, rows: rows.length, dailyRows: dailyRows.length, adsetRows: adsetRows.length, campaigns: campaigns.length }
    console.log(JSON.stringify(result))
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('meta-sync error:', message)
    return { ok: false, error: message }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const token = Deno.env.get('META_ACCESS_TOKEN')
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: 'META_ACCESS_TOKEN not set' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Run the full sync and wait for it to finish, so the result is reliable.
  // (~25s. pg_cron callers must use a longer pg_net timeout than the 5s default.)
  const result = await runSync(token)

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
