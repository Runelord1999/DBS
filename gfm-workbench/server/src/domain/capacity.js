/**
 * Capacity & book-of-work model — Build Brief Section 4.
 *
 * This is the mechanic the whole tool exists for. The output of
 * `computeCapacity` is what the PSC gets shown when the answer to "can we take
 * this on" needs to be a number rather than an opinion.
 *
 * The model, restated so it can be argued with:
 *
 *   1. Each active Person has an effective capacity of N delivery days a year
 *      (default 200 — a placeholder, see Section 13). Per-person overrides win
 *      over the global assumption.
 *   2. Capacity(role, period) = Σ effective days of active people in that role,
 *      pro-rated onto the period by working days.
 *   3. Committed demand(role, period) = Σ allocation_pct × effective days over
 *      the overlap of each allocation with the period.
 *   4. Utilisation = demand ÷ capacity. Above 100% is a breach of the ceiling.
 *   5. Pipeline demand — sized but not yet approved items — is reported as a
 *      separate band so "what we have already committed to" and "what is coming
 *      at us" never get silently merged.
 *
 * Both capacity and demand are scaled by the same effective-days factor, so a
 * 1.0 FTE allocation for a full year consumes exactly one person-year.
 */

import { readAssumptions, ROLES } from '../db/reference.js';
import {
  buildPeriods, defaultWindow, effectiveDays, overlap, toIso,
} from './periods.js';
import { sizeDemandItem } from './sizing.js';

/** Demand items that are in the pipeline but not yet committed. */
export const PIPELINE_STATUSES = ['New', 'T-Shirt Sized', 'Triage'];

/**
 * Project statuses whose allocations count as committed demand.
 *
 * ASSUMPTION (confirm — docs/ASSUMPTIONS.md): on-hold projects are excluded by
 * default, on the basis that paused work is not consuming effort this quarter.
 * The UI exposes a toggle because the opposite argument — that the team is
 * still nominally held — is also reasonable.
 */
export const DEFAULT_PROJECT_STATUSES = ['active'];

export function computeCapacity(db, options = {}) {
  const assumptions = readAssumptions(db);
  const {
    granularity = 'quarter',
    roles = ROLES,
    includePipeline = true,
    projectStatuses = DEFAULT_PROJECT_STATUSES,
  } = options;

  const fallbackWindow = defaultWindow(new Date(), assumptions.fiscalYearStartMonth);
  const from = options.from || fallbackWindow.from;
  const to = options.to || fallbackWindow.to;

  const periods = buildPeriods(from, to, granularity, assumptions.fiscalYearStartMonth);
  const roleSet = new Set(roles);
  const wdpw = assumptions.workingDaysPerWeek;

  // --- 1. Supply -----------------------------------------------------------
  const people = db
    .prepare(
      `SELECT id, name, role, effective_days_per_year
         FROM person WHERE active = 1`
    )
    .all();

  const capacity = blankGrid(roles, periods);
  const headcount = Object.fromEntries(roles.map((r) => [r, 0]));

  for (const person of people) {
    if (!roleSet.has(person.role)) continue;
    headcount[person.role] += 1;
    const perYear = person.effective_days_per_year ?? assumptions.effectiveDaysPerYear;
    for (const period of periods) {
      capacity[person.role][period.key] += effectiveDays(period.start, period.end, perYear, wdpw);
    }
  }

  // --- 2. Committed demand -------------------------------------------------
  const statusPlaceholders = projectStatuses.map(() => '?').join(',');
  const allocations = db
    .prepare(
      `SELECT ra.id, ra.role, ra.allocation_pct, ra.start_date, ra.end_date,
              ra.person_id, ra.project_id, p.name AS project_name
         FROM resource_allocation ra
         JOIN project p ON p.id = ra.project_id
        WHERE p.status IN (${statusPlaceholders})
          AND ra.start_date <= ? AND ra.end_date >= ?`
    )
    .all(...projectStatuses, to, from);

  const allocated = blankGrid(roles, periods);
  for (const alloc of allocations) {
    if (!roleSet.has(alloc.role)) continue;
    for (const period of periods) {
      const slice = overlap(alloc.start_date, alloc.end_date, period.start, period.end);
      if (!slice) continue;
      allocated[alloc.role][period.key] +=
        alloc.allocation_pct *
        effectiveDays(slice.start, slice.end, assumptions.effectiveDaysPerYear, wdpw);
    }
  }

  // --- 3. Pipeline demand --------------------------------------------------
  const pipeline = blankGrid(roles, periods);
  const pipelineDetail = { scheduled: [], unscheduled: [], unsized: [] };

  if (includePipeline) {
    const items = db
      .prepare(
        `SELECT id, title, status, tshirt_size, indicative_start_date, indicative_end_date
           FROM demand_item
          WHERE status IN (${PIPELINE_STATUSES.map(() => '?').join(',')})`
      )
      .all(...PIPELINE_STATUSES);

    for (const item of items) {
      const sizing = sizeDemandItem(db, item.id);
      const sized = sizing && sizing.tier2.complete;
      const scheduled = Boolean(item.indicative_start_date && item.indicative_end_date);

      if (!sized) {
        // No Tier 2 breakdown means no role split — reporting it against a role
        // would be a fabricated number. It is surfaced as unsized instead.
        const band = sizing?.tier1?.band;
        pipelineDetail.unsized.push({
          id: item.id,
          title: item.title,
          status: item.status,
          tshirt_size: item.tshirt_size,
          indicativeDaysMin: band?.effort_days_min ?? null,
          indicativeDaysMax: band?.effort_days_max ?? null,
          reason: 'No Tier 2 role/phase estimate yet — cannot be placed against a role.',
        });
        continue;
      }
      if (!scheduled) {
        pipelineDetail.unscheduled.push({
          id: item.id,
          title: item.title,
          status: item.status,
          tshirt_size: item.tshirt_size,
          totalDays: sizing.tier2.adjustedTotalDays,
          reason: 'No indicative delivery window — cannot be placed in a period.',
        });
        continue;
      }

      const spread = spreadOverPeriods(
        sizing.tier2.byRole, item.indicative_start_date, item.indicative_end_date,
        periods, assumptions, wdpw
      );
      for (const role of roles) {
        for (const period of periods) {
          pipeline[role][period.key] += spread[role]?.[period.key] || 0;
        }
      }
      pipelineDetail.scheduled.push({
        id: item.id,
        title: item.title,
        status: item.status,
        tshirt_size: item.tshirt_size,
        totalDays: sizing.tier2.adjustedTotalDays,
        window: { from: item.indicative_start_date, to: item.indicative_end_date },
      });
    }
  }

  // --- 4. Assemble ---------------------------------------------------------
  const breaches = [];
  const roleRows = roles.map((role) => {
    const periodRows = periods.map((period) => {
      const cap = capacity[role][period.key];
      const alloc = allocated[role][period.key];
      const pipe = pipeline[role][period.key];
      const row = buildCell(period, cap, alloc, pipe, assumptions);
      if (row.status === 'red') {
        breaches.push({
          role,
          periodKey: period.key,
          periodLabel: period.label,
          utilizationPct: row.committedUtilizationPct,
          overDays: round1(alloc - cap),
          committedOnly: true,
        });
      } else if (row.totalStatus === 'red') {
        breaches.push({
          role,
          periodKey: period.key,
          periodLabel: period.label,
          utilizationPct: row.utilizationPct,
          overDays: round1(alloc + pipe - cap),
          committedOnly: false,
        });
      }
      return row;
    });
    return {
      role,
      headcount: headcount[role],
      periods: periodRows,
      totals: totalsFor(periodRows, assumptions),
    };
  });

  const portfolioPeriods = periods.map((period, i) => {
    const cap = sum(roleRows.map((r) => r.periods[i].capacityDays));
    const alloc = sum(roleRows.map((r) => r.periods[i].allocatedDays));
    const pipe = sum(roleRows.map((r) => r.periods[i].pipelineDays));
    return buildCell(period, cap, alloc, pipe, assumptions);
  });

  return {
    window: { from, to, granularity },
    assumptions: {
      effectiveDaysPerYear: assumptions.effectiveDaysPerYear,
      workingDaysPerWeek: assumptions.workingDaysPerWeek,
      fiscalYearStartMonth: assumptions.fiscalYearStartMonth,
      amberThresholdPct: assumptions.amberThresholdPct,
      redThresholdPct: assumptions.redThresholdPct,
      projectStatuses,
      includePipeline,
    },
    periods,
    roles: roleRows,
    portfolio: { periods: portfolioPeriods, totals: totalsFor(portfolioPeriods, assumptions) },
    pipeline: pipelineDetail,
    breaches: breaches.sort((a, b) => b.utilizationPct - a.utilizationPct),
  };
}

/**
 * "Can we take this on?" — Section 4.5 / Section 5.
 *
 * Sizes one demand item, lays it over the periods it would land in, and reports
 * what the role utilisation becomes if it is approved. This is what has to be
 * on screen before anyone clicks Approve.
 */
export function capacityCheck(db, demandItemId, options = {}) {
  const item = db.prepare('SELECT * FROM demand_item WHERE id = ?').get(demandItemId);
  if (!item) return null;

  const sizing = sizeDemandItem(db, demandItemId);
  const assumptions = readAssumptions(db);
  const wdpw = assumptions.workingDaysPerWeek;

  const from = options.from || item.indicative_start_date;
  const to = options.to || item.indicative_end_date;

  if (!from || !to) {
    return {
      demandItem: item,
      sizing,
      testable: false,
      reason: 'No indicative delivery window set — the capacity impact cannot be placed in time.',
      periods: [],
      roles: [],
      verdict: { fits: null, breaches: [] },
    };
  }
  if (!sizing.tier2.complete) {
    return {
      demandItem: item,
      sizing,
      testable: false,
      reason: 'No Tier 2 role/phase estimate — capacity cannot be tested by role.',
      periods: [],
      roles: [],
      verdict: { fits: null, breaches: [] },
    };
  }

  const granularity = options.granularity || 'quarter';
  // The baseline deliberately excludes this item from pipeline demand, so its
  // impact is not double-counted against itself.
  const baseline = computeCapacity(db, {
    from, to, granularity,
    includePipeline: options.includeOtherPipeline ?? true,
    projectStatuses: options.projectStatuses || DEFAULT_PROJECT_STATUSES,
  });
  const periods = baseline.periods;
  const spread = spreadOverPeriods(sizing.tier2.byRole, from, to, periods, assumptions, wdpw);

  const breaches = [];
  const roleRows = baseline.roles
    .map((roleRow) => {
      const required = spread[roleRow.role] || {};
      const totalRequired = sum(Object.values(required));
      if (totalRequired <= 0) return null;

      const periodRows = periodsFor(roleRow, periods).map((cell) => {
        const requiredDays = required[cell.key] || 0;
        // This item's own contribution is already inside pipelineDays when it
        // sits in a pipeline status; strip it so "before" really means before.
        const ownPipeline = PIPELINE_STATUSES.includes(item.status) ? requiredDays : 0;
        const demandBefore = cell.allocatedDays + Math.max(0, cell.pipelineDays - ownPipeline);
        const demandAfter = demandBefore + requiredDays;
        const utilBefore = pct(demandBefore, cell.capacityDays);
        const utilAfter = pct(demandAfter, cell.capacityDays);
        const row = {
          periodKey: cell.key,
          periodLabel: cell.periodLabel,
          requiredDays: round1(requiredDays),
          capacityDays: round1(cell.capacityDays),
          demandBeforeDays: round1(demandBefore),
          remainingBeforeDays: round1(cell.capacityDays - demandBefore),
          demandAfterDays: round1(demandAfter),
          remainingAfterDays: round1(cell.capacityDays - demandAfter),
          utilizationBeforePct: utilBefore,
          utilizationAfterPct: utilAfter,
          status: statusFor(utilAfter, assumptions),
          breach: utilAfter >= assumptions.redThresholdPct,
        };
        if (row.breach) {
          breaches.push({
            role: roleRow.role,
            periodKey: cell.key,
            periodLabel: cell.periodLabel,
            utilizationAfterPct: utilAfter,
            overDays: round1(demandAfter - cell.capacityDays),
          });
        }
        return row;
      });

      return {
        role: roleRow.role,
        headcount: roleRow.headcount,
        requiredDays: round1(totalRequired),
        periods: periodRows,
      };
    })
    .filter(Boolean);

  return {
    demandItem: item,
    sizing,
    testable: true,
    window: { from, to, granularity },
    periods,
    roles: roleRows,
    verdict: {
      fits: breaches.length === 0,
      breaches: breaches.sort((a, b) => b.utilizationAfterPct - a.utilizationAfterPct),
    },
  };
}

/** One person's allocations across projects — the read-only resource view. */
export function personCapacity(db, personId, options = {}) {
  const person = db.prepare('SELECT * FROM person WHERE id = ?').get(personId);
  if (!person) return null;

  const assumptions = readAssumptions(db);
  const fallbackWindow = defaultWindow(new Date(), assumptions.fiscalYearStartMonth);
  const from = options.from || fallbackWindow.from;
  const to = options.to || fallbackWindow.to;
  const granularity = options.granularity || 'quarter';
  const periods = buildPeriods(from, to, granularity, assumptions.fiscalYearStartMonth);
  const perYear = person.effective_days_per_year ?? assumptions.effectiveDaysPerYear;
  const wdpw = assumptions.workingDaysPerWeek;

  const allocations = db
    .prepare(
      `SELECT ra.*, p.name AS project_name, p.code AS project_code, p.status AS project_status
         FROM resource_allocation ra
         JOIN project p ON p.id = ra.project_id
        WHERE ra.person_id = ? AND ra.start_date <= ? AND ra.end_date >= ?
        ORDER BY ra.start_date`
    )
    .all(personId, to, from);

  const periodRows = periods.map((period) => {
    const capacityDays = effectiveDays(period.start, period.end, perYear, wdpw);
    let allocatedDays = 0;
    for (const alloc of allocations) {
      if (alloc.project_status === 'closed') continue;
      const slice = overlap(alloc.start_date, alloc.end_date, period.start, period.end);
      if (!slice) continue;
      allocatedDays += alloc.allocation_pct *
        effectiveDays(slice.start, slice.end, assumptions.effectiveDaysPerYear, wdpw);
    }
    const utilizationPct = pct(allocatedDays, capacityDays);
    return {
      key: period.key,
      periodLabel: period.label,
      capacityDays: round1(capacityDays),
      allocatedDays: round1(allocatedDays),
      remainingDays: round1(capacityDays - allocatedDays),
      utilizationPct,
      status: statusFor(utilizationPct, assumptions),
    };
  });

  return { person, window: { from, to, granularity }, periods, allocations, periodRows };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Lay a per-role person-day total over reporting periods, in proportion to the
 * effective delivery days each period contributes to the item's window. Flat
 * spread — a phase-aware S-curve would be more realistic and is noted as a
 * refinement once there is actual data to shape it with.
 */
function spreadOverPeriods(byRole, windowStart, windowEnd, periods, assumptions, wdpw) {
  const totalWindowDays = effectiveDays(
    windowStart, windowEnd, assumptions.effectiveDaysPerYear, wdpw
  );
  const result = {};
  for (const [role, days] of Object.entries(byRole)) {
    result[role] = {};
    for (const period of periods) result[role][period.key] = 0;
    if (!days || totalWindowDays <= 0) continue;
    for (const period of periods) {
      const slice = overlap(windowStart, windowEnd, period.start, period.end);
      if (!slice) continue;
      const sliceDays = effectiveDays(
        slice.start, slice.end, assumptions.effectiveDaysPerYear, wdpw
      );
      result[role][period.key] = days * (sliceDays / totalWindowDays);
    }
  }
  return result;
}

function blankGrid(roles, periods) {
  const grid = {};
  for (const role of roles) {
    grid[role] = {};
    for (const period of periods) grid[role][period.key] = 0;
  }
  return grid;
}

function buildCell(period, capacityDays, allocatedDays, pipelineDays, assumptions) {
  const demandDays = allocatedDays + pipelineDays;
  const committedUtilizationPct = pct(allocatedDays, capacityDays);
  const utilizationPct = pct(demandDays, capacityDays);
  return {
    key: period.key,
    periodLabel: period.label,
    periodSublabel: period.sublabel || null,
    start: period.start,
    end: period.end,
    capacityDays: round1(capacityDays),
    allocatedDays: round1(allocatedDays),
    pipelineDays: round1(pipelineDays),
    demandDays: round1(demandDays),
    remainingDays: round1(capacityDays - demandDays),
    remainingAfterCommittedDays: round1(capacityDays - allocatedDays),
    committedUtilizationPct,
    utilizationPct,
    status: statusFor(committedUtilizationPct, assumptions),
    totalStatus: statusFor(utilizationPct, assumptions),
  };
}

function periodsFor(roleRow, periods) {
  return periods.map((p) => roleRow.periods.find((c) => c.key === p.key));
}

function totalsFor(periodRows, assumptions) {
  const capacityDays = sum(periodRows.map((r) => r.capacityDays));
  const allocatedDays = sum(periodRows.map((r) => r.allocatedDays));
  const pipelineDays = sum(periodRows.map((r) => r.pipelineDays));
  const demandDays = allocatedDays + pipelineDays;
  return {
    capacityDays: round1(capacityDays),
    allocatedDays: round1(allocatedDays),
    pipelineDays: round1(pipelineDays),
    demandDays: round1(demandDays),
    remainingDays: round1(capacityDays - demandDays),
    committedUtilizationPct: pct(allocatedDays, capacityDays),
    utilizationPct: pct(demandDays, capacityDays),
    status: statusFor(pct(allocatedDays, capacityDays), assumptions),
    totalStatus: statusFor(pct(demandDays, capacityDays), assumptions),
  };
}

function statusFor(utilizationPct, assumptions) {
  if (utilizationPct >= assumptions.redThresholdPct) return 'red';
  if (utilizationPct >= assumptions.amberThresholdPct) return 'amber';
  return 'green';
}

function pct(numerator, denominator) {
  if (!denominator) return numerator > 0 ? Infinity : 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function sum(values) {
  return values.reduce((a, b) => a + (b || 0), 0);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export const __testables = { spreadOverPeriods, statusFor, pct, toIso };
