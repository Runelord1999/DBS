/**
 * The API, running in the browser.
 *
 * This wires the real route modules — the same files the Node server mounts —
 * onto the Express shim and the wasm SQLite database. No handler, validation
 * rule, permission check or capacity calculation is reimplemented here; only
 * the wiring is, because `server/src/app.js` also serves static files and opens
 * a file-backed database, neither of which exists in a browser.
 *
 * Consequence worth knowing: writes are real, and really change the numbers —
 * but they change a database that lives in a tab, and reloading the page
 * restores the seeded portfolio.
 */

import express from './express-shim.js';
import { openDemoDatabase } from './sqlite.js';

import { requireAuth } from '@server/lib/auth.js';
import { errorMiddleware } from '@server/lib/http.js';
import { authRoutes } from '@server/routes/auth.js';
import { referenceRoutes } from '@server/routes/reference.js';
import { peopleRoutes } from '@server/routes/people.js';
import { projectRoutes } from '@server/routes/projects.js';
import { demandRoutes } from '@server/routes/demand.js';
import { capacityRoutes } from '@server/routes/capacity.js';
import { portfolioRoutes } from '@server/routes/portfolio.js';
import { exportRoutes } from '@server/routes/exports.js';

let app = null;
let db = null;
let personas = [];
let currentUserId = null;

/**
 * Builds the demo persona list from the seeded accounts — one per access role,
 * preferring a PM and Biz Lead who actually own projects so the ownership rules
 * are visible rather than theoretical.
 */
function loadPersonas(database) {
  const rows = database.prepare(
    `SELECT u.id, u.email, u.name, u.access_role, u.person_id,
            p.role AS person_role, p.team,
            (SELECT COUNT(*) FROM project pr
              WHERE pr.pm_owner_id = u.person_id OR pr.biz_lead_owner_id = u.person_id) AS owned,
            (SELECT COUNT(*) FROM resource_allocation ra
              WHERE ra.person_id = u.person_id) AS allocations
       FROM app_user u
       LEFT JOIN person p ON p.id = u.person_id
      WHERE u.active = 1`
  ).all();

  const bestOf = (role, rank) => rows
    .filter((r) => r.access_role === role)
    .sort((a, b) => rank(b) - rank(a))[0];

  return [
    { ...bestOf('admin', () => 0), label: 'Admin', blurb: 'Full access, assumptions and users' },
    { ...bestOf('pm', (r) => r.owned), label: 'Project Manager', blurb: 'Owns and edits their own projects' },
    { ...bestOf('biz_lead', (r) => r.owned), label: 'Biz Lead / Analyst', blurb: 'Same, from the business side' },
    { ...bestOf('resource', (r) => r.allocations), label: 'Resourced team member', blurb: 'Read-only view of their own allocations' },
    { ...bestOf('psc', () => 0), label: 'PSC / Senior management', blurb: 'Read-only portfolio and PSC pack' },
  ].filter((p) => p && p.id);
}

/** Mirrors server/src/app.js, minus the parts that need a filesystem. */
function createDemoApp(database) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    if (req.body === undefined || req.body === null) req.body = {};
    next();
  });

  // The demo has no password flow; the selected persona is the session.
  instance.use((req, _res, next) => {
    const persona = personas.find((p) => p.id === currentUserId);
    req.user = persona
      ? {
        id: persona.id,
        email: persona.email,
        name: persona.name,
        accessRole: persona.access_role,
        personId: persona.person_id,
      }
      : null;
    next();
  });

  instance.get('/api/health', (_req, res) => res.json({ ok: true, demo: true }));
  instance.use('/api/auth', authRoutes(database));
  instance.use('/api', requireAuth);
  instance.use('/api/reference', referenceRoutes(database));
  instance.use('/api/people', peopleRoutes(database));
  instance.use('/api/projects', projectRoutes(database));
  instance.use('/api/demand', demandRoutes(database));
  instance.use('/api/capacity', capacityRoutes(database));
  instance.use('/api/portfolio', portfolioRoutes(database));
  instance.use('/api/export', exportRoutes(database));
  instance.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint' }));
  instance.use(errorMiddleware);
  return instance;
}

export async function startDemoServer() {
  if (app) return { personas, currentUserId };

  const base = import.meta.env.BASE_URL || '/';
  db = await openDemoDatabase(`${base}demo-portfolio.db`);
  personas = loadPersonas(db);
  currentUserId = personas[0]?.id ?? null;
  app = createDemoApp(db);
  return { personas, currentUserId };
}

export function getPersonas() {
  return personas;
}

export function getCurrentPersona() {
  return personas.find((p) => p.id === currentUserId) || null;
}

export function setPersona(userId) {
  currentUserId = userId;
}

/** Splits "/projects?status=active" the way Express would. */
function parsePath(fullPath) {
  const [path, search = ''] = fullPath.split('?');
  const query = {};
  for (const [key, value] of new URLSearchParams(search)) query[key] = value;
  return { path, query };
}

export async function demoRequest(method, apiPath, body) {
  if (!app) await startDemoServer();
  const { path, query } = parsePath(apiPath);
  return app.dispatch(method, `/api${path}`, { body, query });
}
