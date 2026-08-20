import express from 'express';
import {
  createSession, destroySession, verifyPassword, hashPassword, ACCESS_ROLES,
} from '../lib/auth.js';
import { handler, requireFields, badRequest, oneOf } from '../lib/http.js';
import { requireRole } from '../lib/auth.js';

export function authRoutes(db) {
  const router = express.Router();

  router.post('/login', handler((req, res) => {
    requireFields(req.body, ['email', 'password']);
    const email = String(req.body.email).trim().toLowerCase();
    const user = db.prepare('SELECT * FROM app_user WHERE lower(email) = ?').get(email);

    // Same response either way — no account enumeration.
    if (!user || !user.active || !verifyPassword(req.body.password, user.password_hash, user.password_salt)) {
      throw badRequest('Email or password is incorrect');
    }

    const session = createSession(db, user.id);
    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        accessRole: user.access_role,
        personId: user.person_id,
      },
    });
  }));

  router.post('/logout', handler((req, res) => {
    const header = req.get('authorization') || '';
    if (header.toLowerCase().startsWith('bearer ')) destroySession(db, header.slice(7).trim());
    res.json({ ok: true });
  }));

  router.get('/me', handler((req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const person = req.user.personId
      ? db.prepare('SELECT * FROM person WHERE id = ?').get(req.user.personId)
      : null;
    return res.json({ user: req.user, person });
  }));

  // Admin user management (Section 2: admin manages users).
  router.get('/users', requireRole('admin'), handler((_req, res) => {
    res.json(db.prepare(
      `SELECT u.id, u.email, u.name, u.access_role, u.person_id, u.active, u.last_login_at,
              p.name AS person_name, p.role AS person_role
         FROM app_user u LEFT JOIN person p ON p.id = u.person_id
        ORDER BY u.access_role, u.name`
    ).all());
  }));

  router.post('/users', requireRole('admin'), handler((req, res) => {
    requireFields(req.body, ['email', 'name', 'access_role', 'password']);
    oneOf(req.body.access_role, ACCESS_ROLES, 'access_role');
    if (String(req.body.password).length < 8) {
      throw badRequest('Password must be at least 8 characters');
    }
    const { hash, salt } = hashPassword(String(req.body.password));
    const info = db.prepare(
      `INSERT INTO app_user (email, name, access_role, person_id, password_hash, password_salt)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      String(req.body.email).trim().toLowerCase(), req.body.name, req.body.access_role,
      req.body.person_id ?? null, hash, salt
    );
    res.status(201).json({ id: info.lastInsertRowid });
  }));

  router.patch('/users/:id', requireRole('admin'), handler((req, res) => {
    const id = Number(req.params.id);
    const user = db.prepare('SELECT * FROM app_user WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (req.body.access_role !== undefined) {
      oneOf(req.body.access_role, ACCESS_ROLES, 'access_role');
      db.prepare('UPDATE app_user SET access_role = ? WHERE id = ?').run(req.body.access_role, id);
    }
    if (req.body.active !== undefined) {
      db.prepare('UPDATE app_user SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, id);
      if (!req.body.active) db.prepare('DELETE FROM session WHERE user_id = ?').run(id);
    }
    if (req.body.person_id !== undefined) {
      db.prepare('UPDATE app_user SET person_id = ? WHERE id = ?').run(req.body.person_id, id);
    }
    if (req.body.password) {
      if (String(req.body.password).length < 8) {
        throw badRequest('Password must be at least 8 characters');
      }
      const { hash, salt } = hashPassword(String(req.body.password));
      db.prepare('UPDATE app_user SET password_hash = ?, password_salt = ? WHERE id = ?')
        .run(hash, salt, id);
    }
    return res.json({ ok: true });
  }));

  return router;
}
