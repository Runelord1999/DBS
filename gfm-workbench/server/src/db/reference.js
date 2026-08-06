/**
 * Reference / configuration data.
 *
 * These rows are NOT demo data — a production database needs them too. They are
 * installed idempotently on every boot, and every value here is admin-editable
 * through the API. Each one that the Build Brief flags as a placeholder
 * (Section 13) carries `calibrated = 0` or says so in its description, so the
 * UI can show that the number has not been validated yet.
 */

export const ASSUMPTIONS = [
  {
    key: 'capacity.effective_days_per_year',
    value: '200',
    label: 'Effective delivery days per person per year',
    unit: 'days',
    description:
      'PLACEHOLDER (Section 13). Working days minus leave, public holidays, ' +
      'training and BAU buffer. Replace with the real GFM number before ' +
      'capacity output is quoted to the PSC.',
  },
  {
    key: 'capacity.working_days_per_week',
    value: '5',
    label: 'Working days per week',
    unit: 'days',
    description: 'Used to convert calendar periods into working days.',
  },
  {
    key: 'fiscal_year.start_month',
    value: '1',
    label: 'Fiscal year start month (1 = January)',
    unit: 'month',
    description:
      'PLACEHOLDER (Section 13). Drives budget period rollups and the ' +
      'quarter labels on the capacity screen.',
  },
  {
    key: 'psc.threshold_amount',
    value: '3000000',
    label: 'PSC governance threshold',
    unit: 'SGD',
    description: 'Projects at or above this budget are PSC-governed.',
  },
  {
    key: 'capacity.amber_threshold_pct',
    value: '85',
    label: 'Capacity amber threshold',
    unit: '%',
    description: 'Utilisation at or above this is flagged amber.',
  },
  {
    key: 'capacity.red_threshold_pct',
    value: '100',
    label: 'Capacity red threshold',
    unit: '%',
    description: 'Utilisation at or above this is a breach of the ceiling.',
  },
  {
    key: 'currency.default',
    value: 'SGD',
    label: 'Default reporting currency',
    unit: null,
    description: 'Single-currency reporting for v1.',
  },
];

/** Section 6, Tier 1. Ranges are a starting guess, not a validated model. */
export const TSHIRT_BANDS = [
  {
    size: 'S', sort_order: 1,
    duration_label: '< 1 month',
    amount_min: 0, amount_max: 100000, amount_label: '< $100k, no PSC',
    systems_label: '1 system, no dependency',
    effort_days_min: 5, effort_days_max: 20,
  },
  {
    size: 'M', sort_order: 2,
    duration_label: '1–3 months',
    amount_min: 100000, amount_max: 1000000, amount_label: '$100k – $1m',
    systems_label: '1–2 systems',
    effort_days_min: 20, effort_days_max: 60,
  },
  {
    size: 'L', sort_order: 3,
    duration_label: '3–6 months',
    amount_min: 1000000, amount_max: 3000000,
    amount_label: '$1m – $3m (approaching PSC threshold)',
    systems_label: 'Multiple systems / streams',
    effort_days_min: 60, effort_days_max: 150,
  },
  {
    size: 'XL', sort_order: 4,
    duration_label: '6+ months',
    amount_min: 3000000, amount_max: null, amount_label: '≥ $3m (PSC-governed)',
    systems_label: 'Cross-team, regulatory, multiple platforms',
    effort_days_min: 150, effort_days_max: null,
  },
];

/** Section 6. Flat uplift per checked factor, refine against estimate-vs-actual. */
export const COMPLEXITY_FACTORS = [
  {
    key: 'new_platform', sort_order: 1, uplift_pct: 15,
    label: 'New system / platform',
    description: 'Building on something new rather than extending what exists.',
  },
  {
    key: 'regulatory', sort_order: 2, uplift_pct: 15,
    label: 'Regulatory / compliance driver',
    description: 'Adds analysis, evidencing and governance overhead.',
  },
  {
    key: 'cross_border', sort_order: 3, uplift_pct: 10,
    label: 'Cross-border / multi-entity',
    description: 'Multiple locations or legal entities in scope.',
  },
  {
    key: 'vendor_dependency', sort_order: 4, uplift_pct: 10,
    label: 'Third-party / vendor dependency',
    description: 'Delivery depends on an external party’s schedule.',
  },
  {
    key: 'domain_unfamiliarity', sort_order: 5, uplift_pct: 10,
    label: 'Team unfamiliar with the domain',
    description: 'Learning curve before the team is productive.',
  },
];

/** Section 13: replace with the streams GFM actually tracks. */
export const RAG_STREAMS = [
  { key: 'tech_delivery', label: 'Tech delivery', sort_order: 1 },
  { key: 'business_requirements', label: 'Business requirements', sort_order: 2 },
  { key: 'uat', label: 'UAT', sort_order: 3 },
  { key: 'vendor', label: 'Vendor', sort_order: 4 },
  { key: 'budget', label: 'Budget', sort_order: 5 },
  { key: 'resourcing', label: 'Resourcing', sort_order: 6 },
  { key: 'regulatory', label: 'Regulatory / compliance', sort_order: 7 },
];

export const ROLES = ['PM', 'Biz Lead', 'Tech Lead', 'Developer', 'Tester', 'Tech BA'];
export const PHASES = ['Discovery', 'Build', 'Test', 'Deploy'];
export const PHASE_LABELS = {
  Discovery: 'Discovery / Analysis',
  Build: 'Build / Design',
  Test: 'Test / UAT',
  Deploy: 'Deploy / Warranty',
};

export function installReferenceData(db) {
  const assumption = db.prepare(
    `INSERT INTO assumption (key, value, label, description, unit)
     VALUES (@key, @value, @label, @description, @unit)
     ON CONFLICT(key) DO UPDATE SET label = @label, description = @description,
       unit = @unit`
  );
  const band = db.prepare(
    `INSERT INTO tshirt_band (size, sort_order, duration_label, amount_min,
       amount_max, amount_label, systems_label, effort_days_min, effort_days_max)
     VALUES (@size, @sort_order, @duration_label, @amount_min, @amount_max,
       @amount_label, @systems_label, @effort_days_min, @effort_days_max)
     ON CONFLICT(size) DO NOTHING`
  );
  const factor = db.prepare(
    `INSERT INTO complexity_factor (key, label, uplift_pct, description, sort_order)
     VALUES (@key, @label, @uplift_pct, @description, @sort_order)
     ON CONFLICT(key) DO UPDATE SET label = @label, description = @description,
       sort_order = @sort_order`
  );
  const stream = db.prepare(
    `INSERT INTO rag_stream (key, label, sort_order)
     VALUES (@key, @label, @sort_order)
     ON CONFLICT(key) DO UPDATE SET label = @label, sort_order = @sort_order`
  );

  db.transaction(() => {
    for (const a of ASSUMPTIONS) assumption.run(a);
    for (const b of TSHIRT_BANDS) band.run(b);
    for (const f of COMPLEXITY_FACTORS) factor.run(f);
    for (const s of RAG_STREAMS) stream.run(s);
  })();
}

/** Assumption reader with a typed fallback, so callers never see a bare string. */
export function readAssumptions(db) {
  const rows = db.prepare('SELECT key, value FROM assumption').all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const num = (k, fallback) => {
    const v = Number(map[k]);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    effectiveDaysPerYear: num('capacity.effective_days_per_year', 200),
    workingDaysPerWeek: num('capacity.working_days_per_week', 5),
    fiscalYearStartMonth: num('fiscal_year.start_month', 1),
    pscThreshold: num('psc.threshold_amount', 3_000_000),
    amberThresholdPct: num('capacity.amber_threshold_pct', 85),
    redThresholdPct: num('capacity.red_threshold_pct', 100),
    defaultCurrency: map['currency.default'] || 'SGD',
  };
}
