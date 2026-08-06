/**
 * Authentication and role-based access control.
 *
 * MVP scope per Section 9: email + password, sessions in the database, roles
 * enforced server-side. AD/SSO is explicitly a Phase 2 infrastructure
 * conversation, not something scaffolded here — see docs/ASSUMPTIONS.md.
 *
 * Password hashing uses scrypt from node's crypto module: no native build step,
 * no extra dependency, and appropriate for this stage.
 */

import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const SESSION_DAYS = 12;

export const ACCESS_ROLES = ['admin', 'pm', 'biz_lead', 'resource', 'psc'];

/** Roles that may create and edit portfolio content at all. */
export const EDITOR_ROLES = ['admin', 'pm', 'biz_lead'];

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.prepare('INSERT INTO session (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, expires);
  db.prepare("UPDATE app_user SET last_login_at = datetime('now') WHERE id = ?").run(userId);
  return { token, expiresAt: expires };
}

export function destroySession(db, token) {
  db.prepare('DELETE FROM session WHERE token = ?').run(token);
}

export function userForToken(db, token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.access_role, u.person_id, u.active, s.expires_at
         FROM session s JOIN app_user u ON u.id = s.user_id
        WHERE s.token = ?`
    )
    .get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    destroySession(db, token);
    return null;
  }
  if (!row.active) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    accessRole: row.access_role,
    personId: row.person_id,
  };
}

export function purgeExpiredSessions(db) {
  db.prepare("DELETE FROM session WHERE expires_at < datetime('now')").run();
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

function bearerToken(req) {
  const header = req.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return null;
}

/** Attaches req.user when a valid session token is present. Never rejects. */
export function attachUser(db) {
  return (req, _res, next) => {
    req.user = userForToken(db, bearerToken(req));
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  return next();
}

export function requireRole(...roles) {
  const allowed = new Set(roles.flat());
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!allowed.has(req.user.accessRole)) {
      return res.status(403).json({
        error: `Your role (${req.user.accessRole}) cannot perform this action.`,
      });
    }
    return next();
  };
}

/**
 * Ownership rule for project edits.
 *
 * A PM or Biz Lead owns the projects they are named on — that is the point of
 * the two owner columns. Admins override. Everyone else is read-only, which is
 * how the resource and PSC views stay honest.
 */
export function canEditProject(user, project) {
  if (!user || !project) return false;
  if (user.accessRole === 'admin') return true;
  if (!EDITOR_ROLES.includes(user.accessRole)) return false;
  if (!user.personId) return false;
  return project.pm_owner_id === user.personId || project.biz_lead_owner_id === user.personId;
}

export function assertCanEditProject(db, user, projectId) {
  const project = db.prepare('SELECT * FROM project WHERE id = ?').get(projectId);
  if (!project) return { ok: false, status: 404, error: 'Project not found' };
  if (!canEditProject(user, project)) {
    return {
      ok: false,
      status: 403,
      error: 'Only the owning PM, owning Biz Lead, or an admin can edit this project.',
    };
  }
  return { ok: true, project };
}
