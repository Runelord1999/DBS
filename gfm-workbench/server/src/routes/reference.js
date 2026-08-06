import express from 'express';
import { PHASES, PHASE_LABELS, ROLES, readAssumptions } from '../db/reference.js';
import { requireRole } from '../lib/auth.js';
import { handler, badRequest, requireFields } from '../lib/http.js';
import { DEMAND_STATUSES } from '../domain/sizing.js';

/**
 * Everything the UI needs to render dropdowns, the sizing rubric and the
 * assumption banner. Served in one call so screens do not each re-fetch it.
 */
export function referenceRoutes(db) {
  const router = express.Router();

  router.get('/', handler((_req, res) => {
    res.json({
      roles: ROLES,
      phases: PHASES.map((key) => ({ key, label: PHASE_LABELS[key] })),
      demandStatuses: DEMAND_STATUSES,
      demandSources: ['BAU enhancement', 'new regulatory', 'business request', 'other'],
      projectStatuses: ['active', 'on-hold', 'closed'],
      budgetTypes: ['budgeted', 'unbudgeted', 'enhancement demand'],
      budgetStatuses: ['approved', 'pending', 'unbudgeted'],
      milestoneStatuses: ['not started', 'in progress', 'done', 'delayed'],
      pscTiers: ['PSC-governed', 'Non-PSC'],
      ragStatuses: ['Red', 'Amber', 'Green'],
      streams: db.prepare('SELECT * FROM rag_stream WHERE active = 1 ORDER BY sort_order').all(),
      tshirtBands: db.prepare('SELECT * FROM tshirt_band ORDER BY sort_order').all(),
      complexityFactors: db.prepare(
        'SELECT * FROM complexity_factor WHERE active = 1 ORDER BY sort_order'
      ).all(),
      assumptions: db.prepare('SELECT * FROM assumption ORDER BY key').all(),
      resolved: readAssumptions(db),
    });
  }));

  router.put('/assumptions/:key', requireRole('admin'), handler((req, res) => {
    requireFields(req.body, ['value']);
    const info = db.prepare(
      "UPDATE assumption SET value = ?, updated_at = datetime('now') WHERE key = ?"
    ).run(String(req.body.value), req.params.key);
    if (!info.changes) return res.status(404).json({ error: 'Unknown assumption' });
    return res.json(db.prepare('SELECT * FROM assumption WHERE key = ?').get(req.params.key));
  }));

  router.put('/complexity-factors/:key', requireRole('admin'), handler((req, res) => {
    const uplift = Number(req.body.uplift_pct);
    if (!Number.isFinite(uplift) || uplift < 0) {
      throw badRequest('uplift_pct must be a number of 0 or more — factors never reduce an estimate');
    }
    const info = db.prepare('UPDATE complexity_factor SET uplift_pct = ? WHERE key = ?')
      .run(uplift, req.params.key);
    if (!info.changes) return res.status(404).json({ error: 'Unknown complexity factor' });
    return res.json(db.prepare('SELECT * FROM complexity_factor WHERE key = ?').get(req.params.key));
  }));

  router.put('/tshirt-bands/:size', requireRole('admin'), handler((req, res) => {
    const fields = ['duration_label', 'amount_min', 'amount_max', 'amount_label',
      'systems_label', 'effort_days_min', 'effort_days_max', 'calibrated'];
    const patch = {};
    for (const f of fields) if (req.body[f] !== undefined) patch[f] = req.body[f];
    if (!Object.keys(patch).length) throw badRequest('Nothing to update');
    const sets = Object.keys(patch).map((k) => `${k} = @${k}`).join(', ');
    const info = db.prepare(`UPDATE tshirt_band SET ${sets} WHERE size = @size`)
      .run({ ...patch, size: req.params.size });
    if (!info.changes) return res.status(404).json({ error: 'Unknown t-shirt size' });
    return res.json(db.prepare('SELECT * FROM tshirt_band WHERE size = ?').get(req.params.size));
  }));

  router.post('/streams', requireRole('admin'), handler((req, res) => {
    requireFields(req.body, ['key', 'label']);
    db.prepare('INSERT INTO rag_stream (key, label, sort_order) VALUES (?, ?, ?)')
      .run(req.body.key, req.body.label, req.body.sort_order ?? 99);
    res.status(201).json(db.prepare('SELECT * FROM rag_stream WHERE key = ?').get(req.body.key));
  }));

  router.patch('/streams/:key', requireRole('admin'), handler((req, res) => {
    const patch = {};
    for (const f of ['label', 'sort_order', 'active']) {
      if (req.body[f] !== undefined) patch[f] = req.body[f];
    }
    if (!Object.keys(patch).length) throw badRequest('Nothing to update');
    const sets = Object.keys(patch).map((k) => `${k} = @${k}`).join(', ');
    const info = db.prepare(`UPDATE rag_stream SET ${sets} WHERE key = @key`)
      .run({ ...patch, key: req.params.key });
    if (!info.changes) return res.status(404).json({ error: 'Unknown stream' });
    return res.json(db.prepare('SELECT * FROM rag_stream WHERE key = ?').get(req.params.key));
  }));

  return router;
}
