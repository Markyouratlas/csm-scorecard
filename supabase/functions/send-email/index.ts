// =============================================================================
//  send-email — transactional email via Resend
//
//  Invoked from the client (best-effort) for:
//    - { type: 'new_signup', userId }       → notify all executives a new person
//      signed up; pending investors are flagged as needing an access grant.
//    - { type: 'investor_granted', userId } → notify the investor that access is
//      live and they can sign back in.
//
//  Mirrors the other edge functions: Deno.serve + CORS + Deno.env secrets +
//  service-role client. Sends branded HTML via the Resend API.
//
//  Secrets (set on THIS Supabase project):
//    RESEND_API_KEY   (required)
//    EMAIL_FROM       (optional; default 'Atlas <noreply@youratlas.com>')
//    APP_URL          (optional; default 'https://scorecard.youratlas.com')
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const BRAND = "#6639A6";
const FROM = Deno.env.get("EMAIL_FROM") || "Atlas <noreply@youratlas.com>";
const APP_URL = Deno.env.get("APP_URL") || "https://scorecard.youratlas.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Branded, email-client-safe HTML (all styles inline; table-free, simple divs).
function renderEmail({ eyebrow, heading, intro, highlight, ctaText, ctaUrl, footer }: {
  eyebrow: string; heading: string; intro: string; highlight?: string;
  ctaText?: string; ctaUrl?: string; footer?: string;
}) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#EDE7F5;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(26,15,46,0.12);">
      <div style="background:linear-gradient(135deg,${BRAND},#8B5CD0);padding:28px 32px;">
        <div style="color:rgba(255,255,255,0.85);font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:700;">ATLAS</div>
        <div style="color:#ffffff;font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:0.7;margin-top:2px;">${eyebrow}</div>
      </div>
      <div style="padding:32px;">
        <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:#1A0F2E;font-weight:600;">${heading}</h1>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#56506A;">${intro}</p>
        ${highlight ? `<div style="margin:0 0 22px;padding:14px 16px;background:rgba(184,134,11,0.10);border-left:3px solid #B8860B;border-radius:0 8px 8px 0;font-size:14px;line-height:1.55;color:#7A5C0E;">${highlight}</div>` : ""}
        ${ctaText && ctaUrl ? `<a href="${ctaUrl}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:10px;">${ctaText}</a>` : ""}
      </div>
    </div>
    <div style="text-align:center;color:#8B8499;font-size:11px;margin-top:18px;line-height:1.5;">${footer || "Atlas Scorecard · scorecard.youratlas.com"}</div>
  </div></body></html>`;
}

async function sendViaResend(apiKey: string, to: string | string[], subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: Array.isArray(to) ? to : [to], subject, html }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend ${res.status}: ${txt}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "RESEND_API_KEY not configured" }, 500);

  let payload: { type?: string; userId?: string };
  try { payload = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const { type, userId } = payload;
  if (!type || !userId) return json({ error: "type and userId are required" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // The subject user's profile + email.
    const { data: prof } = await admin.from("profiles").select("name, title, team, role_type").eq("id", userId).single();
    const { data: userRes } = await admin.auth.admin.getUserById(userId);
    const userEmail = userRes?.user?.email || null;
    const name = prof?.name || "Someone";

    if (type === "new_signup") {
      // Gather executive emails.
      const { data: execs } = await admin.from("profiles").select("id").or("role.eq.executive,role_type.eq.executive");
      const execEmails: string[] = [];
      for (const e of execs || []) {
        const { data: u } = await admin.auth.admin.getUserById(e.id);
        if (u?.user?.email) execEmails.push(u.user.email);
      }
      if (execEmails.length === 0) return json({ ok: true, skipped: "no executives" });

      const isPendingInvestor = prof?.role_type === "investor_pending";
      const dept = prof?.team || "—";
      const html = renderEmail({
        eyebrow: "New signup",
        heading: `${name} just signed up`,
        intro: `<strong>${name}</strong> (${prof?.title || "—"}) created an account${userEmail ? ` with <strong>${userEmail}</strong>` : ""}. Department: <strong>${dept}</strong>.`,
        highlight: isPendingInvestor
          ? `<strong>Action needed:</strong> this is an <strong>investor</strong> awaiting access. Open Manager → Roster and click <strong>Grant investor access</strong> to let them in.`
          : undefined,
        ctaText: isPendingInvestor ? "Review in Roster" : "Open Scorecard",
        ctaUrl: APP_URL,
        footer: "You're receiving this because you're an Atlas executive.",
      });
      await sendViaResend(apiKey, execEmails, isPendingInvestor ? `Investor access requested — ${name}` : `New signup — ${name}`, html);
      return json({ ok: true, notified: execEmails.length });
    }

    if (type === "investor_granted") {
      if (!userEmail) return json({ ok: true, skipped: "no investor email" });
      const html = renderEmail({
        eyebrow: "Access granted",
        heading: `You're in, ${name.split(" ")[0]}.`,
        intro: "Your Atlas investor access has been approved. Sign back in to view the Atlas Odyssey investor dashboard — live company metrics, at a glance.",
        ctaText: "Open the dashboard",
        ctaUrl: APP_URL,
        footer: "Atlas Odyssey · Investor Access",
      });
      await sendViaResend(apiKey, userEmail, "Your Atlas investor access is live", html);
      return json({ ok: true, notified: 1 });
    }

    return json({ error: `Unknown type: ${type}` }, 400);
  } catch (e) {
    console.error("send-email error:", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
