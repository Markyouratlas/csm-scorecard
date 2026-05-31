// ============================================================
// Commission Engine — pure cash-based commission math (Phase 4)
// Phase 4.2 base fix (2026-05-29): CSM earns nothing on the first cash month.
// ============================================================
// No React, no Supabase. All functions are deterministic and side-effect free.
//
// THE MODEL (Phase 4):
//   Commission is calculated 100% on cash actually received from the customer.
//   "Cash" = monthly_cash_received (from Stripe paid invoices) +
//            monthly_cash_received_manual (manual overrides for bank transfers).
//   Plus a customer-level initial_cash_override that adds to the FIRST cash
//   month (for one-off setup-fee payments not in Stripe).
//
//   AE earns:
//     - 10% on the first month any cash arrives (rate = aeVoiceRate)
//     - 3% on every subsequent month with cash (rate = aeResidualRate)
//     - Capped at 12 months from start_date (configurable via aeResidualMonths)
//
//   CSM earns:
//     - 3% on every cash month EXCEPT the first cash month (rate = csmRate).
//       The first/initial cash month is AE-only (Initial CC). Phase 4.2 base fix.
//     - Capped at 12 months from start_date (configurable via csmResidualMonths,
//       defaulting to 12 if not set on the rep override or global config)
//
//   Removed from the prior engine:
//     - MRR × upfrontMultiplier "proxy" for initial cash
//     - prepay window concept (no more "free months" before residual starts)
//     - pending_deals.upfront_amount as a source of truth (Stripe + manual is canonical)
//
//   Effective dating:
//     Per-rep rates can change over time via commission_rep_overrides
//     (effective_date based). At a given cash month D, the engine uses
//     the override row with the latest effective_date <= D.
// ============================================================

export const REPS = {
  AE: ["Heather", "Mason"],
  CSM: ["Matt", "Sean", "Noah"],
};
export const ALL_REPS = [...REPS.AE, ...REPS.CSM];
export const isAE = (rep) => REPS.AE.includes(rep);
export const isCSM = (rep) => REPS.CSM.includes(rep);

export const DEFAULT_CONFIG = {
  aeVoiceRate: 0.10,        // First-cash-month rate for AE
  aeResidualRate: 0.03,     // Subsequent-cash-month rate for AE
  aeResidualMonths: 12,     // Cap (months from start_date) for AE
  csmRate: 0.03,            // Every-cash-month rate for CSM
  csmResidualMonths: 12,    // Cap (months from start_date) for CSM. Phase 4: default 12 (was null = no cap)
  acceleratorTarget: 60000,
  // Kept for backward compat with prior config rows (calcAccelerator uses hardcoded 1.2/1.5)
  accelerator120Multiplier: 1.5,
  accelerator150Multiplier: 2.0,
  selfServeMaxMrr: 100,
  aeEraStartDate: "2025-11-01",
  // Note: upfrontMultiplier (was 3) is INTENTIONALLY removed. Phase 4 doesn't use it.
};

// ------------------------------------------------------------
// Override resolution
// ------------------------------------------------------------
export function indexOverrides(repOverrides) {
  const byRep = {};
  for (const o of (repOverrides || [])) {
    if (!o.rep_name) continue;
    if (!byRep[o.rep_name]) byRep[o.rep_name] = [];
    byRep[o.rep_name].push(o);
  }
  for (const rep of Object.keys(byRep)) {
    byRep[rep].sort((a, b) => (b.effective_date || "").localeCompare(a.effective_date || ""));
  }
  return byRep;
}

export function resolveRepConfig(repName, dateISO, indexedOverrides, baseConfig) {
  const base = baseConfig || DEFAULT_CONFIG;
  if (!repName || !indexedOverrides || !indexedOverrides[repName]) {
    return { ...base, _source: "default" };
  }
  const date = (dateISO || new Date().toISOString().slice(0, 10));
  const applicable = indexedOverrides[repName].find(o => (o.effective_date || "") <= date);
  if (!applicable) return { ...base, _source: "default" };

  return {
    aeVoiceRate:       applicable.ae_pct != null ? Number(applicable.ae_pct) : base.aeVoiceRate,
    aeResidualRate:    applicable.ae_residual_pct != null ? Number(applicable.ae_residual_pct) : base.aeResidualRate,
    aeResidualMonths:  applicable.ae_residual_months != null ? Number(applicable.ae_residual_months) : base.aeResidualMonths,
    csmRate:           applicable.csm_pct != null ? Number(applicable.csm_pct) : base.csmRate,
    csmResidualMonths: applicable.csm_residual_months != null ? Number(applicable.csm_residual_months) : (base.csmResidualMonths ?? 12),
    acceleratorTarget: applicable.accelerator_target != null ? Number(applicable.accelerator_target) : base.acceleratorTarget,
    accelerator120Multiplier: applicable.accel_1_5x_pct != null ? Number(applicable.accel_1_5x_pct) : base.accelerator120Multiplier,
    accelerator150Multiplier: applicable.accel_2x_pct != null ? Number(applicable.accel_2x_pct) : base.accelerator150Multiplier,
    teamLeadOverridePct: applicable.team_lead_override_pct != null ? Number(applicable.team_lead_override_pct) : 0,
    selfServeMaxMrr:   base.selfServeMaxMrr,
    aeEraStartDate:    base.aeEraStartDate,
    _source: "override",
    _effective_date: applicable.effective_date,
  };
}

// ------------------------------------------------------------
// Pending deals lookup (kept for assignment-matching workflows; engine math
// no longer reads upfront_amount for commission calc)
// ------------------------------------------------------------
export function indexMatchedDeals(pendingDeals) {
  const byCustomerId = {};
  for (const d of (pendingDeals || [])) {
    if (d.status !== "matched") continue;
    if (!d.matched_stripe_customer_id) continue;
    const existing = byCustomerId[d.matched_stripe_customer_id];
    if (!existing || (d.closed_date || "") > (existing.closed_date || "")) {
      byCustomerId[d.matched_stripe_customer_id] = d;
    }
  }
  return byCustomerId;
}

// ------------------------------------------------------------
// Date math
// ------------------------------------------------------------
export function monthDiff(startISO, monthKey) {
  if (!startISO) return null;
  const [sy, sm] = startISO.slice(0, 7).split("-").map(Number);
  const [my, mm] = monthKey.split("-").map(Number);
  return (my - sy) * 12 + (mm - sm);
}

export function monthLabel(m) {
  const [y, mo] = m.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[parseInt(mo) - 1]} ${y.slice(2)}`;
}

export function addMonths(monthKey, n) {
  const [y, m] = monthKey.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

// ------------------------------------------------------------
// PHASE 4: cash helpers
// ------------------------------------------------------------
// Combined cash for one customer one month: Stripe + manual override.
// monthly_cash_received is from /v1/invoices (paid status).
// monthly_cash_received_manual is for bank transfers Stripe didn't see.
//
// Note: initial_cash_override is a separate customer-level scalar that
// adds to the FIRST cash month only. It's NOT folded into combinedCash()
// because it doesn't have a month key — caller adds it explicitly at the
// first-cash-month detection point. See findFirstCashMonth.
export function combinedCash(customer, monthKey) {
  const stripe = (customer.monthly_cash_received && customer.monthly_cash_received[monthKey]) || 0;
  const manual = (customer.monthly_cash_received_manual && customer.monthly_cash_received_manual[monthKey]) || 0;
  return Number(stripe) + Number(manual);
}

// Walks the customer's combined cash history and returns the first month
// with any cash > 0. Returns null if no cash has ever arrived.
//
// The initial_cash_override (a customer-level scalar) is treated as if it
// arrived in the customer's start_date month — that's where setup-fee
// payments conceptually go. If start_date is missing, fall back to the
// first month with any non-zero Stripe/manual cash.
//
// "First cash month" is the month where the AE gets the 10% Voice AI rate.
export function findFirstCashMonth(customer, monthCols) {
  const startMonthKey = customer.start_date ? customer.start_date.slice(0, 7) : null;
  const initialOverride = Number(customer.initial_cash_override || 0);

  // If initial_cash_override is set and start_date exists, the start month
  // is by definition the first cash month (the override puts cash there).
  if (initialOverride > 0 && startMonthKey) {
    return startMonthKey;
  }

  // Otherwise, walk the month columns in chronological order and find the
  // first one with combined cash > 0.
  for (const m of monthCols) {
    if (combinedCash(customer, m) > 0) return m;
  }
  return null;
}

// Total cash for a customer in a specific month, INCLUDING the
// initial_cash_override if the month is the customer's first cash month.
// This is the canonical "cash this month, for commission purposes" number.
export function cashForCommissionMonth(customer, monthKey, firstCashMonth) {
  let total = combinedCash(customer, monthKey);
  if (firstCashMonth && monthKey === firstCashMonth) {
    total += Number(customer.initial_cash_override || 0);
  }
  return total;
}

// Phase 4.2: reversed cash (refunds + lost disputes) for a month, keyed to the
// month the original cash was received. Stored in commission_customers.monthly_cash_reversed.
export function reversedCash(customer, monthKey) {
  return Number(
    (customer.monthly_cash_reversed && customer.monthly_cash_reversed[monthKey]) || 0
  );
}

// Phase 4.2: NET cash used for RESIDUALS only = gross minus reversals, floored at
// $0 per customer per month. Initial CC (AE first-month 10%) uses GROSS, not this.
export function netCashForResidual(customer, monthKey, firstCashMonth) {
  const gross = cashForCommissionMonth(customer, monthKey, firstCashMonth);
  return Math.max(0, gross - reversedCash(customer, monthKey));
}

// ------------------------------------------------------------
// Assignment resolution
// ------------------------------------------------------------
export function resolveAssignment(customer, assignmentsByStripeId, assignmentsByEmail) {
  if (customer.stripe_customer_id && assignmentsByStripeId[customer.stripe_customer_id]) {
    return assignmentsByStripeId[customer.stripe_customer_id];
  }
  if (customer.email && assignmentsByEmail[customer.email.toLowerCase()]) {
    return assignmentsByEmail[customer.email.toLowerCase()];
  }
  return { ae: null, csm: null };
}

export function indexAssignments(assignmentList) {
  const byStripeId = {};
  const byEmail = {};
  for (const a of assignmentList) {
    if (a.stripe_customer_id) byStripeId[a.stripe_customer_id] = a;
    if (a.email) byEmail[a.email.toLowerCase()] = a;
  }
  return { byStripeId, byEmail };
}

// ============================================================
// CORE: per-month commission for one rep
// ============================================================
// For each month in monthCols, sums commission across the rep's book.
// Returns { rep, isAE, book, monthly: [{ month, voiceAICommission, aeResidual,
//   csmResidual, total, cashThisMonth, newDeals, ... }, ...] }
//
// PHASE 4 LOGIC:
//   For each customer in the rep's book:
//     determine firstCashMonth (using initial_override OR walk cash history)
//     for each month m in monthCols:
//       compute cash = cashForCommissionMonth(customer, m, firstCashMonth)
//       if cash <= 0 → skip (no commission this month)
//       check the 12-month cap: monthDiff(start_date, m) >= cap → skip
//       if AE:
//         if m === firstCashMonth → voiceAI += cash × aeVoiceRate (10%)
//         else                    → aeResidual += cash × aeResidualRate (3%)
//       if CSM:
//         if m === firstCashMonth → (nothing; initial CC is AE-only)
//         else                    → csmResidual += cash × csmRate (3%)
// ============================================================
export function calcRepCommission(
  rep,
  customers,
  indexedAssignments,
  config,
  monthCols,
  indexedOverrides = null,
  matchedDealsByCustomer = null,  // kept for signature compat; unused in Phase 4 math
) {
  const ae = isAE(rep);

  const book = customers.filter((c) => {
    const a = resolveAssignment(c, indexedAssignments.byStripeId, indexedAssignments.byEmail);
    return ae ? a.ae === rep : a.csm === rep;
  });

  // Precompute firstCashMonth per customer (depends only on customer data, not month)
  const firstCashByCustomer = new Map();
  for (const c of book) {
    firstCashByCustomer.set(c.stripe_customer_id || c.email, findFirstCashMonth(c, monthCols));
  }

  const monthly = monthCols.map((m) => {
    let voiceAI = 0;
    let voiceAINetSales = 0;  // For "new MRR / deals" stat displays
    let aeResidual = 0;
    let csmResidual = 0;
    let newDeals = 0;
    let newMRR = 0;
    let bookMRR = 0;

    for (const c of book) {
      const customerKey = c.stripe_customer_id || c.email;
      const firstCashMonth = firstCashByCustomer.get(customerKey);

      // bookMRR is informational — Stripe's reported MRR for the month
      const mrr = (c.monthly_mrr && c.monthly_mrr[m]) || 0;
      bookMRR += mrr;

      // The cash this month, including initial override on the first cash month
      const cash = cashForCommissionMonth(c, m, firstCashMonth);
      if (cash <= 0) continue;

      // Check the 12-month cap (from start_date)
      // Use the customer's effective rep config at the closed_date (or start_date as proxy)
      const effDate = c.start_date || m + "-01";
      const effCfg = resolveRepConfig(rep, effDate, indexedOverrides, config);
      const cap = ae ? effCfg.aeResidualMonths : effCfg.csmResidualMonths;
      const diff = monthDiff(c.start_date, m);
      if (cap != null && diff != null && diff >= cap) continue;

      if (ae) {
        if (m === firstCashMonth) {
          voiceAI += cash * effCfg.aeVoiceRate;
          voiceAINetSales += cash;
          newDeals += 1;
          newMRR += mrr;
        } else {
          aeResidual += netCashForResidual(c, m, firstCashMonth) * effCfg.aeResidualRate; // Phase 4.2: net of reversals
        }
      } else {
        // CSM earns nothing on the first cash month (initial CC is AE-only). Phase 4.2 base fix.
        if (m !== firstCashMonth) {
          csmResidual += netCashForResidual(c, m, firstCashMonth) * effCfg.csmRate; // Phase 4.2: net of reversals
        }
      }
    }

    return {
      month: m,
      newDeals,
      newMRR,
      voiceAINetSales,
      voiceAICommission: voiceAI,
      aeResidual,
      csmResidual,
      bookMRR,
      total: voiceAI + aeResidual + csmResidual,
    };
  });

  return { rep, isAE: ae, book, monthly };
}

// ============================================================
// CORE: per-customer YTD totals for one rep
// ============================================================
// Same math, different aggregation. Returns per-customer YTD totals.
// ============================================================
export function calcRepCommissionByCustomer(
  rep,
  customers,
  indexedAssignments,
  config,
  monthCols,
  indexedOverrides = null,
  matchedDealsByCustomer = null,
) {
  const ae = isAE(rep);

  const book = customers.filter((c) => {
    const a = resolveAssignment(c, indexedAssignments.byStripeId, indexedAssignments.byEmail);
    return ae ? a.ae === rep : a.csm === rep;
  });

  return book.map((c) => {
    const firstCashMonth = findFirstCashMonth(c, monthCols);
    let voiceAI = 0;
    let voiceAICash = 0;     // The cash basis the 10% was paid on
    let residual = 0;
    let latestMRR = 0;

    for (const m of monthCols) {
      const mrr = (c.monthly_mrr && c.monthly_mrr[m]) || 0;
      if (mrr > 0) latestMRR = mrr;

      const cash = cashForCommissionMonth(c, m, firstCashMonth);
      if (cash <= 0) continue;

      const effDate = c.start_date || m + "-01";
      const effCfg = resolveRepConfig(rep, effDate, indexedOverrides, config);
      const cap = ae ? effCfg.aeResidualMonths : effCfg.csmResidualMonths;
      const diff = monthDiff(c.start_date, m);
      if (cap != null && diff != null && diff >= cap) continue;

      if (ae) {
        if (m === firstCashMonth) {
          voiceAI += cash * effCfg.aeVoiceRate;
          voiceAICash += cash;
        } else {
          residual += netCashForResidual(c, m, firstCashMonth) * effCfg.aeResidualRate; // Phase 4.2: net of reversals
        }
      } else {
        // CSM earns nothing on the first cash month (initial CC is AE-only). Phase 4.2 base fix.
        if (m !== firstCashMonth) {
          residual += netCashForResidual(c, m, firstCashMonth) * effCfg.csmRate; // Phase 4.2: net of reversals
        }
      }
    }

    const matchedDeal = matchedDealsByCustomer ? matchedDealsByCustomer[c.stripe_customer_id] : null;

    return {
      customer: c,
      isMatched: !!matchedDeal,
      cashCollected: voiceAICash,
      voiceAICommission: voiceAI,
      residual,
      total: voiceAI + residual,
      latestMRR,
      startDate: c.start_date,
    };
  }).sort((a, b) => b.total - a.total);
}

// ============================================================
// CORE: per-customer-per-month for one rep (drill-down)
// ============================================================
// Same math, fully exploded per-customer per-month for the drill-down UI.
// Customers are included in a month's `customers` array if they contributed
// any commission OR if it's their first cash month (in case the user wants
// to see "this customer started here, $0 paid, $0 commission" entries).
// ============================================================
export function calcRepCommissionByCustomerByMonth(
  rep,
  customers,
  indexedAssignments,
  config,
  monthCols,
  indexedOverrides = null,
  matchedDealsByCustomer = null,
) {
  const ae = isAE(rep);

  const book = customers.filter((c) => {
    const a = resolveAssignment(c, indexedAssignments.byStripeId, indexedAssignments.byEmail);
    return ae ? a.ae === rep : a.csm === rep;
  });

  // Precompute firstCashMonth per customer
  const firstCashByCustomer = new Map();
  for (const c of book) {
    firstCashByCustomer.set(c.stripe_customer_id || c.email, findFirstCashMonth(c, monthCols));
  }

  const monthly = monthCols.map((m) => {
    let voiceAI = 0;
    let voiceAINetSales = 0;
    let aeResidual = 0;
    let csmResidual = 0;
    let newDeals = 0;
    let newMRR = 0;
    let bookMRR = 0;
    const customerLines = [];

    for (const c of book) {
      const customerKey = c.stripe_customer_id || c.email;
      const firstCashMonth = firstCashByCustomer.get(customerKey);

      const mrr = (c.monthly_mrr && c.monthly_mrr[m]) || 0;
      bookMRR += mrr;

      const cash = cashForCommissionMonth(c, m, firstCashMonth);

      // Skip silently if no cash this month
      if (cash <= 0) continue;

      const matchedDeal = matchedDealsByCustomer ? matchedDealsByCustomer[c.stripe_customer_id] : null;
      const effDate = c.start_date || m + "-01";
      const effCfg = resolveRepConfig(rep, effDate, indexedOverrides, config);
      const cap = ae ? effCfg.aeResidualMonths : effCfg.csmResidualMonths;
      const diff = monthDiff(c.start_date, m);
      const isPastCap = (cap != null && diff != null && diff >= cap);

      let cVoiceAI = 0;
      let cAeResidual = 0;
      let cCsmResidual = 0;
      let isFirstCashMonth = (m === firstCashMonth);

      if (!isPastCap) {
        if (ae) {
          if (isFirstCashMonth) {
            cVoiceAI = cash * effCfg.aeVoiceRate;
            voiceAI += cVoiceAI;
            voiceAINetSales += cash;
            newDeals += 1;
            newMRR += mrr;
          } else {
            cAeResidual = netCashForResidual(c, m, firstCashMonth) * effCfg.aeResidualRate; // Phase 4.2: net of reversals
            aeResidual += cAeResidual;
          }
        } else {
          // CSM earns nothing on the first cash month (initial CC is AE-only). Phase 4.2 base fix.
          if (!isFirstCashMonth) {
            cCsmResidual = netCashForResidual(c, m, firstCashMonth) * effCfg.csmRate; // Phase 4.2: net of reversals
            csmResidual += cCsmResidual;
          }
        }
      }

      const cTotal = cVoiceAI + cAeResidual + cCsmResidual;

      customerLines.push({
        customer: c,
        isMatched: !!matchedDeal,
        voiceAICommission: cVoiceAI,
        aeResidual: cAeResidual,
        csmResidual: cCsmResidual,
        cashCollected: isFirstCashMonth ? cash : 0,
        mrr,
        cashReceived: cash,
        total: cTotal,
        isStartMonth: isFirstCashMonth,
        isInPrepayWindow: false,  // Always false in Phase 4 (no prepay window)
        isPastResidualCap: isPastCap,
      });
    }

    // Sort customers by commission within the month, descending
    customerLines.sort((a, b) => b.total - a.total);

    return {
      month: m,
      newDeals,
      newMRR,
      voiceAINetSales,
      voiceAICommission: voiceAI,
      aeResidual,
      csmResidual,
      bookMRR,
      total: voiceAI + aeResidual + csmResidual,
      customers: customerLines,
    };
  });

  return { rep, isAE: ae, book, monthly };
}

// ------------------------------------------------------------
// Team Lead Override
// ------------------------------------------------------------
export function calcTeamLeadOverride(
  tlProfile,
  allProfiles,
  customers,
  indexedAssignments,
  config,
  monthCols,
  indexedOverrides = null,
  matchedDealsByCustomer = null,
) {
  if (!tlProfile || !tlProfile.is_team_lead) {
    return { totalOverride: 0, byReport: {}, monthly: monthCols.map((m) => ({ month: m, total: 0 })) };
  }
  const tlFirstName = (tlProfile.name || "").split(" ")[0];

  const reports = (allProfiles || []).filter((p) => {
    if (p.id === tlProfile.id) return false;
    if (p.role === "executive" || p.role_type === "coo" || p.role_type === "ceo" || p.role_type === "cto") return false;
    if (p.manager_id === tlProfile.id) return true;
    if (p.manager_id && p.manager_id !== tlProfile.id) return false;
    return tlProfile.team && p.team === tlProfile.team;
  });

  if (reports.length === 0) {
    return { totalOverride: 0, byReport: {}, monthly: monthCols.map((m) => ({ month: m, total: 0 })) };
  }

  const byReport = {};
  const monthlyTotals = monthCols.map((m) => ({ month: m, total: 0 }));

  for (const r of reports) {
    const repFirstName = (r.name || "").split(" ")[0];
    if (!repFirstName) continue;

    const reportCalc = calcRepCommission(
      repFirstName,
      customers,
      indexedAssignments,
      config,
      monthCols,
      indexedOverrides,
      matchedDealsByCustomer,
    );

    const reportBreakdown = { perMonth: [], total: 0 };

    for (let i = 0; i < monthCols.length; i++) {
      const m = monthCols[i];
      const reportTotalThisMonth = reportCalc.monthly[i]?.total || 0;
      if (reportTotalThisMonth === 0) {
        reportBreakdown.perMonth.push({ month: m, reportTotal: 0, overridePct: 0, override: 0 });
        continue;
      }

      const effCfg = resolveRepConfig(tlFirstName, m + "-01", indexedOverrides, config);
      const pct = effCfg.teamLeadOverridePct || 0;
      const overrideEarned = reportTotalThisMonth * pct;

      reportBreakdown.perMonth.push({
        month: m,
        reportTotal: reportTotalThisMonth,
        overridePct: pct,
        override: overrideEarned,
      });
      reportBreakdown.total += overrideEarned;
      monthlyTotals[i].total += overrideEarned;
    }

    if (reportBreakdown.total > 0) {
      byReport[repFirstName] = reportBreakdown;
    }
  }

  const totalOverride = monthlyTotals.reduce((s, m) => s + m.total, 0);
  return { totalOverride, byReport, monthly: monthlyTotals };
}

// ------------------------------------------------------------
// Accelerator (AE only) — unchanged from prior engine
// ------------------------------------------------------------
export function calcAccelerator(yearlyVariableComp, config) {
  const target = config.acceleratorTarget;
  const t120Mult = (config._source === "override" && config.accelerator120Multiplier != null)
    ? Number(config.accelerator120Multiplier) : 1.2;
  const t150Mult = (config._source === "override" && config.accelerator150Multiplier != null)
    ? Number(config.accelerator150Multiplier) : 1.5;
  const t120 = target * t120Mult;
  const t150 = target * t150Mult;
  let bonus = 0;
  let status = "below";
  if (yearlyVariableComp >= t150) {
    bonus = (t120 - target) * 0.5 + (yearlyVariableComp - t120) * 1.0;
    status = "2x";
  } else if (yearlyVariableComp >= t120) {
    bonus = (yearlyVariableComp - target) * 0.5;
    status = "1.5x";
  } else if (yearlyVariableComp >= target) {
    status = "ontarget";
  }
  return { target, t120, t150, bonus, status };
}

// ------------------------------------------------------------
// Per-customer lifetime AE projection (rough estimate for What-If)
// ------------------------------------------------------------
// Phase 4: this is informational only — used by the What-If projector
// to estimate "what could we earn from this customer if everything
// continues as today's MRR." Not a payout calculation.
export function aeCustomerLifetimeProjection(c, config, matchedDealsByCustomer = null) {
  const start = c.start_date ? c.start_date.slice(0, 7) : null;
  if (!start) return 0;
  const startMRR = (c.monthly_mrr && c.monthly_mrr[start]) || 0;
  // Estimate: 10% of one starting MRR (proxy for initial cash) +
  //           3% × MRR × (cap - 1) months of projected residual
  const initial = startMRR * config.aeVoiceRate;
  const residual = startMRR * config.aeResidualRate * (config.aeResidualMonths - 1);
  return initial + residual;
}

// ------------------------------------------------------------
// Project future months (What-If) — unchanged
// ------------------------------------------------------------
export function projectCustomers(customers, actualMonths, projMonths, method, growthAnnualPct) {
  const lastActual = actualMonths[actualMonths.length - 1];
  const monthlyGrowth = method === "growth" ? (growthAnnualPct / 100) / 12 : 0;
  return customers.map((c) => {
    const projected = { ...(c.monthly_mrr || {}) };
    let runRate = projected[lastActual] || 0;
    for (const m of projMonths) {
      if (projected[m] !== undefined && projected[m] > 0) {
        runRate = projected[m];
        continue;
      }
      if (method === "growth") runRate = runRate * (1 + monthlyGrowth);
      projected[m] = runRate;
    }
    return { ...c, monthly_mrr: projected };
  });
}

// ------------------------------------------------------------
// CSV parsing (Stripe MRR export) — unchanged
// ------------------------------------------------------------
export function parseStripeCSV(rows) {
  if (rows.length === 0) throw new Error("CSV is empty");
  const keys = Object.keys(rows[0]).map((k) => k.trim());

  const emailKey   = keys.find((k) => /^email/i.test(k));
  const nameKey    = keys.find((k) => /^(name|customer.?name)/i.test(k));
  const idKey      = keys.find((k) => /(stripe.?customer.?id|customer.?id|cus_id)/i.test(k));
  const startKey   = keys.find((k) => /(start.?date|created)/i.test(k));
  const endKey     = keys.find((k) => /(end.?date|canceled.?at|cancel)/i.test(k));
  if (!emailKey) throw new Error("No 'email' column found");

  const monthCols = keys.filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
  if (monthCols.length === 0) {
    throw new Error("No month columns found. Expected headers like '2025-05', '2025-06'.");
  }

  const customers = rows
    .filter((r) => r[emailKey])
    .map((r) => {
      const monthly_mrr = {};
      for (const m of monthCols) {
        monthly_mrr[m] = parseFloat(String(r[m] || "0").replace(/[$,]/g, "")) || 0;
      }
      const max_mrr = Math.max(0, ...Object.values(monthly_mrr));
      const start_date = r[startKey] ? String(r[startKey]).slice(0, 10) : null;
      const end_date   = r[endKey]   ? String(r[endKey]).slice(0, 10)   : null;
      return {
        stripe_customer_id: idKey ? String(r[idKey] || "").trim() || null : null,
        email: String(r[emailKey]).trim(),
        name: nameKey ? String(r[nameKey] || r[emailKey]).trim() : String(r[emailKey]).trim(),
        start_date,
        end_date,
        max_mrr,
        monthly_mrr,
        is_self_serve: max_mrr > 0 && max_mrr <= 100,
        is_ae_era: start_date ? start_date >= "2025-11" : false,
        is_active_ever: max_mrr > 0,
      };
    });

  return {
    meta: {
      month_cols: monthCols,
      generated_at: new Date().toISOString(),
      self_serve_max_mrr: 100,
      cutoff_date: "2025-11-01",
    },
    customers,
  };
}

// ------------------------------------------------------------
// Formatters
// ------------------------------------------------------------
export const fmtMoney = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const num = Number(n);
  const hasFraction = Math.abs(num - Math.round(num)) > 0.005;
  const opts = hasFraction
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 };
  return `$${num.toLocaleString("en-US", opts)}`;
};

export const fmtPct = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const pct = Number(n) * 100;
  const hasFraction = Math.abs(pct - Math.round(pct)) > 0.005;
  return `${pct.toLocaleString("en-US", hasFraction ? { minimumFractionDigits: 1, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}%`;
};

// ============================================================
// Phase 4.3: commission from manually-included one-off payments.
// ============================================================
// One-offs live in the oneoff_payments table and are INERT until an exec sets
// included_in_commission=true, assigns a rep, and types a manual rate
// (ae_commission_rate / csm_commission_rate, e.g. 0.10 = 10%). They are EXEMPT
// from the 12-month residual cap (an exec inclusion is a deliberate act), and
// commission is computed on cash NET of any refund, floored at $0.
//
// PURE + ADDITIVE: this does NOT touch calcRepCommission / *ByCustomer / *ByMonth.
// Nothing calls it until the Step 5 UI wires it in, so it cannot affect any
// existing number. The dashboard merges its output with the normal engine total.
export function calcOneoffCommissionByRep(rep, includedOneoffs, monthCols) {
  const ae = isAE(rep);
  const byMonth = Object.fromEntries(monthCols.map((m) => [m, 0]));
  const lines = [];
  for (const o of includedOneoffs || []) {
    // Safety: only ever count explicitly-included payments.
    if (!o || o.included_in_commission !== true) continue;
    const isThisRepAE = ae && o.assigned_ae === rep;
    const isThisRepCSM = !ae && o.assigned_csm === rep;
    if (!isThisRepAE && !isThisRepCSM) continue;
    // Manual per-payment rate the exec typed (not the config rate).
    const rate = Number(isThisRepAE ? o.ae_commission_rate : o.csm_commission_rate);
    if (!rate || rate <= 0) continue; // no rate set for this rep -> no commission
    const m = o.cash_month;
    if (!(m in byMonth)) continue; // outside the displayed month window
    const net = Math.max(0, Number(o.amount || 0) - Number(o.amount_refunded || 0));
    const commission = net * rate;
    byMonth[m] += commission;
    lines.push({ stripe_charge_id: o.stripe_charge_id, month: m, netCash: net, rate, commission });
  }
  const monthly = monthCols.map((m) => ({ month: m, oneoffCommission: Math.round(byMonth[m] * 100) / 100 }));
  const total = Math.round(monthly.reduce((s, r) => s + r.oneoffCommission, 0) * 100) / 100;
  return { rep, monthly, total, lines };
}
