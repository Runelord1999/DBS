import express from 'express';
import { readAssumptions, ROLES } from '../db/reference.js';
import { assertCanEditProject, canEditProject, requireRole } from '../lib/auth.js';
import {
  applyUpdate, assertDate, assertDateOrder, badRequest, csvList, handler, notFound,
  oneOf, pick, requireFields, toNumber,
} from '../lib/http.js';

const PROJECT_STATUSES = ['active', 'on-hold', 'closed'];
const BUDGET_TYPES = ['budgeted', 'unbudgeted', 'enhancement demand'];
const PSC_TIERS = ['PSC-governed', 'Non-PSC'];
const MILESTONE_STATUSES = ['not started', 'in progress', 'done', 'delayed'];
const RAG_STATUSES = ['Red', 'Amber', 'Green'];
const BUDGET_STATUSES = ['approved', 'pending', 'unbudgeted'];

const PROJECT_FIELDS = ['code', 'name', 'description', 'psc_tier', 'sponsor', 'pm_owner_id',
  'biz_lead_owner_id', 'status', 'start_date', 'target_end_date', 'budget_type'];

/**
 * The portfolio grid needs RAG rollup, budget rollup and milestone progress for
 * every row. Done as correlated subqueries in a single statement rather than a
 * query per project — at 50+ projects the N+1 version is what makes a grid feel
 * slow (Section 8).
 */
const LIST_SQL = `
  SELECT p.*,
         pm.name  AS pm_owner_name,
         bl.name  AS biz_lead_owner_name,
         (SELECT COUNT(*) FROM rag_entry r WHERE r.project_id = p.id AND r.status = 'Red')   AS rag_red,
         (SELECT COUNT(*) FROM rag_entry r WHERE r.project_id = p.id AND r.status = 'Amber') AS rag_amber,
         (SELECT COUNT(*) FROM rag_entry r WHERE r.project_id = p.id AND r.status = 'Green') AS rag_green,
         (SELECT COALESCE(SUM(b.budgeted_amount), 0) FROM budget_line b WHERE b.project_id = p.id) AS budgeted_amount,
         (SELECT COALESCE(SUM(b.actual_spend), 0)    FROM budget_line b WHERE b.project_id = p.id) AS actual_spend,
         (SELECT COALESCE(SUM(b.forecast_spend), 0)  FROM budget_line b WHERE b.project_id = p.id) AS forecast_spend,
         (SELECT COUNT(*) FROM milestone m WHERE m.project_id = p.id)                        AS milestone_total,
         (SELECT COUNT(*) FROM milestone m WHERE m.project_id = p.id AND m.status = 'done')  AS milestone_done,
         (SELECT COUNT(*) FROM milestone m WHERE m.project_id = p.id AND m.status = 'delayed') AS milestone_delayed,
         (SELECT COUNT(*) FROM resource_allocation ra WHERE ra.project_id = p.id)            AS allocation_count,
         (SELECT COALESCE(SUM(ra.allocation_pct), 0) FROM resource_allocation ra WHERE ra.project_id = p.id) AS allocated_fte
    FROM project p
    LEFT JOIN person pm ON pm.id = p.pm_owner_id
    LEFT JOIN person bl ON bl.id = p.biz_lead_owner_id`;

export function worstRag(row) {
  if (row.rag_red > 0) return 'Red';
  if (row.rag_amber > 0) return 'Amber';
  if (row.rag_green > 0) return 'Green';
  return null;
}

/** Expected tier from spend vs the governance threshold. Advisory, never applied silently. */
function tierAdvice(row, threshold) {
  const basis = Math.max(row.budgeted_amount || 0, row.forecast_spend || 0);
  const expected = basis >= threshold ? 'PSC-governed' : 'Non-PSC';
  return expected === row.psc_tier
    ? null
    : {
      expected,
      actual: row.psc_tier,
      message: `Budget of ${Math.round(basis).toLocaleString()} implies ${expected}, but this project is recorded as ${row.psc_tier}.`,
    };
}

export function decorateProject(row, threshold) {
  return {
    ...row,
    worst_rag: worstRag(row),
    budget_variance: (row.forecast_spend || 0) - (row.budgeted_amount || 0),
    milestone_progress_pct: row.milestone_total
      ? Math.round((row.milestone_done / row.milestone_total) * 100)
      : null,
    psc_tier_advice: tierAdvice(row, threshold),
  };
}

export function listProjects(db, query = {}) {
  const where = [];
  const params = {};

  const statuses = csvList(query.status);
  if (statuses) {
    where.push(`p.status IN (${statuses.map((_, i) => `@status${i}`).join(',')})`);
    statuses.forEach((s, i) => { params[`status${i}`] = s; });
  }
  if (query.psc_tier) { where.push('p.psc_tier = @psc_tier'); params.psc_tier = query.psc_tier; }
  if (query.budget_type) { where.push('p.budget_type = @budget_type'); params.budget_type = query.budget_type; }
  if (query.pm_owner_id) { where.push('p.pm_owner_id = @pm_owner_id'); params.pm_owner_id = Number(query.pm_owner_id); }
  if (query.biz_lead_owner_id) { where.push('p.biz_lead_owner_id = @biz_lead_owner_id'); params.biz_lead_owner_id = Number(query.biz_lead_owner_id); }
  if (query.owner_person_id) {
    where.push('(p.pm_owner_id = @owner_person_id OR p.biz_lead_owner_id = @owner_person_id)');
    params.owner_person_id = Number(query.owner_person_id);
  }
  if (query.search) {
    where.push('(p.name LIKE @search OR p.code LIKE @search OR p.sponsor LIKE @search)');
    params.search = `%${query.search}%`;
  }

  const sql = `${LIST_SQL}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY p.name`;
  const threshold = readAssumptions(db).pscThreshold;
  let rows = db.prepare(sql).all(params).map((r) => decorateProject(r, threshold));

  if (query.rag) {
    const wanted = csvList(query.rag);
    rows = rows.filter((r) => wanted.includes(r.worst_rag));
  }
  return rows;
}

export function getProjectDetail(db, id) {
  const base = db.prepare(`${LIST_SQL} WHERE p.id = @id`).get({ id });
  if (!base) return null;
  const project = decorateProject(base, readAssumptions(db).pscThreshold);

  project.milestones = db.prepare(
    'SELECT * FROM milestone WHERE project_id = ? ORDER BY sort_order, planned_date, id'
  ).all(id);

  project.rag_entries = db.prepare(
    `SELECT r.*, pe.name AS updated_by_name, rs.label AS stream_label
       FROM rag_entry r
       LEFT JOIN person pe ON pe.id = r.updated_by
       LEFT JOIN rag_stream rs ON rs.key = r.stream
      WHERE r.project_id = ?
      ORDER BY CASE r.status WHEN 'Red' THEN 0 WHEN 'Amber' THEN 1 ELSE 2 END, r.stream`
  ).all(id);

  project.budget_lines = db.prepare(
    'SELECT * FROM budget_line WHERE project_id = ? ORDER BY fiscal_year'
  ).all(id);

  project.allocations = db.prepare(
    `SELECT ra.*, pe.name AS person_name, pe.employment_type
       FROM resource_allocation ra
       LEFT JOIN person pe ON pe.id = ra.person_id
      WHERE ra.project_id = ?
      ORDER BY ra.role, ra.start_date`
  ).all(id);

  project.source_demand = db.prepare(
    'SELECT id, title, status, tshirt_size FROM demand_item WHERE linked_project_id = ?'
  ).all(id);

  return project;
}

export function projectRoutes(db) {
  const router = express.Router();

  // --- Projects ------------------------------------------------------------

  router.get('/', handler((req, res) => {
    res.json(listProjects(db, req.query));
  }));

  router.get('/:id', handler((req, res) => {
    const project = getProjectDetail(db, Number(req.params.id));
    if (!project) throw notFound('Project not found');
    res.json({ ...project, can_edit: canEditProject(req.user, project) });
  }));

  router.post('/', requireRole('admin', 'pm', 'biz_lead'), handler((req, res) => {
    requireFields(req.body, ['name']);
    const body = pick(req.body, PROJECT_FIELDS);
    oneOf(body.status, PROJECT_STATUSES, 'status');
    oneOf(body.budget_type, BUDGET_TYPES, 'budget_type');
    oneOf(body.psc_tier, PSC_TIERS, 'psc_tier');
    assertDate(body.start_date, 'start_date');
    assertDate(body.target_end_date, 'target_end_date');
    assertDateOrder(body.start_date, body.target_end_date, 'start_date', 'target_end_date');

    // A PM or Biz Lead creating a project defaults to owning it — otherwise they
    // would immediately lose the ability to edit what they just made.
    if (req.user.accessRole === 'pm' && !body.pm_owner_id) body.pm_owner_id = req.user.personId;
    if (req.user.accessRole === 'biz_lead' && !body.biz_lead_owner_id) {
      body.biz_lead_owner_id = req.user.personId;
    }

    const keys = Object.keys(body);
    const info = db.prepare(
      `INSERT INTO project (${keys.join(', ')}) VALUES (${keys.map((k) => `@${k}`).join(', ')})`
    ).run(body);
    res.status(201).json(getProjectDetail(db, Number(info.lastInsertRowid)));
  }));

  router.patch('/:id', handler((req, res) => {
    const id = Number(req.params.id);
    const check = assertCanEditProject(db, req.user, id);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    const patch = pick(req.body, PROJECT_FIELDS);
    oneOf(patch.status, PROJECT_STATUSES, 'status');
    oneOf(patch.budget_type, BUDGET_TYPES, 'budget_type');
    oneOf(patch.psc_tier, PSC_TIERS, 'psc_tier');
    assertDate(patch.start_date, 'start_date');
    assertDate(patch.target_end_date, 'target_end_date');
    assertDateOrder(
      patch.start_date ?? check.project.start_date,
      patch.target_end_date ?? check.project.target_end_date,
      'start_date', 'target_end_date'
    );
    applyUpdate(db, 'project', id, patch);
    return res.json(getProjectDetail(db, id));
  }));

  router.delete('/:id', requireRole('admin'), handler((req, res) => {
    const info = db.prepare('DELETE FROM project WHERE id = ?').run(Number(req.params.id));
    if (!info.changes) throw notFound('Project not found');
    res.json({ ok: true });
  }));

  // --- Milestones ----------------------------------------------------------

  router.post('/:id/milestones', handler((req, res) => {
    const projectId = Number(req.params.id);
    const check = assertCanEditProject(db, req.user, projectId);
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    requireFields(req.body, ['name']);
    const body = pick(req.body, ['name', 'planned_date', 'actual_date', 'status', 'sort_order']);
    oneOf(body.status, MILESTONE_STATUSES, 'status');
    assertDate(body.planned_date, 'planned_date');
    assertDate(body.actual_date, 'actual_date');
    const info = db.prepare(
      `INSERT INTO milestone (project_id, name, planned_date, actual_date, status, sort_order)
       VALUES (@project_id, @name, @planned_date, @actual_date, @status, @sort_order)`
    ).run({
      project_id: projectId,
      name: body.name,
      planned_date: body.planned_date ?? null,
      actual_date: body.actual_date ?? null,
      status: body.status ?? 'not started',
      sort_order: body.sort_order ?? 0,
    });
    return res.status(201).json(
      db.prepare('SELECT * FROM milestone WHERE id = ?').get(info.lastInsertRowid)
    );
  }));

  router.patch('/:id/milestones/:milestoneId', handler((req, res) => {
    const check = assertCanEditProject(db, req.user, Number(req.params.id));
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    const patch = pick(req.body, ['name', 'planned_date', 'actual_date', 'status', 'sort_order']);
    oneOf(patch.status, MILESTONE_STATUSES, 'status');
    assertDate(patch.planned_date, 'planned_date');
    assertDate(patch.actual_date, 'actual_date');
    applyUpdate(db, 'milestone', Number(req.params.milestoneId), patch);
    return res.json(db.prepare('SELECT * FROM milestone WHERE id = ?').get(Number(req.params.milestoneId)));
  }));

  router.delete('/:id/milestones/:milestoneId', handler((req, res) => {
    const check = assertCanEditProject(db, req.user, Number(req.params.id));
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    db.prepare('DELETE FROM milestone WHERE id = ? AND project_id = ?')
      .run(Number(req.params.milestoneId), Number(req.params.id));
    return res.json({ ok: true });
  }));

  // --- RAG entries ---------------------------------------------------------

  router.post('/:id/rag', handler((req, res) => {
    const projectId = Number(req.params.id);
    const check = assertCanEditProject(db, req.user, projectId);
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    requireFields(req.body, ['stream', 'status']);
    oneOf(req.body.status, RAG_STATUSES, 'status');
    if (req.body.status !== 'Green' && !String(req.body.commentary || '').trim()) {
      throw badRequest('A Red or Amber entry needs commentary — that is what makes the dashboard useful.');
    }
    const info = db.prepare(
      `INSERT INTO rag_entry (project_id, stream, status, commentary, updated_by, updated_date)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(projectId, req.body.stream, req.body.status, req.body.commentary ?? null,
      req.user.personId ?? null);
    return res.status(201).json(
      db.prepare('SELECT * FROM rag_entry WHERE id = ?').get(info.lastInsertRowid)
    );
  }));

  router.patch('/:id/rag/:ragId', handler((req, res) => {
    const check = assertCanEditProject(db, req.user, Number(req.params.id));
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    const ragId = Number(req.params.ragId);
    const existing = db.prepare('SELECT * FROM rag_entry WHERE id = ?').get(ragId);
    if (!existing) throw notFound('RAG entry not found');

    const patch = pick(req.body, ['stream', 'status', 'commentary']);
    oneOf(patch.status, RAG_STATUSES, 'status');
    const nextStatus = patch.status ?? existing.status;
    const nextCommentary = patch.commentary ?? existing.commentary;
    if (nextStatus !== 'Green' && !String(nextCommentary || '').trim()) {
      throw badRequest('A Red or Amber entry needs commentary.');
    }
    patch.updated_by = req.user.personId ?? null;
    const keys = Object.keys(patch);
    db.prepare(
      `UPDATE rag_entry SET ${keys.map((k) => `${k} = @${k}`).join(', ')},
        updated_date = datetime('now') WHERE id = @id`
    ).run({ ...patch, id: ragId });
    return res.json(db.prepare('SELECT * FROM rag_entry WHERE id = ?').get(ragId));
  }));

  router.delete('/:id/rag/:ragId', handler((req, res) => {
    const check = assertCanEditProject(db, req.user, Number(req.params.id));
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    db.prepare('DELETE FROM rag_entry WHERE id = ? AND project_id = ?')
      .run(Number(req.params.ragId), Number(req.params.id));
    return res.json({ ok: true });
  }));

  // --- Budget lines --------------------------------------------------------

  router.post('/:id/budget', handler((req, res) => {
    const projectId = Number(req.params.id);
    const check = assertCanEditProject(db, req.user, projectId);
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    requireFields(req.body, ['fiscal_year']);
    oneOf(req.body.budget_status, BUDGET_STATUSES, 'budget_status');
    const info = db.prepare(
      `INSERT INTO budget_line (project_id, budgeted_amount, actual_spend, forecast_spend,
         currency, budget_status, fiscal_year)
       VALUES (@project_id, @budgeted_amount, @actual_spend, @forecast_spend,
         @currency, @budget_status, @fiscal_year)`
    ).run({
      project_id: projectId,
      budgeted_amount: toNumber(req.body.budgeted_amount, 'budgeted_amount') ?? 0,
      actual_spend: toNumber(req.body.actual_spend, 'actual_spend') ?? 0,
      forecast_spend: toNumber(req.body.forecast_spend, 'forecast_spend') ?? 0,
      currency: req.body.currency ?? readAssumptions(db).defaultCurrency,
      budget_status: req.body.budget_status ?? 'approved',
      fiscal_year: String(req.body.fiscal_year),
    });
    return res.status(201).json(
      db.prepare('SELECT * FROM budget_line WHERE id = ?').get(info.lastInsertRowid)
    );
  }));

  router.patch('/:id/budget/:lineId', handler((req, res) => {
    const check = assertCanEditProject(db, req.user, Number(req.params.id));
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    const patch = pick(req.body, ['budgeted_amount', 'actual_spend', 'forecast_spend',
      'currency', 'budget_status', 'fiscal_year']);
    oneOf(patch.budget_status, BUDGET_STATUSES, 'budget_status');
    for (const f of ['budgeted_amount', 'actual_spend', 'forecast_spend']) {
      if (patch[f] !== undefined) patch[f] = toNumber(patch[f], f);
    }
    applyUpdate(db, 'budget_line', Number(req.params.lineId), patch);
    return res.json(db.prepare('SELECT * FROM budget_line WHERE id = ?').get(Number(req.params.lineId)));
  }));

  router.delete('/:id/budget/:lineId', handler((req, res) => {
    const check = assertCanEditProject(db, req.user, Number(req.params.id));
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    db.prepare('DELETE FROM budget_line WHERE id = ? AND project_id = ?')
      .run(Number(req.params.lineId), Number(req.params.id));
    return res.json({ ok: true });
  }));

  // --- Resource allocations -----------------------------------------------

  router.post('/:id/allocations', handler((req, res) => {
    const projectId = Number(req.params.id);
    const check = assertCanEditProject(db, req.user, projectId);
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    requireFields(req.body, ['role', 'allocation_pct', 'start_date', 'end_date']);
    oneOf(req.body.role, ROLES, 'role');
    assertDate(req.body.start_date, 'start_date');
    assertDate(req.body.end_date, 'end_date');
    assertDateOrder(req.body.start_date, req.body.end_date);
    const pctValue = toNumber(req.body.allocation_pct, 'allocation_pct');
    if (!(pctValue > 0)) throw badRequest('allocation_pct must be greater than 0 (1.0 = full time)');

    const info = db.prepare(
      `INSERT INTO resource_allocation (project_id, person_id, role, allocation_pct,
         start_date, end_date, source, notes)
       VALUES (@project_id, @person_id, @role, @allocation_pct, @start_date, @end_date,
         @source, @notes)`
    ).run({
      project_id: projectId,
      person_id: req.body.person_id ?? null,
      role: req.body.role,
      allocation_pct: pctValue,
      start_date: req.body.start_date,
      end_date: req.body.end_date,
      source: 'manual',
      notes: req.body.notes ?? null,
    });
    return res.status(201).json(
      db.prepare('SELECT * FROM resource_allocation WHERE id = ?').get(info.lastInsertRowid)
    );
  }));

  router.patch('/:id/allocations/:allocId', handler((req, res) => {
    const check = assertCanEditProject(db, req.user, Number(req.params.id));
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    const allocId = Number(req.params.allocId);
    const existing = db.prepare('SELECT * FROM resource_allocation WHERE id = ?').get(allocId);
    if (!existing) throw notFound('Allocation not found');

    const patch = pick(req.body, ['person_id', 'role', 'allocation_pct', 'start_date',
      'end_date', 'notes']);
    oneOf(patch.role, ROLES, 'role');
    assertDate(patch.start_date, 'start_date');
    assertDate(patch.end_date, 'end_date');
    assertDateOrder(patch.start_date ?? existing.start_date, patch.end_date ?? existing.end_date);
    if (patch.allocation_pct !== undefined) {
      patch.allocation_pct = toNumber(patch.allocation_pct, 'allocation_pct');
      if (!(patch.allocation_pct > 0)) throw badRequest('allocation_pct must be greater than 0');
    }
    applyUpdate(db, 'resource_allocation', allocId, patch);
    return res.json(db.prepare('SELECT * FROM resource_allocation WHERE id = ?').get(allocId));
  }));

  router.delete('/:id/allocations/:allocId', handler((req, res) => {
    const check = assertCanEditProject(db, req.user, Number(req.params.id));
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    db.prepare('DELETE FROM resource_allocation WHERE id = ? AND project_id = ?')
      .run(Number(req.params.allocId), Number(req.params.id));
    return res.json({ ok: true });
  }));

  return router;
}
