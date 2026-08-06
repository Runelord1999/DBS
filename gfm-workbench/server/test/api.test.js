import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/auth.js';

const PASSWORD = 'workbench-test-pw';

/** Boots the API on an ephemeral port with a small in-memory portfolio. */
async function harness() {
  const db = openDb(':memory:');

  const person = db.prepare(
    'INSERT INTO person (name, role, team, employment_type) VALUES (?, ?, ?, ?)'
  );
  const pmA = Number(person.run('PM Alpha', 'PM', 'PM team', 'perm').lastInsertRowid);
  const pmB = Number(person.run('PM Beta', 'PM', 'PM team', 'perm').lastInsertRowid);
  const blA = Number(person.run('Lead Alpha', 'Biz Lead', 'Biz Lead team', 'perm').lastInsertRowid);
  const devA = Number(person.run('Dev Alpha', 'Developer', 'Tech', 'perm').lastInsertRowid);
  const baA = Number(person.run('BA Alpha', 'Tech BA', 'Tech', 'contractor').lastInsertRowid);

  const addUser = (email, name, role, personId) => {
    const { hash, salt } = hashPassword(PASSWORD);
    db.prepare(
      `INSERT INTO app_user (email, name, access_role, person_id, password_hash, password_salt)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(email, name, role, personId, hash, salt);
  };
  addUser('admin@example.test', 'Admin', 'admin', null);
  addUser('pm.alpha@example.test', 'PM Alpha', 'pm', pmA);
  addUser('pm.beta@example.test', 'PM Beta', 'pm', pmB);
  addUser('dev.alpha@example.test', 'Dev Alpha', 'resource', devA);
  addUser('psc@example.test', 'Committee', 'psc', null);

  const projectId = Number(db.prepare(
    `INSERT INTO project (code, name, status, psc_tier, pm_owner_id, biz_lead_owner_id,
       start_date, target_end_date, budget_type)
     VALUES ('P-001', 'Alpha owned project', 'active', 'Non-PSC', ?, ?,
       '2026-01-01', '2026-12-31', 'budgeted')`
  ).run(pmA, blA).lastInsertRowid);

  const server = createApp(db).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  /**
   * node:http rather than fetch: undici holds a keep-alive pool open that
   * outlives the test process, so the suite never exits under `node --test`.
   * `agent: false` gives one socket per request and a clean shutdown.
   */
  const call = (method, path, { token, body } = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path,
      agent: false,
      headers: {
        ...(payload ? {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = text; }
        resolve({
          status: res.statusCode,
          body: json,
          text,
          headers: { get: (name) => res.headers[name.toLowerCase()] },
        });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

  const login = async (email) => {
    const res = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
    assert.equal(res.status, 200, `login failed for ${email}: ${res.text}`);
    return res.body.token;
  };

  const close = async () => {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closed;
    db.close();
  };

  return { db, call, login, close, ids: { pmA, pmB, blA, devA, baA, projectId } };
}

test('login rejects a bad password without revealing whether the account exists', async () => {
  const h = await harness();
  const bad = await h.call('POST', '/api/auth/login', {
    body: { email: 'admin@example.test', password: 'wrong' },
  });
  const missing = await h.call('POST', '/api/auth/login', {
    body: { email: 'nobody@example.test', password: 'wrong' },
  });
  assert.equal(bad.status, 400);
  assert.equal(missing.status, 400);
  assert.equal(bad.body.error, missing.body.error);
  await h.close();
});

test('the API is closed without a session', async () => {
  const h = await harness();
  assert.equal((await h.call('GET', '/api/projects')).status, 401);
  assert.equal((await h.call('GET', '/api/capacity')).status, 401);
  await h.close();
});

test('every signed-in role can read the portfolio and the capacity numbers', async () => {
  const h = await harness();
  for (const email of ['admin@example.test', 'pm.alpha@example.test',
    'dev.alpha@example.test', 'psc@example.test']) {
    const token = await h.login(email);
    assert.equal((await h.call('GET', '/api/projects', { token })).status, 200, email);
    assert.equal((await h.call('GET', '/api/capacity', { token })).status, 200, email);
    assert.equal((await h.call('GET', '/api/portfolio/summary', { token })).status, 200, email);
  }
  await h.close();
});

test('a PM can edit the project they own but not one they do not', async () => {
  const h = await harness();
  const alpha = await h.login('pm.alpha@example.test');
  const beta = await h.login('pm.beta@example.test');

  const ok = await h.call('PATCH', `/api/projects/${h.ids.projectId}`, {
    token: alpha, body: { status: 'on-hold' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'on-hold');

  const denied = await h.call('PATCH', `/api/projects/${h.ids.projectId}`, {
    token: beta, body: { status: 'closed' },
  });
  assert.equal(denied.status, 403);
  await h.close();
});

test('read-only roles cannot write, and only an admin can delete', async () => {
  const h = await harness();
  const dev = await h.login('dev.alpha@example.test');
  const psc = await h.login('psc@example.test');
  const admin = await h.login('admin@example.test');

  assert.equal((await h.call('POST', '/api/projects', {
    token: dev, body: { name: 'Sneaky' },
  })).status, 403);
  assert.equal((await h.call('PATCH', `/api/projects/${h.ids.projectId}`, {
    token: psc, body: { status: 'closed' },
  })).status, 403);
  assert.equal((await h.call('POST', '/api/people', {
    token: psc, body: { name: 'X', role: 'PM', team: 'PM team', employment_type: 'perm' },
  })).status, 403);
  assert.equal((await h.call('DELETE', `/api/projects/${h.ids.projectId}`, {
    token: psc,
  })).status, 403);
  assert.equal((await h.call('DELETE', `/api/projects/${h.ids.projectId}`, {
    token: admin,
  })).status, 200);
  await h.close();
});

test('a resource can see their own allocations and nobody else’s', async () => {
  const h = await harness();
  const dev = await h.login('dev.alpha@example.test');
  assert.equal((await h.call('GET', '/api/people/me/capacity', { token: dev })).status, 200);
  assert.equal((await h.call('GET', `/api/people/${h.ids.devA}/capacity`, { token: dev })).status, 200);
  assert.equal((await h.call('GET', `/api/people/${h.ids.baA}/capacity`, { token: dev })).status, 403);

  const pm = await h.login('pm.alpha@example.test');
  assert.equal((await h.call('GET', `/api/people/${h.ids.baA}/capacity`, { token: pm })).status, 200);
  await h.close();
});

test('a Red RAG entry without commentary is rejected', async () => {
  const h = await harness();
  const token = await h.login('pm.alpha@example.test');
  const bad = await h.call('POST', `/api/projects/${h.ids.projectId}/rag`, {
    token, body: { stream: 'tech_delivery', status: 'Red' },
  });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /commentary/);

  const good = await h.call('POST', `/api/projects/${h.ids.projectId}/rag`, {
    token, body: { stream: 'tech_delivery', status: 'Red', commentary: 'Vendor slipped.' },
  });
  assert.equal(good.status, 201);
  await h.close();
});

test('invalid dates and enum values come back as 400, not 500', async () => {
  const h = await harness();
  const token = await h.login('pm.alpha@example.test');
  assert.equal((await h.call('PATCH', `/api/projects/${h.ids.projectId}`, {
    token, body: { start_date: 'next tuesday' },
  })).status, 400);
  assert.equal((await h.call('PATCH', `/api/projects/${h.ids.projectId}`, {
    token, body: { status: 'nearly done' },
  })).status, 400);
  assert.equal((await h.call('PATCH', `/api/projects/${h.ids.projectId}`, {
    token, body: { start_date: '2026-06-01', target_end_date: '2026-01-01' },
  })).status, 400);
  await h.close();
});

test('demand approval is gated, then converts into a project with allocations', async () => {
  const h = await harness();
  const token = await h.login('pm.alpha@example.test');

  const created = await h.call('POST', '/api/demand', {
    token,
    body: {
      title: 'New reporting obligation',
      source: 'new regulatory',
      description: 'Fabricated test item.',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'New');
  const id = created.body.id;

  // Not sized: approval must refuse and say why.
  const tooEarly = await h.call('POST', `/api/demand/${id}/approve`, { token });
  assert.equal(tooEarly.status, 400);
  assert.match(JSON.stringify(tooEarly.body.details), /Tier 2/);

  // Approved is not reachable through the plain status route either.
  assert.equal((await h.call('PUT', `/api/demand/${id}/status`, {
    token, body: { status: 'Approved' },
  })).status, 400);

  await h.call('PATCH', `/api/demand/${id}`, {
    token,
    body: {
      tshirt_size: 'M',
      indicative_start_date: '2026-01-01',
      indicative_end_date: '2026-12-31',
    },
  });
  await h.call('PUT', `/api/demand/${id}/sizing`, {
    token,
    body: {
      estimates: [
        { role: 'Tech BA', phase: 'Discovery', estimated_person_days: 20 },
        { role: 'Developer', phase: 'Build', estimated_person_days: 20 },
      ],
    },
  });
  await h.call('PUT', `/api/demand/${id}/complexity`, {
    token, body: { factors: ['regulatory'] },
  });

  const detail = await h.call('GET', `/api/demand/${id}`, { token });
  assert.equal(detail.body.sizing.complexity.totalUpliftPct, 15);
  assert.equal(detail.body.sizing.tier2.adjustedTotalDays, 46);
  assert.equal(detail.body.readiness.canMoveTo.Approved.allowed, true);
  assert.equal(detail.body.capacityCheck.testable, true);

  const approved = await h.call('POST', `/api/demand/${id}/approve`, {
    token, body: { pm_owner_id: h.ids.pmA, decision_note: 'Approved in test.' },
  });
  assert.equal(approved.status, 201, approved.text);
  assert.equal(approved.body.demandItem.status, 'Approved');

  const project = approved.body.project;
  assert.equal(project.budget_type, 'unbudgeted');
  assert.equal(project.allocations.length, 2, 'one placeholder per sized role');
  assert.ok(project.allocations.every((a) => a.person_id === null));
  assert.ok(project.allocations.every((a) => a.source === 'converted_demand'));
  assert.equal(project.budget_lines.length, 1);
  assert.equal(project.budget_lines[0].budget_status, 'unbudgeted');

  // The approved work now shows as committed rather than pipeline.
  const capacity = await h.call('GET', '/api/capacity?from=2026-01-01&to=2026-12-31&granularity=year',
    { token });
  const ba = capacity.body.roles.find((r) => r.role === 'Tech BA');
  assert.equal(Math.round(ba.totals.allocatedDays), 23);
  assert.equal(ba.totals.pipelineDays, 0);
  await h.close();
});

test('approving over the ceiling needs an explicit acknowledgement', async () => {
  const h = await harness();
  const token = await h.login('pm.alpha@example.test');

  const id = (await h.call('POST', '/api/demand', {
    token, body: { title: 'Oversized ask', source: 'business request' },
  })).body.id;
  await h.call('PATCH', `/api/demand/${id}`, {
    token,
    body: {
      tshirt_size: 'XL',
      indicative_start_date: '2026-01-01',
      indicative_end_date: '2026-12-31',
    },
  });
  // One Tech BA exists, with ~200 effective days. 400 days cannot fit.
  await h.call('PUT', `/api/demand/${id}/sizing`, {
    token,
    body: { estimates: [{ role: 'Tech BA', phase: 'Build', estimated_person_days: 400 }] },
  });

  const blocked = await h.call('POST', `/api/demand/${id}/approve`, { token });
  assert.equal(blocked.status, 409);
  assert.ok(blocked.body.breaches.length > 0);

  const forced = await h.call('POST', `/api/demand/${id}/approve`, {
    token,
    body: { acknowledge_capacity_breach: true, decision_note: 'Business accepted the overrun.' },
  });
  assert.equal(forced.status, 201);
  await h.close();
});

test('rejecting or deferring an item requires a decision note', async () => {
  const h = await harness();
  const token = await h.login('pm.alpha@example.test');
  const id = (await h.call('POST', '/api/demand', {
    token, body: { title: 'Nice to have', source: 'other' },
  })).body.id;

  assert.equal((await h.call('PUT', `/api/demand/${id}/status`, {
    token, body: { status: 'Rejected' },
  })).status, 400);

  const ok = await h.call('PUT', `/api/demand/${id}/status`, {
    token, body: { status: 'Deferred', decision_note: 'Revisit next fiscal year.' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'Deferred');
  await h.close();
});

test('only an admin can change the capacity assumptions', async () => {
  const h = await harness();
  const pm = await h.login('pm.alpha@example.test');
  const admin = await h.login('admin@example.test');

  assert.equal((await h.call('PUT', '/api/reference/assumptions/capacity.effective_days_per_year', {
    token: pm, body: { value: '260' },
  })).status, 403);

  const updated = await h.call('PUT', '/api/reference/assumptions/capacity.effective_days_per_year', {
    token: admin, body: { value: '180' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.value, '180');

  const reference = await h.call('GET', '/api/reference', { token: pm });
  assert.equal(reference.body.resolved.effectiveDaysPerYear, 180);
  await h.close();
});

test('a complexity factor cannot be set to reduce an estimate', async () => {
  const h = await harness();
  const admin = await h.login('admin@example.test');
  assert.equal((await h.call('PUT', '/api/reference/complexity-factors/regulatory', {
    token: admin, body: { uplift_pct: -20 },
  })).status, 400);
  await h.close();
});

test('CSV exports are served as attachments with escaped content', async () => {
  const h = await harness();
  const token = await h.login('pm.alpha@example.test');
  await h.call('POST', `/api/projects/${h.ids.projectId}/rag`, {
    token,
    body: {
      stream: 'vendor',
      status: 'Amber',
      commentary: 'Vendor said "later", cost impact unclear',
    },
  });

  const res = await h.call('GET', '/api/export/rag.csv', { token });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="gfm-rag-/);
  assert.match(res.text, /"Vendor said ""later"", cost impact unclear"/);

  const projects = await h.call('GET', '/api/export/projects.csv', { token });
  assert.match(projects.text, /Alpha owned project/);
  await h.close();
});

test('the PSC pack scopes to governed projects by default', async () => {
  const h = await harness();
  const token = await h.login('psc@example.test');
  const scoped = await h.call('GET', '/api/portfolio/psc-pack', { token });
  assert.equal(scoped.status, 200);
  assert.equal(scoped.body.projects.length, 0, 'the only project is Non-PSC');

  const all = await h.call('GET', '/api/portfolio/psc-pack?scope=all', { token });
  assert.equal(all.body.projects.length, 1);
  assert.ok(all.body.capacity.roles.length > 0);
  await h.close();
});

test('a logged-out token stops working', async () => {
  const h = await harness();
  const token = await h.login('pm.alpha@example.test');
  assert.equal((await h.call('GET', '/api/auth/me', { token })).status, 200);
  await h.call('POST', '/api/auth/logout', { token });
  assert.equal((await h.call('GET', '/api/auth/me', { token })).status, 401);
  await h.close();
});
