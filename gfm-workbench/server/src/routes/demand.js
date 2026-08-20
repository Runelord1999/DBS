import express from 'express';
import { readAssumptions, PHASES, ROLES } from '../db/reference.js';
import { requireRole } from '../lib/auth.js';
import {
  applyUpdate, assertDate, assertDateOrder, badRequest, handler, notFound, oneOf,
  pick, requireFields, toNumber,
} from '../lib/http.js';
import { capacityCheck } from '../domain/capacity.js';
import { DEMAND_STATUSES, demandReadiness, sizeDemandItem } from '../domain/sizing.js';
import { effectiveDays } from '../domain/periods.js';
import { getProjectDetail } from './projects.js';

const SOURCES = ['BAU enhancement', 'new regulatory', 'business request', 'other'];
const SIZES = ['S', 'M', 'L', 'XL'];
const DEMAND_FIELDS = ['title', 'description', 'source', 'requested_by', 'date_raised',
  'tshirt_size', 'indicative_start_date', 'indicative_end_date', 'decision_note'];

/**
 * Board data for the Kanban. Sizing summaries come from three grouped queries
 * rather than a per-card round trip, so the board stays cheap as the queue grows.
 */
export function listDemand(db) {
  const items = db.prepare(
    `SELECT d.*,
            p.name AS linked_project_name,
            (SELECT COALESCE(SUM(s.estimated_person_days), 0)
               FROM sizing_estimate s WHERE s.demand_item_id = d.id) AS baseline_days,
            (SELECT COALESCE(SUM(cf.uplift_pct), 0)
               FROM demand_complexity_factor dcf
               JOIN complexity_factor cf ON cf.key = dcf.factor_key
              WHERE dcf.demand_item_id = d.id) AS uplift_pct,
            (SELECT COUNT(*) FROM sizing_estimate s WHERE s.demand_item_id = d.id) AS estimate_rows
       FROM demand_item d
       LEFT JOIN project p ON p.id = d.linked_project_id
      ORDER BY d.date_raised DESC, d.id DESC`
  ).all();

  const factorRows = db.prepare(
    `SELECT dcf.demand_item_id, cf.key, cf.label, cf.uplift_pct
       FROM demand_complexity_factor dcf
       JOIN complexity_factor cf ON cf.key = dcf.factor_key
      ORDER BY cf.sort_order`
  ).all();
  const roleRows = db.prepare(
    `SELECT demand_item_id, role, SUM(estimated_person_days) AS days
       FROM sizing_estimate GROUP BY demand_item_id, role`
  ).all();

  const factorsByItem = groupBy(factorRows, 'demand_item_id');
  const rolesByItem = groupBy(roleRows, 'demand_item_id');
  const bands = db.prepare('SELECT * FROM tshirt_band').all();
  const bandBySize = Object.fromEntries(bands.map((b) => [b.size, b]));

  return items.map((item) => {
    const multiplier = 1 + (item.uplift_pct || 0) / 100;
    const byRole = {};
    for (const r of rolesByItem[item.id] || []) byRole[r.role] = round1(r.days * multiplier);
    return {
      ...item,
      band: bandBySize[item.tshirt_size] || null,
      complexity_factors: (factorsByItem[item.id] || []).map((f) => ({
        key: f.key, label: f.label, uplift_pct: f.uplift_pct,
      })),
      sizing_summary: {
        tier2Complete: item.estimate_rows > 0 && item.baseline_days > 0,
        baselineDays: round1(item.baseline_days),
        multiplier: Math.round(multiplier * 100) / 100,
        adjustedDays: round1(item.baseline_days * multiplier),
        byRole,
      },
      scheduled: Boolean(item.indicative_start_date && item.indicative_end_date),
    };
  });
}

export function demandRoutes(db) {
  const router = express.Router();
  const canWrite = requireRole('admin', 'pm', 'biz_lead');

  router.get('/', handler((_req, res) => {
    const items = listDemand(db);
    const board = Object.fromEntries(
      DEMAND_STATUSES.map((s) => [s, items.filter((i) => i.status === s)])
    );
    res.json({ items, board, statuses: DEMAND_STATUSES });
  }));

  router.get('/:id', handler((req, res) => {
    const id = Number(req.params.id);
    const item = db.prepare(
      `SELECT d.*, p.name AS linked_project_name
         FROM demand_item d LEFT JOIN project p ON p.id = d.linked_project_id
        WHERE d.id = ?`
    ).get(id);
    if (!item) throw notFound('Demand item not found');

    res.json({
      item,
      sizing: sizeDemandItem(db, id),
      readiness: demandReadiness(db, id),
      capacityCheck: capacityCheck(db, id),
    });
  }));

  router.post('/', canWrite, handler((req, res) => {
    requireFields(req.body, ['title', 'source']);
    const body = pick(req.body, DEMAND_FIELDS);
    oneOf(body.source, SOURCES, 'source');
    oneOf(body.tshirt_size, SIZES, 'tshirt_size');
    assertDate(body.date_raised, 'date_raised');
    assertDate(body.indicative_start_date, 'indicative_start_date');
    assertDate(body.indicative_end_date, 'indicative_end_date');
    assertDateOrder(body.indicative_start_date, body.indicative_end_date,
      'indicative_start_date', 'indicative_end_date');

    // Intake is meant to be fast: a t-shirt size supplied at creation moves the
    // item straight past New, otherwise it lands in New awaiting Tier 1.
    body.status = body.tshirt_size ? 'T-Shirt Sized' : 'New';
    if (!body.requested_by) body.requested_by = req.user.name;

    const keys = Object.keys(body);
    const info = db.prepare(
      `INSERT INTO demand_item (${keys.join(', ')}) VALUES (${keys.map((k) => `@${k}`).join(', ')})`
    ).run(body);
    res.status(201).json(db.prepare('SELECT * FROM demand_item WHERE id = ?').get(info.lastInsertRowid));
  }));

  router.patch('/:id', canWrite, handler((req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM demand_item WHERE id = ?').get(id);
    if (!existing) throw notFound('Demand item not found');

    const patch = pick(req.body, DEMAND_FIELDS);
    oneOf(patch.source, SOURCES, 'source');
    oneOf(patch.tshirt_size, SIZES, 'tshirt_size');
    assertDate(patch.indicative_start_date, 'indicative_start_date');
    assertDate(patch.indicative_end_date, 'indicative_end_date');
    assertDateOrder(
      patch.indicative_start_date ?? existing.indicative_start_date,
      patch.indicative_end_date ?? existing.indicative_end_date,
      'indicative_start_date', 'indicative_end_date'
    );

    // Sizing an item that is still New advances it — no separate click needed.
    if (patch.tshirt_size && existing.status === 'New') patch.status = 'T-Shirt Sized';
    applyUpdate(db, 'demand_item', id, patch);
    return res.json(db.prepare('SELECT * FROM demand_item WHERE id = ?').get(id));
  }));

  /**
   * Status transition. The Approved gate refuses anything that has not been
   * sized in Tier 2 and given a window — Section 6 makes that mandatory, and it
   * is what stops the capacity ceiling being decorative.
   */
  router.put('/:id/status', canWrite, handler((req, res) => {
    const id = Number(req.params.id);
    requireFields(req.body, ['status']);
    oneOf(req.body.status, DEMAND_STATUSES, 'status');
    const item = db.prepare('SELECT * FROM demand_item WHERE id = ?').get(id);
    if (!item) throw notFound('Demand item not found');

    const next = req.body.status;
    if (next === 'Approved') {
      throw badRequest(
        'Approve a demand item through POST /api/demand/:id/approve — approval creates ' +
        'the project, budget line and resource allocations in one step.'
      );
    }
    if ((next === 'Rejected' || next === 'Deferred') && !String(req.body.decision_note || '').trim()) {
      throw badRequest(`A decision note is required when moving an item to ${next}.`);
    }

    const readiness = demandReadiness(db, id);
    const gate = readiness.canMoveTo[next];
    if (!gate.allowed) throw badRequest(`Cannot move to ${next}`, gate.blockers);

    const patch = { status: next };
    if (req.body.decision_note !== undefined) patch.decision_note = req.body.decision_note;
    applyUpdate(db, 'demand_item', id, patch);
    return res.json(db.prepare('SELECT * FROM demand_item WHERE id = ?').get(id));
  }));

  /** Replace the whole Tier 2 grid in one call — the UI edits it as a table. */
  router.put('/:id/sizing', canWrite, handler((req, res) => {
    const id = Number(req.params.id);
    const item = db.prepare('SELECT * FROM demand_item WHERE id = ?').get(id);
    if (!item) throw notFound('Demand item not found');
    const entries = Array.isArray(req.body.estimates) ? req.body.estimates : null;
    if (!entries) throw badRequest('Expected { estimates: [{ role, phase, estimated_person_days }] }');

    for (const e of entries) {
      oneOf(e.role, ROLES, 'role');
      oneOf(e.phase, PHASES, 'phase');
      const days = toNumber(e.estimated_person_days, 'estimated_person_days');
      if (days === undefined || days < 0) throw badRequest('estimated_person_days must be 0 or more');
    }

    db.transaction(() => {
      db.prepare('DELETE FROM sizing_estimate WHERE demand_item_id = ?').run(id);
      const insert = db.prepare(
        `INSERT INTO sizing_estimate (demand_item_id, role, phase, estimated_person_days)
         VALUES (?, ?, ?, ?)`
      );
      for (const e of entries) {
        const days = Number(e.estimated_person_days);
        if (days > 0) insert.run(id, e.role, e.phase, days);
      }
    })();

    return res.json(sizeDemandItem(db, id));
  }));

  /** Replace the complexity checklist. Visible rows, not a hidden multiplier. */
  router.put('/:id/complexity', canWrite, handler((req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT 1 FROM demand_item WHERE id = ?').get(id)) {
      throw notFound('Demand item not found');
    }
    const keys = Array.isArray(req.body.factors) ? req.body.factors : null;
    if (!keys) throw badRequest('Expected { factors: ["factor_key", ...] }');

    const known = new Set(db.prepare('SELECT key FROM complexity_factor').all().map((r) => r.key));
    const unknown = keys.filter((k) => !known.has(k));
    if (unknown.length) throw badRequest(`Unknown complexity factor(s): ${unknown.join(', ')}`);

    db.transaction(() => {
      db.prepare('DELETE FROM demand_complexity_factor WHERE demand_item_id = ?').run(id);
      const insert = db.prepare(
        'INSERT INTO demand_complexity_factor (demand_item_id, factor_key) VALUES (?, ?)'
      );
      for (const key of new Set(keys)) insert.run(id, key);
    })();

    return res.json(sizeDemandItem(db, id));
  }));

  router.get('/:id/capacity-check', handler((req, res) => {
    const result = capacityCheck(db, Number(req.params.id), {
      granularity: req.query.granularity,
      from: req.query.from,
      to: req.query.to,
    });
    if (!result) throw notFound('Demand item not found');
    res.json(result);
  }));

  /**
   * Approve → convert (Section 5).
   *
   * Creates the Project, its BudgetLine, and one ResourceAllocation per sized
   * role, in a single transaction. Allocations are created unassigned: sizing
   * says 40 Tech BA days are needed, it does not say whose. They still consume
   * role capacity, which is the point — approving demand has to move the
   * utilisation number immediately, not once someone gets named.
   */
  router.post('/:id/approve', canWrite, handler((req, res) => {
    const id = Number(req.params.id);
    const item = db.prepare('SELECT * FROM demand_item WHERE id = ?').get(id);
    if (!item) throw notFound('Demand item not found');
    if (item.status === 'Approved') throw badRequest('This item has already been approved.');

    const readiness = demandReadiness(db, id);
    if (!readiness.canMoveTo.Approved.allowed) {
      throw badRequest('Cannot approve this item yet', readiness.canMoveTo.Approved.blockers);
    }

    const sizing = sizeDemandItem(db, id);
    const assumptions = readAssumptions(db);
    const check = capacityCheck(db, id);

    // A capacity breach does not block approval — sometimes the business
    // decides to break the ceiling. It does require an explicit acknowledgement,
    // so the decision is recorded rather than implied.
    if (check.testable && !check.verdict.fits && !req.body.acknowledge_capacity_breach) {
      return res.status(409).json({
        error: 'Approving this item breaches role capacity.',
        breaches: check.verdict.breaches,
        hint: 'Re-send with acknowledge_capacity_breach: true to approve anyway, and record why in decision_note.',
      });
    }

    const start = item.indicative_start_date;
    const end = item.indicative_end_date;
    const band = sizing.tier1.band;
    const impliedTier = band && band.amount_min >= assumptions.pscThreshold
      ? 'PSC-governed'
      : 'Non-PSC';

    const budget = req.body.budget || {};
    const windowDays = effectiveDays(
      start, end, assumptions.effectiveDaysPerYear, assumptions.workingDaysPerWeek
    );

    const projectId = db.transaction(() => {
      const info = db.prepare(
        `INSERT INTO project (name, description, psc_tier, sponsor, pm_owner_id,
           biz_lead_owner_id, status, start_date, target_end_date, budget_type)
         VALUES (@name, @description, @psc_tier, @sponsor, @pm_owner_id,
           @biz_lead_owner_id, 'active', @start_date, @target_end_date, @budget_type)`
      ).run({
        name: req.body.project_name || item.title,
        description: item.description,
        psc_tier: req.body.psc_tier || impliedTier,
        sponsor: req.body.sponsor || item.requested_by,
        pm_owner_id: req.body.pm_owner_id ?? null,
        biz_lead_owner_id: req.body.biz_lead_owner_id ?? null,
        start_date: start,
        target_end_date: end,
        budget_type: req.body.budget_type
          || (item.source === 'BAU enhancement' ? 'enhancement demand' : 'unbudgeted'),
      });
      const newProjectId = Number(info.lastInsertRowid);

      db.prepare(
        `INSERT INTO budget_line (project_id, budgeted_amount, actual_spend, forecast_spend,
           currency, budget_status, fiscal_year)
         VALUES (?, ?, 0, ?, ?, ?, ?)`
      ).run(
        newProjectId,
        Number(budget.budgeted_amount) || 0,
        Number(budget.forecast_spend) || 0,
        budget.currency || assumptions.defaultCurrency,
        budget.budget_status || 'unbudgeted',
        String(budget.fiscal_year || start.slice(0, 4))
      );

      const insertAlloc = db.prepare(
        `INSERT INTO resource_allocation (project_id, person_id, role, allocation_pct,
           start_date, end_date, source, notes)
         VALUES (?, NULL, ?, ?, ?, ?, 'converted_demand', ?)`
      );
      for (const [role, days] of Object.entries(sizing.tier2.byRole)) {
        if (!days || windowDays <= 0) continue;
        insertAlloc.run(
          newProjectId, role, days / windowDays, start, end,
          `Unassigned placeholder from demand #${id} sizing (${days} person-days).`
        );
      }

      db.prepare(
        `UPDATE demand_item
            SET status = 'Approved', linked_project_id = ?, decision_note = COALESCE(?, decision_note),
                updated_at = datetime('now')
          WHERE id = ?`
      ).run(newProjectId, req.body.decision_note ?? null, id);

      return newProjectId;
    })();

    return res.status(201).json({
      demandItem: db.prepare('SELECT * FROM demand_item WHERE id = ?').get(id),
      project: getProjectDetail(db, projectId),
      capacityAtApproval: check.testable ? check.verdict : null,
    });
  }));

  router.delete('/:id', requireRole('admin'), handler((req, res) => {
    const info = db.prepare('DELETE FROM demand_item WHERE id = ?').run(Number(req.params.id));
    if (!info.changes) throw notFound('Demand item not found');
    res.json({ ok: true });
  }));

  return router;
}

function groupBy(rows, key) {
  const out = {};
  for (const row of rows) (out[row[key]] ||= []).push(row);
  return out;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
