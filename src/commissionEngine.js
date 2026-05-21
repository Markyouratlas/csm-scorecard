// ============================================================
// Commission Engine — pure calculation functions
// ============================================================
// No React, no Supabase. All functions are deterministic and side-effect free.
// Used by CommissionsView.jsx (client display) and could be reused server-side.
//
// Math summary:
//   AE per-customer per-month:
//     start month (diff == 0):  aeVoiceRate × (mrr × upfrontMultiplier)
//     months 1..(cap-1):        aeResidualRate × mrr
//     month >= cap:             0
//   CSM per-customer per-month:
//     any month with mrr > 0:   csmRate × mrr
//   Accelerator (AE only, annual):
//     yearTotal >= target            → status = ontarget
//     yearTotal >= target × 1.20     → status = 1.5x, bonus = (yearTotal - target) × 0.5
//     yearTotal >= target × 1.50     → status = 2x,
//                                       bonus = (target × 0.20 × 0.5) + (yearTotal - target × 1.20) × 1.0
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
  acceleratorTarget: 60000,
  accelerator120Multiplier: 1.5,
  accelerator150Multiplier: 2.0,
  selfServeMaxMrr: 100,
  aeEraStartDate: "2025-11-01",
};

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
// Resolving "this customer is assigned to which rep"
// ------------------------------------------------------------
// `assignments` is a map keyed by either stripe_customer_id (preferred) or
// lowercased email (fallback). We try stripe_customer_id first.
export function resolveAssignment(customer, assignmentsByStripeId, assignmentsByEmail) {
  if (customer.stripe_customer_id && assignmentsByStripeId[customer.stripe_customer_id]) {
    return assignmentsByStripeId[customer.stripe_customer_id];
  }
  if (customer.email && assignmentsByEmail[customer.email.toLowerCase()]) {
    return assignmentsByEmail[customer.email.toLowerCase()];
  }
  return { ae: null, csm: null };
}

// Pre-bucket assignment list into the two lookup maps.
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
export function calcRepCommission(rep, customers, indexedAssignments, config, monthCols) {
  const ae = isAE(rep);

  // Filter customers in this rep's book.
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
      if (mrr <= 0) continue;
      bookMRR += mrr;

      if (ae) {
        const diff = monthDiff(c.start_date, m);
        if (diff === 0) {
          const cashCollected = mrr * config.upfrontMultiplier;
          voiceAINetSales += cashCollected;
          voiceAI += cashCollected * config.aeVoiceRate;
          newDeals += 1;
          newMRR += mrr;
        } else if (diff !== null && diff >= 1 && diff < config.aeResidualMonths) {
          aeResidual += mrr * config.aeResidualRate;
        }
      } else {
        csmResidual += mrr * config.csmRate;
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
// Accelerator (AE only)
// ------------------------------------------------------------
export function calcAccelerator(yearlyVariableComp, config) {
  const target = config.acceleratorTarget;
  const t120 = target * 1.2;
  const t150 = target * 1.5;
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
// Per-customer lifetime AE projection (for book display)
// ------------------------------------------------------------
export function aeCustomerLifetimeProjection(c, config) {
  const start = c.start_date ? c.start_date.slice(0, 7) : null;
  if (!start) return 0;
  const startMRR = (c.monthly_mrr && c.monthly_mrr[start]) || 0;
  const initial = startMRR * config.upfrontMultiplier * config.aeVoiceRate;
  const residual = startMRR * config.aeResidualRate * (config.aeResidualMonths - 1);
  return initial + residual;
}

// ------------------------------------------------------------
// Project future months by extending the last actual MRR forward.
// Used by the Annualize tab.
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
// CSV parsing — Stripe MRR exports, flexible column matching
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
  return `$${Math.round(n).toLocaleString("en-US")}`;
};
export const fmtPct = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
};
