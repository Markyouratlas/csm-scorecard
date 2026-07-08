// ============================================================
// Supabase Edge Function: atlas-sync
// ============================================================
// Pulls Atlas Blue (iMessage) chat sessions + messages from the Atlas REST API
// and mirrors them into atlas_sessions / atlas_messages so AEs can read the
// pre-meeting correspondence in their deal view. Phase 1 (read-only history).
//
// Server-side ONLY. Uses the account-wide Atlas api-key (ATLAS_API_KEY). Never
// call Atlas from the browser.
//
// Linking: NO atlas_bookings table. Each session's contact (phone or email) is
// matched to an existing ae_deals row (phone: last-10; email: exact). The matched
// deal's ae_id becomes the session's rep_id (denormalized onto messages for flat
// RLS). Message fetch is limited to LINKED sessions — those are the ones an AE
// will open — unless {all:true} is passed.
//
// Auth: a signed-in executive OR a matching CRON_SECRET header (for scheduled runs).
// Invoke (exec):  supabase.functions.invoke('atlas-sync', { body: { sinceDays } })
// Cron/seed:      POST with header x-cron-secret: <CRON_SECRET>
// Deploy --no-verify-jwt (auth is enforced INSIDE the handler: exec user OR cron
// secret; the platform gate would otherwise 401 the cron-secret path).
// Secrets: ATLAS_API_KEY, ATLAS_CAMPAIGN_IDS (comma-separated), CRON_SECRET.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const ATLAS_BASE = "https://api.youratlas.com/v1/api";

// E.164 normalize + last-10 digits (mirrors the dialer's matching).
function e164(raw: string): string {
  const s = (raw || "").trim();
  if (s.startsWith("+")) return s.replace(/[^\d+]/g, "");
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d ? "+" + d : "";
}
const last10 = (raw: string) => (raw || "").replace(/\D/g, "").slice(-10);
const isEmail = (s: string) => /@/.test(s || "");
const CLOSED = new Set(["Closed Won", "Closed Lost", "Unqualified", "Deleted"]);

// Atlas responses may be a bare array or wrapped ({value|data|...:[...]}). Normalize.
function asArray(resp: any): any[] {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === "object") {
    for (const k of ["value", "data", "sessions", "messages", "result", "items"]) {
      if (Array.isArray(resp[k])) return resp[k];
    }
    const firstArr = Object.values(resp).find((v) => Array.isArray(v));
    if (Array.isArray(firstArr)) return firstArr as any[];
  }
  return [];
}

async function atlasGet(path: string, apiKey: string): Promise<any> {
  const res = await fetch(`${ATLAS_BASE}${path}`, { headers: { "api-key": apiKey, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`Atlas ${res.status} on ${path}`);
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const apiKey = Deno.env.get("ATLAS_API_KEY") || "";
    if (!apiKey) return json({ error: "ATLAS_API_KEY not set" }, 500);
    const campaignIds = (Deno.env.get("ATLAS_CAMPAIGN_IDS") || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!campaignIds.length) return json({ error: "ATLAS_CAMPAIGN_IDS not set" }, 500);

    // ---- Auth: cron secret OR signed-in executive ----
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const providedCron = req.headers.get("x-cron-secret") || "";
    let authed = cronSecret && providedCron && providedCron === cronSecret;
    if (!authed) {
      const authHeader = req.headers.get("Authorization") || "";
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: prof } = await userClient.from("profiles").select("role, role_type").eq("id", user.id).single();
        authed = !!prof && (prof.role === "executive" || prof.role_type === "executive");
      }
    }
    if (!authed) return json({ error: "Forbidden" }, 403);

    const { sinceDays = null, all = false } = await req.json().catch(() => ({}));
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Preload open-ish AE deals once for linking (id, ae_id, phone, email, status, meeting_at).
    const { data: deals } = await admin.from("ae_deals")
      .select("id, ae_id, customer_phone, customer_email, status, meeting_at")
      .order("meeting_at", { ascending: false }).limit(5000);
    const byTail = new Map<string, any[]>();
    const byEmail = new Map<string, any[]>();
    for (const d of deals || []) {
      const t = last10(d.customer_phone || "");
      if (t) { (byTail.get(t) || byTail.set(t, []).get(t)!).push(d); }
      const e = (d.customer_email || "").trim().toLowerCase();
      if (e) { (byEmail.get(e) || byEmail.set(e, []).get(e)!).push(d); }
    }
    const pickDeal = (cands: any[] | undefined) => {
      if (!cands || !cands.length) return null;
      return cands.find((d) => !CLOSED.has(d.status)) || cands[0];
    };

    const sinceMs = sinceDays ? Date.now() - Number(sinceDays) * 86400000 : null;
    let sessionCount = 0, linkedCount = 0, messageCount = 0;

    for (const campaignId of campaignIds) {
      const sessions = asArray(await atlasGet(`/campaign-chat/${campaignId}`, apiKey));

      for (const s of sessions) {
        const sessionId = s.RowKey || s.AIProviderSessionId;
        if (!sessionId) continue;
        const contact = (s.ContactIdentification || "").trim();
        const email = isEmail(contact) ? contact.toLowerCase() : null;
        const phone = !email && contact ? e164(contact) : null;

        // Link to an ae_deal (phone last-10, else email).
        const deal = email ? pickDeal(byEmail.get(email)) : pickDeal(byTail.get(last10(phone || "")));
        const repId = deal?.ae_id || null;
        const dealId = deal?.id || null;
        if (repId) linkedCount++;

        const ts = s.Timestamp || null;
        await admin.from("atlas_sessions").upsert({
          id: sessionId,
          campaign_id: campaignId,
          contact_phone: phone,
          contact_email: email,
          title: s.Tittle || s.Title || null,
          status: s.Status || null,
          previous_session_id: s.PreviousSessionId || null,
          ae_deal_id: dealId,
          rep_id: repId,
          created_at: ts,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
        sessionCount++;

        // Fetch messages only for linked sessions (what an AE will view), unless all:true.
        // Optionally bound by sinceDays on the session timestamp.
        if (!repId && !all) continue;
        if (sinceMs && ts && new Date(ts).getTime() < sinceMs) continue;

        let msgs: any[] = [];
        try { msgs = asArray(await atlasGet(`/campaign-chat/sessions/${sessionId}/messages`, apiKey)); }
        catch (e) { console.warn("messages fetch failed", sessionId, String(e)); continue; }

        const rows = msgs
          .filter((m) => m.Channel === "imessage" && (m.Content || "").trim() && (m.Role === "user" || m.Role === "assistant"))
          .map((m) => ({
            id: m.RowKey,
            session_id: sessionId,
            contact_phone: phone,
            contact_email: email,
            rep_id: repId,
            role: m.Role,
            content: m.Content,
            channel: "imessage",
            status: m.Status || null,
            atlas_phone_number_id: m.ChatPhoneNumberId || null,
            created_at: m.CreatedAt || m.Timestamp || null,
          }));
        if (rows.length) {
          await admin.from("atlas_messages").upsert(rows, { onConflict: "id" });
          messageCount += rows.length;
        }
      }
    }

    return json({ ok: true, sessions: sessionCount, linked: linkedCount, messages: messageCount });
  } catch (e: any) {
    console.error("atlas-sync error:", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
