import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { attachUser, purgeExpiredSessions, requireAuth } from './lib/auth.js';
import { errorMiddleware } from './lib/http.js';
import { authRoutes } from './routes/auth.js';
import { referenceRoutes } from './routes/reference.js';
import { peopleRoutes } from './routes/people.js';
import { projectRoutes } from './routes/projects.js';
import { demandRoutes } from './routes/demand.js';
import { capacityRoutes } from './routes/capacity.js';
import { portfolioRoutes } from './routes/portfolio.js';
import { exportRoutes } from './routes/exports.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist');

export function createApp(db) {
  purgeExpiredSessions(db);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  // Express 5 leaves req.body undefined when a request carries no JSON body.
  // Several endpoints take an entirely optional body (approve, logout), so
  // normalise it here rather than guarding every property read.
  app.use((req, _res, next) => {
    if (req.body === undefined || req.body === null) req.body = {};
    next();
  });
  app.use(attachUser(db));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, projects: db.prepare('SELECT COUNT(*) AS n FROM project').get().n });
  });

  app.use('/api/auth', authRoutes(db));

  // Everything below requires a session. Read access is broad by design — the
  // whole argument of the tool is that the constraint is visible to everyone —
  // while write access is narrowed inside each router.
  app.use('/api', requireAuth);
  app.use('/api/reference', referenceRoutes(db));
  app.use('/api/people', peopleRoutes(db));
  app.use('/api/projects', projectRoutes(db));
  app.use('/api/demand', demandRoutes(db));
  app.use('/api/capacity', capacityRoutes(db));
  app.use('/api/portfolio', portfolioRoutes(db));
  app.use('/api/export', exportRoutes(db));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint' }));

  // Serve the built frontend when it exists, so one process serves the whole
  // tool on an internal server. In development Vite serves the UI and proxies
  // /api here instead.
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use(errorMiddleware);
  return app;
}
