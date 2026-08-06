import express from 'express';
import { readAssumptions } from '../db/reference.js';
import { csvList, handler, oneOf, toBool } from '../lib/http.js';
import { computeCapacity, DEFAULT_PROJECT_STATUSES, PIPELINE_STATUSES } from '../domain/capacity.js';
import { listProjects } from './projects.js';
import { listDemand } from './demand.js';

export function portfolioRoutes(db) {
  const router = express.Router();

  /** Workbench Home — the exec summary strip. */
  router.get('/summary', handler((req, res) => {
    const assumptions = readAssumptions(db);

    const projectCounts = db.prepare(
      `SELECT status, COUNT(*) AS n FROM project GROUP BY status`
    ).all();
    const tierCounts = db.prepare(
      `SELECT psc_tier, COUNT(*) AS n FROM project WHERE status != 'closed' GROUP BY psc_tier`
    ).all();
    const budgetTypeCounts = db.prepare(
      `SELECT budget_type, COUNT(*) AS n FROM project WHERE status != 'closed' GROUP BY budget_type`
    ).all();

    const ragCounts = db.prepare(
      `SELECT r.status, COUNT(*) AS n
         FROM rag_entry r JOIN project p ON p.id = r.project_id
        WHERE p.status = 'active' GROUP BY r.status`
    ).all();
    const projectsWithRed = db.prepare(
      `SELECT COUNT(DISTINCT r.project_id) AS n
         FROM rag_entry r JOIN project p ON p.id = r.project_id
        WHERE p.status = 'active' AND r.status = 'Red'`
    ).get().n;

    const budget = db.prepare(
      `SELECT COALESCE(SUM(b.budgeted_amount), 0) AS budgeted,
              COALESCE(SUM(b.actual_spend), 0)    AS actual,
              COALESCE(SUM(b.forecast_spend), 0)  AS forecast
         FROM budget_line b JOIN project p ON p.id = b.project_id
        WHERE p.status != 'closed'`
    ).get();
    const unbudgetedExposure = db.prepare(
      `SELECT COALESCE(SUM(b.forecast_spend), 0) AS forecast
         FROM budget_line b JOIN project p ON p.id = b.project_id
        WHERE p.status != 'closed' AND b.budget_status IN ('unbudgeted', 'pending')`
    ).get().forecast;

    const demandCounts = db.prepare(
      'SELECT status, COUNT(*) AS n FROM demand_item GROUP BY status'
    ).all();

    const capacity = computeCapacity(db, {
      granularity: 'quarter',
      includePipeline: true,
      projectStatuses: DEFAULT_PROJECT_STATUSES,
    });

    // The headline number is the worst committed role/period on the board —
    // that is the constraint the conversation with the PSC is actually about.
    let worst = null;
    for (const role of capacity.roles) {
      for (const cell of role.periods) {
        if (cell.capacityDays <= 0) continue;
        if (!worst || cell.committedUtilizationPct > worst.committedUtilizationPct) {
          worst = { role: role.role, ...cell };
        }
      }
    }

    res.json({
      assumptions,
      projects: {
        total: projectCounts.reduce((s, r) => s + r.n, 0),
        byStatus: Object.fromEntries(projectCounts.map((r) => [r.status, r.n])),
        byTier: Object.fromEntries(tierCounts.map((r) => [r.psc_tier, r.n])),
        byBudgetType: Object.fromEntries(budgetTypeCounts.map((r) => [r.budget_type, r.n])),
      },
      rag: {
        counts: Object.fromEntries(ragCounts.map((r) => [r.status, r.n])),
        projectsWithRed,
      },
      budget: {
        ...budget,
        variance: budget.forecast - budget.budgeted,
        unbudgetedExposure,
        currency: assumptions.defaultCurrency,
      },
      demand: {
        byStatus: Object.fromEntries(demandCounts.map((r) => [r.status, r.n])),
        inPipeline: demandCounts
          .filter((r) => PIPELINE_STATUSES.includes(r.status))
          .reduce((s, r) => s + r.n, 0),
        pipelineDays: capacity.pipeline.scheduled.reduce((s, i) => s + i.totalDays, 0),
        unsized: capacity.pipeline.unsized.length,
        unscheduled: capacity.pipeline.unscheduled.length,
      },
      capacity: {
        window: capacity.window,
        worst,
        breaches: capacity.breaches,
        breachCount: capacity.breaches.length,
        portfolio: capacity.portfolio.totals,
      },
    });
  }));

  /** RAG Dashboard — every current entry, filterable by stream and status. */
  router.get('/rag', handler((req, res) => {
    const where = ["p.status != 'closed'"];
    const params = {};
    const statuses = csvList(req.query.status);
    if (statuses) {
      where.push(`r.status IN (${statuses.map((_, i) => `@s${i}`).join(',')})`);
      statuses.forEach((s, i) => { params[`s${i}`] = s; });
    }
    const streams = csvList(req.query.stream);
    if (streams) {
      where.push(`r.stream IN (${streams.map((_, i) => `@st${i}`).join(',')})`);
      streams.forEach((s, i) => { params[`st${i}`] = s; });
    }
    if (req.query.psc_tier) { where.push('p.psc_tier = @tier'); params.tier = req.query.psc_tier; }
    if (req.query.owner_person_id) {
      where.push('(p.pm_owner_id = @owner OR p.biz_lead_owner_id = @owner)');
      params.owner = Number(req.query.owner_person_id);
    }

    const entries = db.prepare(
      `SELECT r.*, p.name AS project_name, p.code AS project_code, p.psc_tier,
              p.status AS project_status, rs.label AS stream_label,
              pm.name AS pm_owner_name, bl.name AS biz_lead_owner_name,
              pe.name AS updated_by_name
         FROM rag_entry r
         JOIN project p ON p.id = r.project_id
         LEFT JOIN rag_stream rs ON rs.key = r.stream
         LEFT JOIN person pm ON pm.id = p.pm_owner_id
         LEFT JOIN person bl ON bl.id = p.biz_lead_owner_id
         LEFT JOIN person pe ON pe.id = r.updated_by
        WHERE ${where.join(' AND ')}
        ORDER BY CASE r.status WHEN 'Red' THEN 0 WHEN 'Amber' THEN 1 ELSE 2 END,
                 r.updated_date DESC`
    ).all(params);

    const byStream = {};
    for (const e of entries) {
      const bucket = (byStream[e.stream] ||= {
        stream: e.stream, label: e.stream_label || e.stream, Red: 0, Amber: 0, Green: 0,
      });
      bucket[e.status] += 1;
    }

    res.json({ entries, byStream: Object.values(byStream) });
  }));

  /** Budget Tracker — rollups plus the per-project detail behind them. */
  router.get('/budget', handler((req, res) => {
    const assumptions = readAssumptions(db);
    const includeClosed = toBool(req.query.includeClosed, false);
    const projectFilter = includeClosed ? '1 = 1' : "p.status != 'closed'";

    const byFiscalYear = db.prepare(
      `SELECT b.fiscal_year,
              COALESCE(SUM(b.budgeted_amount), 0) AS budgeted,
              COALESCE(SUM(b.actual_spend), 0)    AS actual,
              COALESCE(SUM(b.forecast_spend), 0)  AS forecast
         FROM budget_line b JOIN project p ON p.id = b.project_id
        WHERE ${projectFilter}
        GROUP BY b.fiscal_year ORDER BY b.fiscal_year`
    ).all();

    const byBudgetType = db.prepare(
      `SELECT p.budget_type,
              COUNT(DISTINCT p.id) AS projects,
              COALESCE(SUM(b.budgeted_amount), 0) AS budgeted,
              COALESCE(SUM(b.actual_spend), 0)    AS actual,
              COALESCE(SUM(b.forecast_spend), 0)  AS forecast
         FROM project p LEFT JOIN budget_line b ON b.project_id = p.id
        WHERE ${projectFilter}
        GROUP BY p.budget_type`
    ).all();

    const byBudgetStatus = db.prepare(
      `SELECT b.budget_status,
              COALESCE(SUM(b.budgeted_amount), 0) AS budgeted,
              COALESCE(SUM(b.forecast_spend), 0)  AS forecast
         FROM budget_line b JOIN project p ON p.id = b.project_id
        WHERE ${projectFilter}
        GROUP BY b.budget_status`
    ).all();

    const projects = db.prepare(
      `SELECT p.id, p.code, p.name, p.status, p.psc_tier, p.budget_type,
              pm.name AS pm_owner_name,
              COALESCE(SUM(b.budgeted_amount), 0) AS budgeted,
              COALESCE(SUM(b.actual_spend), 0)    AS actual,
              COALESCE(SUM(b.forecast_spend), 0)  AS forecast,
              GROUP_CONCAT(DISTINCT b.budget_status) AS budget_statuses
         FROM project p
         LEFT JOIN budget_line b ON b.project_id = p.id
         LEFT JOIN person pm ON pm.id = p.pm_owner_id
        WHERE ${projectFilter}
        GROUP BY p.id ORDER BY forecast DESC`
    ).all().map((r) => ({ ...r, variance: r.forecast - r.budgeted }));

    const totals = projects.reduce(
      (acc, p) => ({
        budgeted: acc.budgeted + p.budgeted,
        actual: acc.actual + p.actual,
        forecast: acc.forecast + p.forecast,
      }),
      { budgeted: 0, actual: 0, forecast: 0 }
    );

    res.json({
      currency: assumptions.defaultCurrency,
      pscThreshold: assumptions.pscThreshold,
      totals: { ...totals, variance: totals.forecast - totals.budgeted },
      byFiscalYear: byFiscalYear.map((r) => ({ ...r, variance: r.forecast - r.budgeted })),
      byBudgetType: byBudgetType.map((r) => ({ ...r, variance: r.forecast - r.budgeted })),
      byBudgetStatus,
      projects,
    });
  }));

  /**
   * PSC Pack — a single payload the steering committee view renders and the
   * export button writes out. Defaults to PSC-governed projects only, which is
   * what the committee actually governs.
   */
  router.get('/psc-pack', handler((req, res) => {
    const assumptions = readAssumptions(db);
    const scope = req.query.scope || 'psc';
    oneOf(scope, ['psc', 'all'], 'scope');

    const projects = listProjects(db, {
      status: 'active,on-hold',
      ...(scope === 'psc' ? { psc_tier: 'PSC-governed' } : {}),
    });
    const projectIds = new Set(projects.map((p) => p.id));

    const exceptions = db.prepare(
      `SELECT r.*, p.name AS project_name, p.code AS project_code, p.psc_tier,
              rs.label AS stream_label, pm.name AS pm_owner_name
         FROM rag_entry r
         JOIN project p ON p.id = r.project_id
         LEFT JOIN rag_stream rs ON rs.key = r.stream
         LEFT JOIN person pm ON pm.id = p.pm_owner_id
        WHERE r.status IN ('Red', 'Amber') AND p.status != 'closed'
        ORDER BY CASE r.status WHEN 'Red' THEN 0 ELSE 1 END, p.name`
    ).all().filter((r) => projectIds.has(r.project_id));

    const milestones = db.prepare(
      `SELECT m.*, p.name AS project_name
         FROM milestone m JOIN project p ON p.id = m.project_id
        WHERE p.status != 'closed'
          AND (m.status = 'delayed'
               OR (m.status != 'done' AND m.planned_date <= date('now', '+90 days')))
        ORDER BY m.planned_date`
    ).all().filter((m) => projectIds.has(m.project_id));

    const capacity = computeCapacity(db, { granularity: 'quarter', includePipeline: true });
    const demand = listDemand(db).filter((d) => PIPELINE_STATUSES.includes(d.status));

    const budgetTotals = projects.reduce(
      (acc, p) => ({
        budgeted: acc.budgeted + p.budgeted_amount,
        actual: acc.actual + p.actual_spend,
        forecast: acc.forecast + p.forecast_spend,
      }),
      { budgeted: 0, actual: 0, forecast: 0 }
    );

    res.json({
      generatedAt: new Date().toISOString(),
      scope,
      currency: assumptions.defaultCurrency,
      assumptions,
      projects,
      health: {
        total: projects.length,
        red: projects.filter((p) => p.worst_rag === 'Red').length,
        amber: projects.filter((p) => p.worst_rag === 'Amber').length,
        green: projects.filter((p) => p.worst_rag === 'Green').length,
      },
      budget: { ...budgetTotals, variance: budgetTotals.forecast - budgetTotals.budgeted },
      exceptions,
      milestones,
      capacity,
      demand,
    });
  }));

  return router;
}
