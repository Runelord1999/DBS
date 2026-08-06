import express from 'express';
import { sendCsv } from '../lib/csv.js';
import { csvList, handler, toBool } from '../lib/http.js';
import { computeCapacity, DEFAULT_PROJECT_STATUSES } from '../domain/capacity.js';
import { listProjects } from './projects.js';
import { listDemand } from './demand.js';
import { ROLES } from '../db/reference.js';

/**
 * CSV exports for PSC pack prep (Section 8). Every screen that shows a table
 * has a matching export here so pack assembly is copy-free.
 */
export function exportRoutes(db) {
  const router = express.Router();
  const stamp = () => new Date().toISOString().slice(0, 10);

  router.get('/projects.csv', handler((req, res) => {
    sendCsv(res, `gfm-projects-${stamp()}.csv`, [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Project' },
      { key: 'status', label: 'Status' },
      { key: 'psc_tier', label: 'PSC tier' },
      { key: 'budget_type', label: 'Budget type' },
      { key: 'sponsor', label: 'Sponsor' },
      { key: 'pm_owner_name', label: 'PM owner' },
      { key: 'biz_lead_owner_name', label: 'Biz Lead owner' },
      { key: 'start_date', label: 'Start' },
      { key: 'target_end_date', label: 'Target end' },
      { key: 'worst_rag', label: 'Worst RAG' },
      { key: 'rag_red', label: 'Red entries' },
      { key: 'rag_amber', label: 'Amber entries' },
      { key: 'budgeted_amount', label: 'Budgeted' },
      { key: 'actual_spend', label: 'Actual' },
      { key: 'forecast_spend', label: 'Forecast' },
      { key: 'budget_variance', label: 'Variance' },
      { key: 'milestone_progress_pct', label: 'Milestones done %' },
      { key: 'allocated_fte', label: 'Allocated FTE' },
    ], listProjects(db, req.query));
  }));

  router.get('/rag.csv', handler((_req, res) => {
    const rows = db.prepare(
      `SELECT p.code AS project_code, p.name AS project_name, p.psc_tier,
              COALESCE(rs.label, r.stream) AS stream, r.status, r.commentary,
              r.updated_date, pe.name AS updated_by_name
         FROM rag_entry r
         JOIN project p ON p.id = r.project_id
         LEFT JOIN rag_stream rs ON rs.key = r.stream
         LEFT JOIN person pe ON pe.id = r.updated_by
        WHERE p.status != 'closed'
        ORDER BY CASE r.status WHEN 'Red' THEN 0 WHEN 'Amber' THEN 1 ELSE 2 END, p.name`
    ).all();
    sendCsv(res, `gfm-rag-${stamp()}.csv`, [
      { key: 'project_code', label: 'Code' },
      { key: 'project_name', label: 'Project' },
      { key: 'psc_tier', label: 'PSC tier' },
      { key: 'stream', label: 'Stream' },
      { key: 'status', label: 'RAG' },
      { key: 'commentary', label: 'Commentary' },
      { key: 'updated_by_name', label: 'Updated by' },
      { key: 'updated_date', label: 'Updated' },
    ], rows);
  }));

  router.get('/budget.csv', handler((_req, res) => {
    const rows = db.prepare(
      `SELECT p.code AS project_code, p.name AS project_name, p.budget_type, p.psc_tier,
              b.fiscal_year, b.currency, b.budget_status,
              b.budgeted_amount, b.actual_spend, b.forecast_spend
         FROM budget_line b JOIN project p ON p.id = b.project_id
        WHERE p.status != 'closed'
        ORDER BY p.name, b.fiscal_year`
    ).all();
    sendCsv(res, `gfm-budget-${stamp()}.csv`, [
      { key: 'project_code', label: 'Code' },
      { key: 'project_name', label: 'Project' },
      { key: 'psc_tier', label: 'PSC tier' },
      { key: 'budget_type', label: 'Budget type' },
      { key: 'fiscal_year', label: 'Fiscal year' },
      { key: 'budget_status', label: 'Budget status' },
      { key: 'currency', label: 'Currency' },
      { key: 'budgeted_amount', label: 'Budgeted' },
      { key: 'actual_spend', label: 'Actual' },
      { key: 'forecast_spend', label: 'Forecast' },
      { key: 'variance', label: 'Variance', format: (r) => r.forecast_spend - r.budgeted_amount },
    ], rows);
  }));

  router.get('/allocations.csv', handler((_req, res) => {
    const rows = db.prepare(
      `SELECT p.code AS project_code, p.name AS project_name, p.status AS project_status,
              COALESCE(pe.name, '(unassigned placeholder)') AS person_name,
              ra.role, ra.allocation_pct, ra.start_date, ra.end_date, ra.source, ra.notes
         FROM resource_allocation ra
         JOIN project p ON p.id = ra.project_id
         LEFT JOIN person pe ON pe.id = ra.person_id
        ORDER BY ra.role, p.name, ra.start_date`
    ).all();
    sendCsv(res, `gfm-allocations-${stamp()}.csv`, [
      { key: 'project_code', label: 'Code' },
      { key: 'project_name', label: 'Project' },
      { key: 'project_status', label: 'Project status' },
      { key: 'person_name', label: 'Person' },
      { key: 'role', label: 'Role' },
      { key: 'allocation_pct', label: 'FTE' },
      { key: 'start_date', label: 'Start' },
      { key: 'end_date', label: 'End' },
      { key: 'source', label: 'Source' },
      { key: 'notes', label: 'Notes' },
    ], rows);
  }));

  /** The capacity grid, flattened one row per role per period. */
  router.get('/capacity.csv', handler((req, res) => {
    const result = computeCapacity(db, {
      from: req.query.from,
      to: req.query.to,
      granularity: req.query.granularity || 'quarter',
      roles: (csvList(req.query.roles) || ROLES).filter((r) => ROLES.includes(r)),
      includePipeline: toBool(req.query.includePipeline, true),
      projectStatuses: toBool(req.query.includeOnHold, false)
        ? ['active', 'on-hold'] : DEFAULT_PROJECT_STATUSES,
    });
    const rows = [];
    for (const role of result.roles) {
      for (const cell of role.periods) {
        rows.push({ role: role.role, headcount: role.headcount, ...cell });
      }
    }
    sendCsv(res, `gfm-capacity-${stamp()}.csv`, [
      { key: 'role', label: 'Role' },
      { key: 'headcount', label: 'Headcount' },
      { key: 'periodLabel', label: 'Period' },
      { key: 'start', label: 'Period start' },
      { key: 'end', label: 'Period end' },
      { key: 'capacityDays', label: 'Capacity (person-days)' },
      { key: 'allocatedDays', label: 'Committed (person-days)' },
      { key: 'pipelineDays', label: 'Pipeline (person-days)' },
      { key: 'demandDays', label: 'Total demand (person-days)' },
      { key: 'remainingDays', label: 'Remaining (person-days)' },
      { key: 'committedUtilizationPct', label: 'Committed utilisation %' },
      { key: 'utilizationPct', label: 'Utilisation incl. pipeline %' },
      { key: 'status', label: 'Committed status' },
    ], rows);
  }));

  router.get('/demand.csv', handler((_req, res) => {
    sendCsv(res, `gfm-demand-${stamp()}.csv`, [
      { key: 'id', label: 'ID' },
      { key: 'title', label: 'Title' },
      { key: 'status', label: 'Status' },
      { key: 'source', label: 'Source' },
      { key: 'requested_by', label: 'Requested by' },
      { key: 'date_raised', label: 'Raised' },
      { key: 'tshirt_size', label: 'T-shirt' },
      { key: 'baselineDays', label: 'Tier 2 baseline (person-days)', format: (r) => r.sizing_summary.baselineDays },
      { key: 'multiplier', label: 'Complexity multiplier', format: (r) => r.sizing_summary.multiplier },
      { key: 'adjustedDays', label: 'Adjusted (person-days)', format: (r) => r.sizing_summary.adjustedDays },
      { key: 'factors', label: 'Complexity factors', format: (r) => r.complexity_factors.map((f) => f.label).join('; ') },
      { key: 'indicative_start_date', label: 'Indicative start' },
      { key: 'indicative_end_date', label: 'Indicative end' },
      { key: 'linked_project_name', label: 'Converted to project' },
      { key: 'decision_note', label: 'Decision note' },
    ], listDemand(db));
  }));

  return router;
}
