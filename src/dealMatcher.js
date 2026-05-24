// ============================================================
// dealMatcher.js — Pure logic for matching AE-submitted deals
// to Stripe customer records.
// ============================================================
// Used by:
//   - PendingDealsTab.handleRunAutoMatch (batch run from Pending Deals)
//   - MatchDealPanel (single-deal suggestions on render)
//
// No side effects. Given a deal and a customer list, returns:
//   { customer, confidence, method, reason } | null
//
// Scoring uses simple, explainable heuristics over Levenshtein-style logic
// so the manager can always understand WHY a match was suggested.
// ============================================================

// Normalize strings for comparison: lowercase, trim, strip extra spaces.
// Doesn't strip punctuation because business names like "L.A. Roofing"
// vs "LA Roofing" are usually the same and we want to mark that as a near-match.
function norm(s) {
  return (s || "").toString().toLowerCase().trim().replace(/\s+/g, " ");
}

// Remove common punctuation, suffixes, articles for fuzzy name comparison.
//   "Acme Roofing Inc." -> "acme roofing"
//   "The Smith Company" -> "smith company"
function simplifyName(s) {
  let x = norm(s);
  x = x.replace(/[.,'"()&\-_/\\]/g, " ");
  // Strip common business suffixes
  x = x.replace(/\b(inc|llc|ltd|llp|corp|corporation|co|company|gmbh|sa|sas|sl|srl|plc|pvt|pty|bv|nv|ab|kg)\b\.?$/gi, "");
  // Strip leading "the"
  x = x.replace(/^the\s+/, "");
  return x.replace(/\s+/g, " ").trim();
}

// Levenshtein distance — for fuzzy name matching when names aren't exact
// but close enough that we should at least suggest the match.
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? dp[j - 1]
        : 1 + Math.min(dp[j - 1], dp[j], prev);
      prev = tmp;
    }
    dp[0] = i;
  }
  return dp[b.length];
}

function similarity(a, b) {
  const sa = simplifyName(a);
  const sb = simplifyName(b);
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  const dist = levenshtein(sa, sb);
  const maxLen = Math.max(sa.length, sb.length);
  return Math.max(0, 1 - dist / maxLen);
}

// ============================================================
// Main matcher
// ============================================================
// Inputs:
//   deal: { customer_email, customer_name, closed_date, ... }
//   customers: array of Stripe customer records
//
// Returns the best match candidate object, or null:
//   {
//     customer,      // the Stripe customer record
//     confidence,    // 0.00 to 1.00
//     method,        // 'exact_email_primary' | 'exact_email_secondary'
//                    // | 'fuzzy_name_strong' | 'fuzzy_name_weak'
//     reason,        // human-readable explanation
//   }
// ============================================================
export function findBestMatch(deal, customers) {
  if (!deal || !Array.isArray(customers) || customers.length === 0) return null;

  const aeEmail = norm(deal.customer_email);
  const aeName = norm(deal.customer_name);
  if (!aeEmail && !aeName) return null;

  let exactPrimary = null;
  let exactSecondary = null;
  let bestNameMatch = null;
  let bestNameScore = 0;

  for (const cu of customers) {
    const cuEmail = norm(cu.email);
    const cuSecondary = norm(cu.secondary_email);
    const cuName = norm(cu.name);

    // 1. Exact email match (primary billing email)
    if (aeEmail && cuEmail && cuEmail === aeEmail) {
      // First exact-primary wins. Should be unique in practice.
      if (!exactPrimary) exactPrimary = cu;
    }

    // 2. Exact email match on secondary email
    if (aeEmail && cuSecondary && cuSecondary === aeEmail) {
      if (!exactSecondary) exactSecondary = cu;
    }

    // 3. Fuzzy name similarity — track the best one
    if (aeName && cuName) {
      const score = similarity(cuName, aeName);
      if (score > bestNameScore) {
        bestNameScore = score;
        bestNameMatch = cu;
      }
    }
  }

  // Decision tree — strongest signal wins
  if (exactPrimary) {
    return {
      customer: exactPrimary,
      confidence: 1.00,
      method: "exact_email_primary",
      reason: `Stripe billing email matches "${deal.customer_email}"`,
    };
  }

  if (exactSecondary) {
    return {
      customer: exactSecondary,
      confidence: 0.95,
      method: "exact_email_secondary",
      reason: `Secondary email on "${exactSecondary.name}" matches "${deal.customer_email}"`,
    };
  }

  if (bestNameMatch && bestNameScore >= 0.85) {
    return {
      customer: bestNameMatch,
      confidence: Math.min(0.85, bestNameScore * 0.9),
      method: "fuzzy_name_strong",
      reason: `Customer name "${bestNameMatch.name}" is very similar to "${deal.customer_name}" (${Math.round(bestNameScore * 100)}% match)`,
    };
  }

  if (bestNameMatch && bestNameScore >= 0.60) {
    return {
      customer: bestNameMatch,
      confidence: bestNameScore * 0.7,
      method: "fuzzy_name_weak",
      reason: `Name "${bestNameMatch.name}" loosely resembles "${deal.customer_name}" (${Math.round(bestNameScore * 100)}% match) — verify before confirming`,
    };
  }

  return null;
}

// ============================================================
// Auto-confirm policy
// ============================================================
// Returns true if a match is confident enough to flip the deal to "matched"
// without requiring a manager click.
//
// Current policy (smart default):
//   - Exact primary or secondary email match (confidence >= 0.95) AND
//   - The Stripe customer's start_date is within last 90 days
//
// Why 90 days: an AE submitting a deal usually closes it close to when the
// customer's first Stripe charge lands. Old emails matching is more likely
// to be a re-engagement or a different account that happens to share an
// inbox — those should be reviewed manually.
//
// Pass options to override: { autoConfirmExactEmail: 'always' | 'recent' | 'never' }
// ============================================================
export function shouldAutoConfirm(match, deal, options = {}) {
  if (!match) return false;
  const policy = options.autoConfirmExactEmail || "recent";  // default: smart

  if (policy === "never") return false;

  // Only exact-email matches are eligible for auto-confirm.
  const isExactEmail = match.method === "exact_email_primary" || match.method === "exact_email_secondary";
  if (!isExactEmail) return false;
  if (match.confidence < 0.95) return false;

  if (policy === "always") return true;

  // 'recent' policy: customer must have started within last 90 days
  const startDate = match.customer?.start_date;
  if (!startDate) return false;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return false;
  const daysSinceStart = (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceStart <= 90;
}

// ============================================================
// Batch runner
// ============================================================
// Goes through every "submitted" deal and computes a suggestion.
// Returns an array of operations to apply: { dealId, fields }
// Caller is responsible for writing to Supabase (separation of concerns).
//
// Phase 4.5 might wire this into a Supabase Edge Function for true server-side
// auto-matching after Stripe sync; for now it runs client-side when the
// manager clicks "Re-run auto-match" in the Pending Deals tab.
// ============================================================
export function buildAutoMatchOps(deals, customers, options = {}) {
  const ops = [];
  for (const deal of deals) {
    // Skip already-matched (don't overwrite) and drafts (AE hasn't submitted)
    if (deal.status === "matched") continue;
    if (deal.status === "draft") continue;

    const match = findBestMatch(deal, customers);

    if (!match) {
      // No match found — clear any stale suggestion
      ops.push({
        dealId: deal.id,
        fields: {
          suggested_match_stripe_customer_id: null,
          suggested_match_at: new Date().toISOString(),
          suggested_match_reason: "No candidate found by auto-matcher",
          match_method: null,
          match_confidence: null,
        },
      });
      continue;
    }

    const autoConfirm = shouldAutoConfirm(match, deal, options);

    const fields = {
      suggested_match_stripe_customer_id: match.customer.stripe_customer_id,
      suggested_match_at: new Date().toISOString(),
      suggested_match_reason: match.reason,
      match_method: match.method,
      match_confidence: match.confidence,
    };

    if (autoConfirm) {
      // Auto-flip to matched. Manager can still unmatch and review.
      fields.status = "matched";
      fields.matched_stripe_customer_id = match.customer.stripe_customer_id;
      fields.matched_at = new Date().toISOString();
      // matched_by stays null to indicate it was the auto-matcher, not a human;
      // matched_by_name marks it as automated for the audit trail.
      fields.matched_by = null;
      fields.matched_by_name = "Auto-matcher";
    }

    ops.push({
      dealId: deal.id,
      fields,
      autoConfirmed: autoConfirm,
      match,
    });
  }
  return ops;
}
