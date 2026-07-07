// ============================================================
// Supabase Edge Function: dialer-sms-inbound
// ============================================================
// Twilio "A message comes in" webhook (set on the Messaging Service). Stores the
// inbound text against the rep who owns the receiving number (To), linking the
// prospect deal by phone when we can. Signature-validated; deploy --no-verify-jwt.
// Secret: TWILIO_AUTH_TOKEN, DIALER_SMS_INBOUND_URL (exact configured URL).
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature" };
const xml = (b: string, s = 200) => new Response(b, { status: s, headers: { ...cors, "Content-Type": "text/xml" } });

// E.164 normalize + last-10 digits (format-agnostic matching against deal numbers).
function e164(raw: string): string {
  const s = (raw || "").trim();
  if (s.startsWith("+")) return s.replace(/[^\d+]/g, "");
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d ? "+" + d : "";
}
const last10 = (raw: string) => (raw || "").replace(/\D/g, "").slice(-10);
const CLOSED = new Set(["Closed Won", "Closed Lost", "Unqualified", "Deleted"]);

async function validSig(url: string, p: URLSearchParams, token: string, provided: string): Promise<boolean> {
  if (!provided || !token) return false;
  let data = url;
  for (const k of [...p.keys()].sort()) data += k + (p.get(k) ?? "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))) === provided;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const empty = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  try {
    const token = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
    const url = Deno.env.get("DIALER_SMS_INBOUND_URL") || req.url;
    const raw = await req.text();
    const p = new URLSearchParams(raw);
    if (!(await validSig(url, p, token, req.headers.get("X-Twilio-Signature") || ""))) return xml(empty, 403);

    const fromRaw = (p.get("From") || "").trim();  // prospect (sender)
    const toRaw = (p.get("To") || "").trim();       // rep's Atlas number (receiving line)
    const from = e164(fromRaw);
    const to = e164(toRaw);
    const body = p.get("Body") || "";
    const sid = p.get("MessageSid") || p.get("SmsSid") || null;
    if (!from || !to) return xml(empty);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Match the receiving number format-agnostically (rep numbers may be stored non-E.164).
    const toTail = last10(to);
    const { data: reps } = await admin.from("profiles").select("id, twilio_number").ilike("twilio_number", `%${toTail}`);
    const rep = (reps || []).find((r) => last10(r.twilio_number || "") === toTail) || null;
    if (!rep?.id) return xml(empty); // no rep owns this number → can't attribute, drop

    // Best-effort link to the prospect's deal for this rep (match by last-10 digits).
    // Prefer the most-recent OPEN deal; fall back to most-recent of any status; null if none.
    // Never blocks the insert — an unlinked inbound still lands in the thread (thread keys on contact_phone).
    const fromTail = last10(from);
    let dealId: string | null = null;
    const { data: deals } = await admin.from("ae_deals")
      .select("id, status, customer_phone, meeting_at")
      .eq("ae_id", rep.id).ilike("customer_phone", `%${fromTail}`)
      .order("meeting_at", { ascending: false }).limit(20);
    const matches = (deals || []).filter((d) => last10(d.customer_phone || "") === fromTail);
    dealId = (matches.find((d) => !CLOSED.has(d.status)) || matches[0])?.id || null;

    await admin.from("sms_messages").insert({
      rep_id: rep.id, ae_deal_id: dealId, contact_phone: from, from_number: from, line_number: to,
      direction: "inbound", body, status: "received", twilio_sid: sid,
    });
    return xml(empty);
  } catch (e: any) {
    console.error("dialer-sms-inbound error:", e);
    return xml(empty); // never retry-storm
  }
});
