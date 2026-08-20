import express from 'express';
import { ROLES } from '../db/reference.js';
import { requireRole } from '../lib/auth.js';
import {
  applyUpdate, handler, notFound, oneOf, pick, requireFields, toBool, toNumber,
} from '../lib/http.js';
import { personCapacity } from '../domain/capacity.js';

const TEAMS = ['PM team', 'Biz Lead team', 'Tech'];
const EMPLOYMENT = ['perm', 'contractor'];
const PERSON_FIELDS = ['name', 'email', 'role', 'team', 'employment_type', 'active',
  'effective_days_per_year'];

export function peopleRoutes(db) {
  const router = express.Router();

  router.get('/', handler((req, res) => {
    const where = [];
    const params = {};
    if (req.query.role) { where.push('role = @role'); params.role = req.query.role; }
    if (req.query.team) { where.push('team = @team'); params.team = req.query.team; }
    const active = toBool(req.query.active, true);
    if (active !== undefined) { where.push('active = @active'); params.active = active ? 1 : 0; }

    res.json(db.prepare(
      `SELECT p.*,
              (SELECT COUNT(DISTINCT ra.project_id) FROM resource_allocation ra
                 WHERE ra.person_id = p.id) AS project_count
         FROM person p
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY p.role, p.name`
    ).all(params));
  }));

  router.post('/', requireRole('admin'), handler((req, res) => {
    requireFields(req.body, ['name', 'role', 'team', 'employment_type']);
    const body = pick(req.body, PERSON_FIELDS);
    oneOf(body.role, ROLES, 'role');
    oneOf(body.team, TEAMS, 'team');
    oneOf(body.employment_type, EMPLOYMENT, 'employment_type');
    if (body.effective_days_per_year !== undefined) {
      body.effective_days_per_year = toNumber(body.effective_days_per_year, 'effective_days_per_year');
    }
    const keys = Object.keys(body);
    const info = db.prepare(
      `INSERT INTO person (${keys.join(', ')}) VALUES (${keys.map((k) => `@${k}`).join(', ')})`
    ).run(body);
    res.status(201).json(db.prepare('SELECT * FROM person WHERE id = ?').get(info.lastInsertRowid));
  }));

  router.patch('/:id', requireRole('admin'), handler((req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT 1 FROM person WHERE id = ?').get(id)) throw notFound('Person not found');
    const patch = pick(req.body, PERSON_FIELDS);
    oneOf(patch.role, ROLES, 'role');
    oneOf(patch.team, TEAMS, 'team');
    oneOf(patch.employment_type, EMPLOYMENT, 'employment_type');
    if (patch.active !== undefined) patch.active = patch.active ? 1 : 0;
    if (patch.effective_days_per_year !== undefined && patch.effective_days_per_year !== null) {
      patch.effective_days_per_year = toNumber(patch.effective_days_per_year, 'effective_days_per_year');
    }
    applyUpdate(db, 'person', id, patch);
    return res.json(db.prepare('SELECT * FROM person WHERE id = ?').get(id));
  }));

  /**
   * One person's own allocations across every project — the read-only view a
   * Tech Lead, Dev, Tester or Tech BA gets (Section 2). Deliberately a
   * different shape from the PM and exec screens, not the same grid filtered.
   */
  router.get('/:id/capacity', handler((req, res) => {
    const id = req.params.id === 'me' ? req.user.personId : Number(req.params.id);
    if (!id) throw notFound('No person record is linked to your login.');

    // A resource can only look at themselves; everyone else can look at anyone.
    if (req.user.accessRole === 'resource' && id !== req.user.personId) {
      return res.status(403).json({ error: 'You can only view your own allocations.' });
    }
    const result = personCapacity(db, id, {
      from: req.query.from, to: req.query.to, granularity: req.query.granularity,
    });
    if (!result) throw notFound('Person not found');
    return res.json(result);
  }));

  return router;
}
