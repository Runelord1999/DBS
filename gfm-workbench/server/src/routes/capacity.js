import express from 'express';
import { computeCapacity, DEFAULT_PROJECT_STATUSES } from '../domain/capacity.js';
import { csvList, handler, oneOf, toBool } from '../lib/http.js';
import { ROLES } from '../db/reference.js';

/**
 * The Section 4 numbers. Readable by every authenticated role — the point of
 * the tool is that the ceiling is not a private figure.
 */
export function capacityRoutes(db) {
  const router = express.Router();

  router.get('/', handler((req, res) => {
    const granularity = req.query.granularity || 'quarter';
    oneOf(granularity, ['month', 'quarter', 'year'], 'granularity');

    const roles = csvList(req.query.roles) || ROLES;
    const projectStatuses = toBool(req.query.includeOnHold, false)
      ? ['active', 'on-hold']
      : DEFAULT_PROJECT_STATUSES;

    res.json(computeCapacity(db, {
      from: req.query.from,
      to: req.query.to,
      granularity,
      roles: roles.filter((r) => ROLES.includes(r)),
      includePipeline: toBool(req.query.includePipeline, true),
      projectStatuses,
    }));
  }));

  return router;
}
