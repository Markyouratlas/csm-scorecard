// ============================================================
// Commission Engine — pure calculation functions
// ============================================================
// No React, no Supabase. All functions are deterministic and side-effect free.
// Used by CommissionsView.jsx (client display) and could be reused server-side.
//
// Math summary (per rep, per customer, per month):
//   AE:
//     Voice AI on the customer's start month (diff = 0):
//        - If a matched pending_deal exists: aeVoiceRate × deal.upfront_amount
//          (this is the "actual cash collected" path — source of truth)
//        - Else fallback: aeVoiceRate × (mrr × upfrontMultiplier)
//          (legacy proxy for customers seeded before pending_deals existed)
//
//     PREPAY WINDOW: The upfront cash covers `prepayMonths` of MRR.
//        - prepayMonths = round(upfront / startMRR)  for matched deals
//        - prepayMonths = upfrontMultiplier (default 3)  for legacy customers
//        - During the prepay window (1 <= diff < prepayMonths): NO residual.
//          AE already got paid 10% on the cash for these months via Voice AI.
//
//     RESIDUAL: aeResidualRate × monthly_cash_received[m] for months AFTER
//     the prepay window, capped at aeResidualMonths months from start_date.
//        - monthly_cash_received is sourced from Stripe paid invoices, NOT
//          subscription state. A customer who paid upfront and never renewed
//          will have cash_received = 0 in subsequent months → no residual.
//        - A customer who renews ($1,497 in Feb covering Feb/Mar/Apr) gets
//          residual = 3% × $1,497 = $44.91 in Feb (the renewal month).
//          No residual in Mar/Apr (no new cash arrived those months).
//        - For a 3-month prepay with no renewal: residual only fires if new
//          cash arrives in months 4-12 (which requires a renewal).
//        - "After the customer has been a customer for 12 months, no more
//          commission paid on this customer." — measured from start_date.
//        - BACKWARD-COMPAT: if monthly_cash_received is empty (sync hasn't
//          populated it yet), falls back to MRR-based residual.
//
//   CSM:
//     Any month with mrr > 0:    csmRate × monthly_cash_received[m]
//     (Optional CSM cap by csmResidualMonths if specified)
//     (Same cash-based logic as AE residual; falls back to MRR if needed)
//
//   Accelerator (AE only, annual variable comp):
//     yearTotal >= target            → status = ontarget
//     yearTotal >= target × 1.20     → status = 1.5x,
//                                       bonus = (yearTotal - target) × 0.5
//     yearTotal >= target × 1.50     → status = 2x,
//                                       bonus = (target × 0.20 × 0.5) + (yearTotal - target × 1.20) × 1.0
//
//   Team-Lead override (new):
//     For each team lead T with team_lead_override_pct > 0:
//       For each report R (where R.manager_id = T OR (R.team = T.team AND R != T)):
//         For each of R's deals/months at date D:
//           T earns:  T.team_lead_override_pct(at D) × R.totalCommission(at D)
//
// Effective dating:
//   Each rep can have a history of override rows in commission_rep_overrides.
//   At a given deal date D, the engine uses the row with the LATEST
//   effective_date <= D. NULL fields in that row fall back to defaults.
// ============================================================

export const REPS = {
  AE: ["Heather", "Mason"],
  CSM: ["Matt", "Sean", "Noah"],
};
export const ALL_REPS = [...REPS.AE, ...REPS.CSM];
export const isAE = (rep) => REPS.AE.includes(rep);
export const isCSM = (rep) => REPS.CSM.includes(rep);

export const DEFAULT_CONFIG = {
  aeVoiceRate: 0.10,
  upfrontMultiplier: 3,
  aeResidualRate: 0.03,
  aeResidualMonths: 12,
  csmRate: 0.03,
  csmResidualMonths: null,  // null = no cap (legacy CSM behavior)
  acceleratorTarget: 60000,
  // Legacy field names kept for backward compatibility with the existing
  // commission_config row. calcAccelerator() ignores these defaults and uses
  // hardcoded 1.2/1.5 threshold multipliers; only override rows can change them
  // (via accel_1_5x_pct and accel_2x_pct columns on commission_rep_overrides).
  accelerator120Multiplier: 1.5,
  accelerator150Multiplier: 2.0,
  selfServeMaxMrr: 100,
  aeEraStartDate: "2025-11-01",
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
    csmResidualMonths: applicable.csm_residual_months != null ? Number(applicable.csm_residual_months) : null,
    acceleratorTarget: applicable.accelerator_target != null ? Number(applicable.accelerator_target) : base.acceleratorTarget,
    accelerator120Multiplier: applicable.accel_1_5x_pct != null ? Number(applicable.accel_1_5x_pct) : base.accelerator120Multiplier,
    accelerator150Multiplier: applicable.accel_2x_pct != null ? Number(applicable.accel_2x_pct) : base.accelerator150Multiplier,
    teamLeadOverridePct: applicable.team_lead_override_pct != null ? Number(applicable.team_lead_override_pct) : 0,
    upfrontMultiplier: base.upfrontMultiplier,
    selfServeMaxMrr:   base.selfServeMaxMrr,
    aeEraStartDate:    base.aeEraStartDate,
    _source: "override",
    _effective_date: applicable.effective_date,
  };
}

// ------------------------------------------------------------
// Pending deals lookup
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

// ------------------------------------------------------------
// Per-rep commission calculation
// ------------------------------------------------------------
export function calcRepCommission(
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

  const monthly = monthCols.map((m) => {
    let voiceAI = 0;
    let voiceAINetSales = 0;
    let aeResidual = 0;
    let csmResidual = 0;
    let newDeals = 0;
    let newMRR = 0;
    let bookMRR = 0;

    for (const c of book) {
      const mrr = (c.monthly_mrr && c.monthly_mrr[m]) || 0;
      const cashReceived = (c.monthly_cash_received && c.monthly_cash_received[m]) || 0;
      if (mrr <= 0 && cashReceived <= 0) continue;
      bookMRR += mrr;

      if (ae) {
        const diff = monthDiff(c.start_date, m);

        const matchedDeal = matchedDealsByCustomer ? matchedDealsByCustomer[c.stripe_customer_id] : null;
        const effectiveAtDate = (matchedDeal?.closed_date) || c.start_date || m + "-01";
        const effCfg = resolveRepConfig(rep, effectiveAtDate, indexedOverrides, config);

        const startKey = c.start_date ? c.start_date.slice(0, 7) : null;
        const startMRR = (startKey && c.monthly_mrr && c.monthly_mrr[startKey]) || 0;
        let prepayMonths = effCfg.upfrontMultiplier || 3;
        if (matchedDeal && Number(matchedDeal.upfront_amount) > 0 && startMRR > 0) {
          prepayMonths = Math.max(1, Math.round(Number(matchedDeal.upfront_amount) / startMRR));
        }

        if (diff === 0) {
          let cashCollected;
          if (matchedDeal && Number(matchedDeal.upfront_amount) > 0) {
            cashCollected = Number(matchedDeal.upfront_amount);
          } else {
            cashCollected = mrr * effCfg.upfrontMultiplier;
          }
          voiceAINetSales += cashCollected;
          voiceAI += cashCollected * effCfg.aeVoiceRate;
          newDeals += 1;
          newMRR += mrr;
        } else if (diff !== null && diff >= prepayMonths && diff < effCfg.aeResidualMonths) {
          const cashSourceExists = c.monthly_cash_received &&
            Object.keys(c.monthly_cash_received).length > 0;
          const residualBase = cashSourceExists ? cashReceived : mrr;
          if (residualBase > 0) {
            aeResidual += residualBase * effCfg.aeResidualRate;
          }
        }
      } else {
        const effCfg = resolveRepConfig(rep, c.start_date || m + "-01", indexedOverrides, config);
        const csmCap = effCfg.csmResidualMonths;
        let csmEligible = true;
        if (csmCap != null && c.start_date) {
          const diff = monthDiff(c.start_date, m);
          if (diff != null && diff >= csmCap) csmEligible = false;
        }
        if (csmEligible) {
          const cashSourceExists = c.monthly_cash_received &&
            Object.keys(c.monthly_cash_received).length > 0;
          const residualBase = cashSourceExists ? cashReceived : mrr;
          if (residualBase > 0) {
            csmResidual += residualBase * effCfg.csmRate;
          }
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

// ------------------------------------------------------------
// Per-customer breakdown for one rep (YTD totals)
// ------------------------------------------------------------
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
    let voiceAI = 0;
    let voiceAICash = 0;
    let residual = 0;
    let latestMRR = 0;

    for (const m of monthCols) {
      const mrr = (c.monthly_mrr && c.monthly_mrr[m]) || 0;
      const cashReceived = (c.monthly_cash_received && c.monthly_cash_received[m]) || 0;
      if (mrr > 0) latestMRR = mrr;
      if (mrr <= 0 && cashReceived <= 0) continue;

      if (ae) {
        const diff = monthDiff(c.start_date, m);
        const matchedDeal = matchedDealsByCustomer ? matchedDealsByCustomer[c.stripe_customer_id] : null;
        const effectiveAtDate = (matchedDeal?.closed_date) || c.start_date || m + "-01";
        const effCfg = resolveRepConfig(rep, effectiveAtDate, indexedOverrides, config);

        const startKey = c.start_date ? c.start_date.slice(0, 7) : null;
        const startMRR = (startKey && c.monthly_mrr && c.monthly_mrr[startKey]) || 0;
        let prepayMonths = effCfg.upfrontMultiplier || 3;
        if (matchedDeal && Number(matchedDeal.upfront_amount) > 0 && startMRR > 0) {
          prepayMonths = Math.max(1, Math.round(Number(matchedDeal.upfront_amount) / startMRR));
        }

        if (diff === 0) {
          let cash;
          if (matchedDeal && Number(matchedDeal.upfront_amount) > 0) {
            cash = Number(matchedDeal.upfront_amount);
          } else {
            cash = mrr * effCfg.upfrontMultiplier;
          }
          voiceAICash += cash;
          voiceAI += cash * effCfg.aeVoiceRate;
        } else if (diff !== null && diff >= prepayMonths && diff < effCfg.aeResidualMonths) {
          const cashSourceExists = c.monthly_cash_received &&
            Object.keys(c.monthly_cash_received).length > 0;
          const residualBase = cashSourceExists ? cashReceived : mrr;
          if (residualBase > 0) {
            residual += residualBase * effCfg.aeResidualRate;
          }
        }
      } else {
        const effCfg = resolveRepConfig(rep, c.start_date || m + "-01", indexedOverrides, config);
        const csmCap = effCfg.csmResidualMonths;
        let csmEligible = true;
        if (csmCap != null && c.start_date) {
          const diff = monthDiff(c.start_date, m);
          if (diff != null && diff >= csmCap) csmEligible = false;
        }
        if (csmEligible) {
          const cashSourceExists = c.monthly_cash_received &&
            Object.keys(c.monthly_cash_received).length > 0;
          const residualBase = cashSourceExists ? cashReceived : mrr;
          if (residualBase > 0) {
            residual += residualBase * effCfg.csmRate;
          }
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

// ------------------------------------------------------------
// Per-customer breakdown PER MONTH — Phase 3 (drill-down)
// ------------------------------------------------------------
// Returns the same math as calcRepCommission, but instead of collapsing
// customers into monthly totals, it keeps each customer's contribution
// per month visible. This is the data layer for the drill-down UI: each
// month row in the table can expand to show "which customers drove this
// month's number for this rep."
//
// Returns:
//   {
//     rep, isAE, book,
//     monthly: [
//       {
//         month: "2026-02",
//         total, voiceAICommission, aeResidual, csmResidual,
//         newDeals, newMRR, voiceAINetSales, bookMRR,
//         customers: [
//           {
//             customer: { ...customer fields including subscriptions, current_period_end },
//             isMatched: boolean,
//             voiceAICommission: number,    // this month from this customer
//             aeResidual: number,            // this month from this customer
//             csmResidual: number,           // this month from this customer
//             cashCollected: number,         // upfront cash if start month
//             mrr: number,                   // MRR this month
//             cashReceived: number,          // cash received this month
//             total: number,
//             isStartMonth: boolean,         // is this customer's first month?
//             isInPrepayWindow: boolean,     // covered by upfront, no residual
//             isPastResidualCap: boolean,    // past 12mo cap (or csm cap)
//           },
//           ...
//         ]
//       },
//       ...
//     ]
//   }
// ------------------------------------------------------------
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
      const mrr = (c.monthly_mrr && c.monthly_mrr[m]) || 0;
      const cashReceived = (c.monthly_cash_received && c.monthly_cash_received[m]) || 0;
      if (mrr <= 0 && cashReceived <= 0) continue;
      bookMRR += mrr;

      const matchedDeal = matchedDealsByCustomer ? matchedDealsByCustomer[c.stripe_customer_id] : null;

      let cVoiceAI = 0;
      let cVoiceAICash = 0;
      let cAeResidual = 0;
      let cCsmResidual = 0;
      let isStartMonth = false;
      let isInPrepayWindow = false;
      let isPastResidualCap = false;

      if (ae) {
        const diff = monthDiff(c.start_date, m);
        const effectiveAtDate = (matchedDeal?.closed_date) || c.start_date || m + "-01";
        const effCfg = resolveRepConfig(rep, effectiveAtDate, indexedOverrides, config);

        const startKey = c.start_date ? c.start_date.slice(0, 7) : null;
        const startMRR = (startKey && c.monthly_mrr && c.monthly_mrr[startKey]) || 0;
        let prepayMonths = effCfg.upfrontMultiplier || 3;
        if (matchedDeal && Number(matchedDeal.upfront_amount) > 0 && startMRR > 0) {
          prepayMonths = Math.max(1, Math.round(Number(matchedDeal.upfront_amount) / startMRR));
        }

        if (diff === 0) {
          isStartMonth = true;
          if (matchedDeal && Number(matchedDeal.upfront_amount) > 0) {
            cVoiceAICash = Number(matchedDeal.upfront_amount);
          } else {
            cVoiceAICash = mrr * effCfg.upfrontMultiplier;
          }
          cVoiceAI = cVoiceAICash * effCfg.aeVoiceRate;
          voiceAINetSales += cVoiceAICash;
          voiceAI += cVoiceAI;
          newDeals += 1;
          newMRR += mrr;
        } else if (diff !== null && diff >= 1 && diff < prepayMonths) {
          isInPrepayWindow = true;
        } else if (diff !== null && diff >= prepayMonths && diff < effCfg.aeResidualMonths) {
          const cashSourceExists = c.monthly_cash_received &&
            Object.keys(c.monthly_cash_received).length > 0;
          const residualBase = cashSourceExists ? cashReceived : mrr;
          if (residualBase > 0) {
            cAeResidual = residualBase * effCfg.aeResidualRate;
            aeResidual += cAeResidual;
          }
        } else if (diff !== null && diff >= effCfg.aeResidualMonths) {
          isPastResidualCap = true;
        }
      } else {
        // CSM
        const effCfg = resolveRepConfig(rep, c.start_date || m + "-01", indexedOverrides, config);
        const csmCap = effCfg.csmResidualMonths;
        let csmEligible = true;
        if (csmCap != null && c.start_date) {
          const diff = monthDiff(c.start_date, m);
          if (diff != null && diff >= csmCap) {
            csmEligible = false;
            isPastResidualCap = true;
          }
        }
        if (csmEligible) {
          const cashSourceExists = c.monthly_cash_received &&
            Object.keys(c.monthly_cash_received).length > 0;
          const residualBase = cashSourceExists ? cashReceived : mrr;
          if (residualBase > 0) {
            cCsmResidual = residualBase * effCfg.csmRate;
            csmResidual += cCsmResidual;
          }
        }
      }

      const cTotal = cVoiceAI + cAeResidual + cCsmResidual;

      // Only include customer line if they contributed something OR they're
      // relevant context (in prepay window, past cap, start month with $0).
      // This keeps the drill-down focused on commission-relevant customers.
      if (cTotal > 0 || isStartMonth || isInPrepayWindow) {
        customerLines.push({
          customer: c,
          isMatched: !!matchedDeal,
          voiceAICommission: cVoiceAI,
          aeResidual: cAeResidual,
          csmResidual: cCsmResidual,
          cashCollected: cVoiceAICash,
          mrr,
          cashReceived,
          total: cTotal,
          isStartMonth,
          isInPrepayWindow,
          isPastResidualCap,
        });
      }
    }

    // Sort customers within the month by their commission amount, descending.
    // Customers with $0 (prepay window) sink to the bottom but still visible.
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
// Accelerator (AE only)
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
// Per-customer lifetime AE projection
// ------------------------------------------------------------
export function aeCustomerLifetimeProjection(c, config, matchedDealsByCustomer = null) {
  const start = c.start_date ? c.start_date.slice(0, 7) : null;
  if (!start) return 0;
  const startMRR = (c.monthly_mrr && c.monthly_mrr[start]) || 0;

  const matchedDeal = matchedDealsByCustomer ? matchedDealsByCustomer[c.stripe_customer_id] : null;
  const cash = (matchedDeal && Number(matchedDeal.upfront_amount) > 0)
    ? Number(matchedDeal.upfront_amount)
    : startMRR * config.upfrontMultiplier;

  const initial = cash * config.aeVoiceRate;
  const residual = startMRR * config.aeResidualRate * (config.aeResidualMonths - 1);
  return initial + residual;
}

// ------------------------------------------------------------
// Project future months
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
// CSV parsing
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
