# DEPLOY_NOTES

Tribal knowledge for keeping the production Stripe sync healthy. Read this if a sync looks wrong, or before shipping changes to `supabase/functions/stripe-sync/index.ts`.

Last updated: 2026-05-25 (Mark)

---

## Edge Function deploys are NOT git/Vercel

`supabase functions deploy stripe-sync` pushes directly from your local disk to Supabase's edge runtime. It does **not** go through git or Vercel. Two implications:

- Pushing to `main` does not deploy the function. You must run `supabase functions deploy` explicitly.
- The deploy CLI can report "deployed" even when the deploy didn't actually take. The "Docker is not running" warning is one known trigger — if you see it, treat the deploy as suspect.

Always verify the deploy actually shipped before assuming it did.

---

## Verifying a deploy actually shipped

Two-step verification, in order:

**1. Supabase Dashboard → Edge Functions → stripe-sync → "Last deployed" timestamp.**

Should match within a few seconds of when you ran `supabase functions deploy`. If it's older, the deploy didn't take. Most common cause: Docker Desktop not running on Windows. Start Docker, run the deploy again, re-check the timestamp.

**2. Audit log probe — trigger a sync, then run:**

```sql
SELECT 
  created_at AT TIME ZONE 'America/Toronto' AS toronto_time,
  action,
  after_value->>'invoices_fetched' AS invoices,
  after_value->>'customers_upserted' AS upserted,
  after_value->>'duration_ms' AS ms
FROM commission_audit_log 
WHERE action LIKE 'stripe_sync%'
ORDER BY created_at DESC LIMIT 3;
```

What "passing" looks like on the top row:

- `action = stripe_sync` (not `stripe_sync_failed`)
- `invoices` is a real integer (~1500–4000 depending on billing window)
- `upserted` ≈ active customer count
- `ms` in the 30k–90k range

If `invoices` is `NULL` on a recent `stripe_sync` row, the old function code is still serving requests — the deploy didn't take. Redeploy.

---

## Stripe Restricted Key — required scopes

The `STRIPE_SECRET_KEY` secret in Supabase must have **Read** permission on all five of:

- Customers
- Subscriptions
- Prices
- Products
- **Invoices** ← easy to miss

Without Invoices read, the function's `Promise.all([customers, subs, invoices])` rejects on the invoice fetch, the catch block writes a `stripe_sync_failed` audit row, and no data updates. Symptom: error message starts with `Stripe 403: ... The provided key 'rk_live_...'`.

When rotating or replacing the key, verify all five scopes before pointing the function at the new key.

---

## "Sync looks wrong" troubleshooting recipe

1. Run the audit log probe above.
2. If the most recent run is `stripe_sync_failed`, read the error:
   ```sql
   SELECT after_value->>'error' FROM commission_audit_log 
   WHERE action = 'stripe_sync_failed' 
   ORDER BY created_at DESC LIMIT 1;
   ```
   - `Stripe 403` → key permissions (see scope list above)
   - `Stripe 400` → query param issue in code
   - Timeout / network → flaky run, retry once before digging
3. If the most recent run is `stripe_sync` (success) but data looks off, check whether the **new** code path ran — `invoices_fetched` should be non-NULL. If it's NULL, old code is still deployed.
4. If new code ran and data is still wrong, spot-check a known customer's `monthly_cash_received` vs. `monthly_mrr` directly:
   ```sql
   SELECT name, monthly_cash_received, monthly_mrr 
   FROM commission_customers 
   WHERE name ILIKE '%<customer>%';
   ```

---

## Canonical test case

**Elizabeth Batchelor** (stripe_customer_id `cus_TMUkIhUTFkWhfT`) — canceled 3-month prepay, $1,497 upfront, no renewal. After any sync, her data should be:

- `monthly_cash_received['2025-11'] = 1497`
- All other months in `monthly_cash_received` = 0
- Heather's Feb 2026 Personal Commission tab should show **$0** from Elizabeth (not $14.97)
- Heather's total commission from Elizabeth across all months should be $149.70 (10% × $1,497 in Nov, $0 thereafter)

If any of those numbers shift, something regressed. Bisect from the most recent code or schema change.

---

## Background sync pattern (FYI)

The function returns `202 Accepted` in ~1 second, then runs the actual sync in the background via `EdgeRuntime.waitUntil()`. This is necessary because 600+ customers exceeds the synchronous timeout. Consequences worth knowing:

- The HTTP response says nothing about whether the sync succeeded — you have to check the audit log (or `commission_customers.last_synced_at` row-by-row) to know.
- The cron at `0 7 * * *` UTC fires the same code path. A failing cron will not surface as an HTTP-level error anywhere; only the audit log catches it.
- If `stripe_sync_failed` rows start appearing in the audit log without anyone clicking the manual button, the cron is failing silently. Worth a weekly glance.
