import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const AD_ACCOUNT_ID = 'act_855275706589462'
const API_VERSION = 'v21.0'
const DATE_PRESETS = ['today', 'last_7d', 'last_30d', 'last_90d']
const FIELDS = 'spend,impressions,reach,cpm,ctr,inline_link_clicks,inline_link_click_ctr,actions'

Deno.serve(async (req) => {
  try {
    const token = Deno.env.get('META_ACCESS_TOKEN')
    if (!token) throw new Error('META_ACCESS_TOKEN not set')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Fetch all campaigns
    const campUrl = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/campaigns?fields=id,name,status&limit=100&access_token=${token}`
    const campRes = await fetch(campUrl)
    const campJson = await campRes.json()
    if (campJson.error) throw new Error(`Meta API: ${campJson.error.message}`)
    const campaigns = campJson.data || []

    // 2. For each campaign + date preset, fetch insights directly
    const rows = []
    for (const preset of DATE_PRESETS) {
      for (const campaign of campaigns) {
        const insightUrl = `https://graph.facebook.com/${API_VERSION}/${campaign.id}/insights?fields=${FIELDS}&date_preset=${preset}&access_token=${token}`
        const insightRes = await fetch(insightUrl)
        const insightJson = await insightRes.json()
        if (insightJson.error) throw new Error(`Meta insights API (${campaign.id}): ${insightJson.error.message}`)

        const insight = insightJson.data?.[0] || {}
        rows.push({
          fetch_date: new Date().toISOString().split('T')[0],
          date_preset: preset,
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          status: campaign.status,
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
    }

    // 3. Upsert all rows
    const { error } = await supabase
      .from('meta_ads_metrics')
      .upsert(rows, { onConflict: 'campaign_id,date_preset,fetch_date' })

    if (error) throw error

    return new Response(JSON.stringify({ ok: true, rows: rows.length, campaigns: campaigns.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
