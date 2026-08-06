/**
 * Sizing rubric — Build Brief Section 6.
 *
 * Two tiers:
 *   Tier 1  t-shirt size, applied at intake, fast and rough.
 *   Tier 2  person-days by role by phase, mandatory before Approved because
 *           t-shirt size alone cannot be tested against capacity *by role*.
 *
 * Complexity factors are applied as a visible, itemised uplift — never a
 * black-box multiplier, and never downward.
 */

import { PHASES, ROLES } from '../db/reference.js';

export { PHASES, ROLES };

/**
 * Uplift from the checked complexity factors.
 * Flat and additive to start with (Section 6) — refine once there is enough
 * estimate-vs-actual history to justify something cleverer.
 */
export function complexityUplift(factors) {
  const applied = factors.map((f) => ({
    key: f.key,
    label: f.label,
    uplift_pct: Number(f.uplift_pct) || 0,
  }));
  const totalUpliftPct = applied.reduce((sum, f) => sum + f.uplift_pct, 0);
  return {
    factors: applied,
    totalUpliftPct,
    multiplier: 1 + totalUpliftPct / 100,
  };
}

export function getComplexityFactors(db, demandItemId) {
  return db
    .prepare(
      `SELECT cf.key, cf.label, cf.uplift_pct, cf.description
         FROM demand_complexity_factor dcf
         JOIN complexity_factor cf ON cf.key = dcf.factor_key
        WHERE dcf.demand_item_id = ?
        ORDER BY cf.sort_order`
    )
    .all(demandItemId);
}

export function getTshirtBand(db, size) {
  if (!size) return null;
  return db.prepare('SELECT * FROM tshirt_band WHERE size = ?').get(size) || null;
}

/**
 * Full sizing picture for one demand item: Tier 1 band, Tier 2 grid, the
 * complexity arithmetic, and whether the two tiers agree with each other.
 */
export function sizeDemandItem(db, demandItemId) {
  const item = db.prepare('SELECT * FROM demand_item WHERE id = ?').get(demandItemId);
  if (!item) return null;

  const estimates = db
    .prepare(
      `SELECT role, phase, estimated_person_days
         FROM sizing_estimate WHERE demand_item_id = ?`
    )
    .all(demandItemId);

  const grid = {};
  for (const role of ROLES) {
    grid[role] = { role, phases: Object.fromEntries(PHASES.map((p) => [p, 0])), total: 0 };
  }
  for (const e of estimates) {
    if (!grid[e.role]) continue;
    grid[e.role].phases[e.phase] += e.estimated_person_days;
    grid[e.role].total += e.estimated_person_days;
  }

  const baselineTotal = Object.values(grid).reduce((sum, r) => sum + r.total, 0);
  const uplift = complexityUplift(getComplexityFactors(db, demandItemId));

  const byRole = {};
  const rows = [];
  for (const role of ROLES) {
    const baseline = grid[role].total;
    const adjusted = round1(baseline * uplift.multiplier);
    byRole[role] = adjusted;
    rows.push({
      role,
      phases: grid[role].phases,
      baselineDays: round1(baseline),
      adjustedDays: adjusted,
    });
  }

  const phaseTotals = Object.fromEntries(
    PHASES.map((p) => [p, round1(ROLES.reduce((s, r) => s + grid[r].phases[p], 0))])
  );

  const adjustedTotal = round1(baselineTotal * uplift.multiplier);
  const band = getTshirtBand(db, item.tshirt_size);

  return {
    demandItemId,
    tier1: {
      size: item.tshirt_size,
      band,
      // Tier 1 is a *cross-check* on Tier 2, not an input to capacity.
      consistency: checkTierConsistency(band, adjustedTotal, baselineTotal),
    },
    tier2: {
      rows,
      byRole,
      phaseTotals,
      baselineTotalDays: round1(baselineTotal),
      adjustedTotalDays: adjustedTotal,
      complete: baselineTotal > 0,
    },
    complexity: {
      ...uplift,
      baselineTotalDays: round1(baselineTotal),
      upliftDays: round1(adjustedTotal - baselineTotal),
      adjustedTotalDays: adjustedTotal,
    },
  };
}

/**
 * Does the detailed estimate land inside the band the t-shirt size implies?
 * A mismatch is surfaced, not auto-corrected — it usually means one of the two
 * is wrong and a human should look.
 */
function checkTierConsistency(band, adjustedTotal, baselineTotal) {
  if (!band || baselineTotal <= 0) {
    return { checked: false, agrees: null, message: null };
  }
  const min = band.effort_days_min;
  const max = band.effort_days_max;
  const below = min != null && adjustedTotal < min;
  const above = max != null && adjustedTotal > max;
  if (!below && !above) {
    return { checked: true, agrees: true, message: null };
  }
  const range = max == null ? `${min}+ person-days` : `${min}–${max} person-days`;
  return {
    checked: true,
    agrees: false,
    message:
      `Tier 2 total of ${adjustedTotal} person-days sits ${below ? 'below' : 'above'} ` +
      `the ${band.size} band (${range}). Re-check the t-shirt size or the detailed estimate.`,
  };
}

/** Adjusted person-days by role — the figure capacity math consumes. */
export function sizingByRole(db, demandItemId) {
  const sizing = sizeDemandItem(db, demandItemId);
  if (!sizing) return {};
  return sizing.tier2.byRole;
}

// ---------------------------------------------------------------------------
// Workflow gating (Section 5)
// ---------------------------------------------------------------------------

export const DEMAND_STATUSES = [
  'New', 'T-Shirt Sized', 'Triage', 'Approved', 'Rejected', 'Deferred',
];

/**
 * What a demand item still needs before it can move on. The Approved gate is
 * the important one: Section 6 makes Tier 2 sizing mandatory, not optional
 * detail, because that is what makes the capacity test possible at all.
 */
export function demandReadiness(db, demandItemId) {
  const item = db.prepare('SELECT * FROM demand_item WHERE id = ?').get(demandItemId);
  if (!item) return null;
  const sizing = sizeDemandItem(db, demandItemId);

  const blockers = {
    'T-Shirt Sized': item.tshirt_size ? [] : ['Set a Tier 1 t-shirt size.'],
    Triage: [
      ...(item.tshirt_size ? [] : ['Set a Tier 1 t-shirt size.']),
    ],
    Approved: [
      ...(item.tshirt_size ? [] : ['Set a Tier 1 t-shirt size.']),
      ...(sizing.tier2.complete
        ? []
        : ['Complete the Tier 2 role/phase estimate — required before approval.']),
      ...(item.indicative_start_date && item.indicative_end_date
        ? []
        : ['Set an indicative delivery window so the capacity impact can be placed in time.']),
    ],
    Rejected: [],
    Deferred: [],
    New: [],
  };

  return {
    status: item.status,
    canMoveTo: Object.fromEntries(
      DEMAND_STATUSES.map((s) => [s, { allowed: (blockers[s] || []).length === 0, blockers: blockers[s] || [] }])
    ),
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
