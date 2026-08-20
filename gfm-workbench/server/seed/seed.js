#!/usr/bin/env node
/**
 * Demo seed — Build Brief Section 11.
 *
 * Loads a fully fabricated portfolio through the real schema and the real
 * database, so that swapping this script for real data entry later changes
 * nothing about the application. Nothing is hardcoded into a UI component.
 *
 * Rules this script honours:
 *   - Every project, person, sponsor and figure is invented. Nothing here is an
 *     anonymised real record.
 *   - ~50 projects across PSC tiers, budget types and statuses.
 *   - RAG deliberately mixed, with Reds and Ambers carrying real commentary.
 *   - Capacity is deliberately broken: at least one role sits above 100% in at
 *     least one quarter, because a demo where every bar is green does not make
 *     the argument the tool exists to make.
 *   - The demand board carries items in all six workflow states, including one
 *     fully sized example (Tier 1 + Tier 2 + complexity factors).
 *
 * Usage:  npm run seed          (refuses to run over an existing portfolio)
 *         npm run seed:reset    (clears transactional data first)
 */

import { openDb, defaultDbPath } from '../src/db/index.js';
import { computeCapacity } from '../src/domain/capacity.js';
import { defaultWindow, toIso } from '../src/domain/periods.js';
import { hashPassword } from '../src/lib/auth.js';
import { readAssumptions, ROLES } from '../src/db/reference.js';
import {
  DEMAND_ITEMS, FIRST_NAMES, LAST_NAMES, MILESTONE_TEMPLATES, PROJECT_CODENAMES,
  PROJECT_THEMES, RAG_COMMENTARY, SPONSORS,
} from './fixtures.js';

/** Demo credentials. Fine for a fabricated dataset; see docs/ASSUMPTIONS.md. */
const DEMO_PASSWORD = 'Workbench!Demo2026';

/**
 * Peak committed utilisation each role should land on, as a fraction. Tech BA
 * is deliberately over the ceiling — that is the number the pitch is built
 * around. The others sit high but survivable, so the constraint reads as a real
 * portfolio rather than an obviously rigged one.
 */
const UTILISATION_TARGETS = {
  'Tech BA': 1.14,
  Developer: 0.97,
  'Tech Lead': 0.93,
  Tester: 0.86,
  'Biz Lead': 0.90,
  PM: 0.84,
};

// --- deterministic randomness ------------------------------------------------
// Seeded so the demo looks the same every time it is rebuilt.
function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260806);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const chance = (p) => rand() < p;
const round2 = (n) => Math.round(n * 100) / 100;

function addMonths(date, months) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// --- main --------------------------------------------------------------------

const reset = process.argv.includes('--reset');
const db = openDb();

const existing = db.prepare('SELECT COUNT(*) AS n FROM project').get().n;
if (existing > 0 && !reset) {
  console.error(
    `Refusing to seed: the database at ${defaultDbPath()} already holds ${existing} projects.\n` +
    'Run `npm run seed:reset` if you are sure you want to clear it and reload demo data.'
  );
  process.exit(1);
}

if (reset) {
  db.transaction(() => {
    for (const table of ['demand_complexity_factor', 'sizing_estimate', 'demand_item',
      'resource_allocation', 'budget_line', 'rag_entry', 'milestone', 'project',
      'session', 'app_user', 'person']) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
  })();
  console.log('Cleared existing portfolio data.');
}

const assumptions = readAssumptions(db);
const today = new Date();
const window = defaultWindow(today, assumptions.fiscalYearStartMonth);
const streams = db.prepare('SELECT key FROM rag_stream WHERE active = 1 ORDER BY sort_order')
  .all().map((r) => r.key);

// --- 1. People ---------------------------------------------------------------
// 16 PMs and 17 Biz Leads is the team described in Section 2; the technical
// roles are the people they resource from.
const HEADCOUNT = [
  { role: 'PM', team: 'PM team', count: 16 },
  { role: 'Biz Lead', team: 'Biz Lead team', count: 17 },
  { role: 'Tech Lead', team: 'Tech', count: 8 },
  { role: 'Developer', team: 'Tech', count: 24 },
  { role: 'Tester', team: 'Tech', count: 13 },
  { role: 'Tech BA', team: 'Tech', count: 7 },
];

const usedNames = new Set();
function uniqueName() {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
  }
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${usedNames.size}`;
}

const insertPerson = db.prepare(
  `INSERT INTO person (name, email, role, team, employment_type, active, effective_days_per_year)
   VALUES (@name, @email, @role, @team, @employment_type, 1, @effective_days_per_year)`
);

const people = [];
db.transaction(() => {
  for (const group of HEADCOUNT) {
    for (let i = 0; i < group.count; i += 1) {
      const name = uniqueName();
      const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@gfm.example`;
      // A few contractors carry a lower effective-days figure — it exercises the
      // per-person override rather than implying anything about real contracts.
      const contractor = chance(0.22);
      const person = {
        name,
        email,
        role: group.role,
        team: group.team,
        employment_type: contractor ? 'contractor' : 'perm',
        effective_days_per_year: contractor && chance(0.5) ? 180 : null,
      };
      person.id = Number(insertPerson.run(person).lastInsertRowid);
      people.push(person);
    }
  }
})();

const byRole = Object.fromEntries(ROLES.map((r) => [r, people.filter((p) => p.role === r)]));

// --- 2. Login accounts -------------------------------------------------------
const insertUser = db.prepare(
  `INSERT INTO app_user (email, name, access_role, person_id, password_hash, password_salt)
   VALUES (?, ?, ?, ?, ?, ?)`
);
// One shared salt+hash pair per distinct password would be faster, but hashing
// each account separately is what the real flow does and keeps the seed honest.
const demoUsers = [];
db.transaction(() => {
  const add = (email, name, accessRole, personId) => {
    const { hash, salt } = hashPassword(DEMO_PASSWORD);
    insertUser.run(email, name, accessRole, personId, hash, salt);
    demoUsers.push({ email, accessRole });
  };
  add('admin@gfm.example', 'Workbench Admin', 'admin', null);
  for (const p of byRole.PM) add(p.email, p.name, 'pm', p.id);
  for (const p of byRole['Biz Lead']) add(p.email, p.name, 'biz_lead', p.id);
  // A sample of technical staff, to show the read-only resource view.
  for (const p of [...byRole['Tech BA'].slice(0, 3), ...byRole.Developer.slice(0, 3),
    ...byRole['Tech Lead'].slice(0, 2), ...byRole.Tester.slice(0, 2)]) {
    add(p.email, p.name, 'resource', p.id);
  }
  add('psc.chair@gfm.example', 'PSC Chair', 'psc', null);
  add('psc.member@gfm.example', 'PSC Member', 'psc', null);
})();

// --- 3. Projects and their content ------------------------------------------
const PROJECT_COUNT = 50;

const insertProject = db.prepare(
  `INSERT INTO project (code, name, description, psc_tier, sponsor, pm_owner_id,
     biz_lead_owner_id, status, start_date, target_end_date, budget_type)
   VALUES (@code, @name, @description, @psc_tier, @sponsor, @pm_owner_id,
     @biz_lead_owner_id, @status, @start_date, @target_end_date, @budget_type)`
);
const insertMilestone = db.prepare(
  `INSERT INTO milestone (project_id, name, planned_date, actual_date, status, sort_order)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const insertRag = db.prepare(
  `INSERT INTO rag_entry (project_id, stream, status, commentary, updated_by, updated_date)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const insertBudget = db.prepare(
  `INSERT INTO budget_line (project_id, budgeted_amount, actual_spend, forecast_spend,
     currency, budget_status, fiscal_year)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const insertAllocation = db.prepare(
  `INSERT INTO resource_allocation (project_id, person_id, role, allocation_pct,
     start_date, end_date, source, notes)
   VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)`
);

const projects = [];

db.transaction(() => {
  for (let i = 0; i < PROJECT_COUNT; i += 1) {
    const theme = PROJECT_THEMES[i % PROJECT_THEMES.length];
    const codename = PROJECT_CODENAMES[i];
    const suffix = i >= PROJECT_THEMES.length ? ' — Phase 2' : '';

    // Statuses: mostly running, a few paused, a few finished.
    const status = i < 38 ? 'active' : i < 44 ? 'on-hold' : 'closed';

    // Spread the portfolio across the reporting window: some already running,
    // some starting later in the year.
    const startOffset = int(-14, 10);
    const durationMonths = int(3, 20);
    const start = addMonths(today, startOffset);
    const end = addMonths(start, durationMonths);

    // Roughly a quarter of the book is PSC-governed, i.e. at or above $3m.
    const governed = i % 4 === 0;
    const budgeted = governed
      ? int(30, 120) * 100_000        // 3.0m – 12.0m
      : int(1, 28) * 100_000;         // 0.1m – 2.8m

    const budgetType = i % 9 === 0 ? 'unbudgeted'
      : i % 7 === 0 ? 'enhancement demand'
        : 'budgeted';

    const project = {
      code: `GFM-${String(i + 1).padStart(3, '0')}`,
      name: `${codename} — ${theme.name}${suffix}`,
      description: theme.desc,
      psc_tier: governed ? 'PSC-governed' : 'Non-PSC',
      sponsor: pick(SPONSORS),
      pm_owner_id: byRole.PM[i % byRole.PM.length].id,
      biz_lead_owner_id: byRole['Biz Lead'][i % byRole['Biz Lead'].length].id,
      status,
      start_date: toIso(start),
      target_end_date: toIso(end),
      budget_type: budgetType,
    };
    project.id = Number(insertProject.run(project).lastInsertRowid);
    project.budgeted = budgeted;
    projects.push(project);

    // --- milestones --------------------------------------------------------
    const milestoneCount = int(4, 7);
    for (let m = 0; m < milestoneCount; m += 1) {
      const plannedDate = addMonths(start, Math.round(((m + 1) / (milestoneCount + 1)) * durationMonths));
      const isPast = plannedDate < today;
      let milestoneStatus;
      let actual = null;
      if (status === 'closed') {
        milestoneStatus = 'done';
        actual = toIso(plannedDate);
      } else if (isPast) {
        if (chance(0.68)) { milestoneStatus = 'done'; actual = toIso(addMonths(plannedDate, chance(0.3) ? 1 : 0)); }
        else if (chance(0.6)) milestoneStatus = 'delayed';
        else milestoneStatus = 'in progress';
      } else {
        milestoneStatus = chance(0.25) ? 'in progress' : 'not started';
      }
      insertMilestone.run(
        project.id, MILESTONE_TEMPLATES[m % MILESTONE_TEMPLATES.length],
        toIso(plannedDate), actual, milestoneStatus, m
      );
    }

    // --- RAG ---------------------------------------------------------------
    // Closed projects keep a light footprint; live ones get a real mix.
    const streamCount = status === 'closed' ? 2 : int(3, 6);
    const chosenStreams = [...streams].sort(() => rand() - 0.5).slice(0, streamCount);
    for (const stream of chosenStreams) {
      let ragStatus;
      if (status === 'closed') ragStatus = 'Green';
      else if (chance(0.14)) ragStatus = 'Red';
      else if (chance(0.34)) ragStatus = 'Amber';
      else ragStatus = 'Green';

      const pool = RAG_COMMENTARY[stream]?.[ragStatus] || RAG_COMMENTARY.tech_delivery[ragStatus];
      insertRag.run(
        project.id, stream, ragStatus, pick(pool),
        chance(0.5) ? project.pm_owner_id : project.biz_lead_owner_id,
        toIso(addMonths(today, 0))
      );
    }

    // --- budget ------------------------------------------------------------
    const fiscalYears = durationMonths > 12 ? 2 : 1;
    const budgetStatus = budgetType === 'unbudgeted' ? 'unbudgeted'
      : budgetType === 'enhancement demand' && chance(0.5) ? 'pending'
        : 'approved';
    for (let fy = 0; fy < fiscalYears; fy += 1) {
      const share = fiscalYears === 1 ? 1 : (fy === 0 ? 0.6 : 0.4);
      const lineBudget = Math.round((budgeted * share) / 1000) * 1000;
      // Progress-weighted actuals, with a spread of over- and under-runs.
      const elapsed = Math.min(1, Math.max(0, (today - start) / (end - start)));
      const actual = Math.round(lineBudget * elapsed * (0.7 + rand() * 0.5) / 1000) * 1000;
      const forecast = Math.round(lineBudget * (0.85 + rand() * 0.45) / 1000) * 1000;
      insertBudget.run(
        project.id, lineBudget, status === 'closed' ? lineBudget : actual,
        status === 'closed' ? lineBudget : forecast,
        assumptions.defaultCurrency, budgetStatus,
        String(start.getUTCFullYear() + fy)
      );
    }

    // --- resourcing --------------------------------------------------------
    // FTE values here are a starting shape only — the calibration pass below
    // scales them per role so the portfolio lands on a deliberate utilisation.
    const shape = [
      { role: 'PM', n: 1, fte: [0.2, 0.6] },
      { role: 'Biz Lead', n: 1, fte: [0.2, 0.7] },
      { role: 'Tech Lead', n: chance(0.85) ? 1 : 0, fte: [0.2, 0.6] },
      { role: 'Developer', n: int(1, 4), fte: [0.3, 1.0] },
      { role: 'Tester', n: int(1, 2), fte: [0.2, 0.8] },
      { role: 'Tech BA', n: int(1, 2), fte: [0.3, 0.9] },
    ];
    for (const { role, n, fte } of shape) {
      for (let a = 0; a < n; a += 1) {
        const pool = byRole[role];
        // Most allocations name a person; a few are unassigned placeholders,
        // which is what converted demand looks like before staffing.
        const person = chance(0.88) ? pool[int(0, pool.length - 1)] : null;
        const allocStart = a === 0 ? start : addMonths(start, int(0, 2));
        const allocEnd = chance(0.75) ? end : addMonths(end, -int(1, 3));
        if (allocEnd <= allocStart) continue;
        insertAllocation.run(
          project.id,
          role === 'PM' ? project.pm_owner_id
            : role === 'Biz Lead' ? project.biz_lead_owner_id
              : person?.id ?? null,
          role,
          round2(fte[0] + rand() * (fte[1] - fte[0])),
          toIso(allocStart), toIso(allocEnd),
          person ? null : 'Role identified, person not yet named.'
        );
      }
    }
  }
})();

// --- 4. Calibrate the capacity picture --------------------------------------
/**
 * Scale each role's allocations so the peak quarter lands on a chosen
 * utilisation. This is what makes the demo argue its point: Tech BA finishes
 * above the ceiling, everyone else finishes uncomfortably close to it.
 *
 * Legitimate only because this dataset is fabricated end to end. Real
 * allocations must never be rescaled to hit a target.
 */
function peakUtilisation(role) {
  const result = computeCapacity(db, {
    from: window.from, to: window.to, granularity: 'quarter',
    roles: [role], includePipeline: false,
  });
  const cells = result.roles[0].periods.filter((p) => p.capacityDays > 0);
  return cells.reduce((max, c) => Math.max(max, c.committedUtilizationPct), 0);
}

db.transaction(() => {
  const scale = db.prepare(
    `UPDATE resource_allocation
        SET allocation_pct = MAX(0.01, ROUND(allocation_pct * ?, 3))
      WHERE role = ?`
  );
  for (const [role, target] of Object.entries(UTILISATION_TARGETS)) {
    const peak = peakUtilisation(role);
    if (!peak || !Number.isFinite(peak)) continue;
    scale.run((target * 100) / peak, role);
  }
})();

// --- 5. Demand intake board --------------------------------------------------
const insertDemand = db.prepare(
  `INSERT INTO demand_item (title, description, source, requested_by, date_raised, status,
     tshirt_size, indicative_start_date, indicative_end_date, decision_note, linked_project_id)
   VALUES (@title, @description, @source, @requested_by, @date_raised, @status,
     @tshirt_size, @indicative_start_date, @indicative_end_date, @decision_note,
     @linked_project_id)`
);
const insertSizing = db.prepare(
  `INSERT INTO sizing_estimate (demand_item_id, role, phase, estimated_person_days)
   VALUES (?, ?, ?, ?)`
);
const insertFactor = db.prepare(
  'INSERT INTO demand_complexity_factor (demand_item_id, factor_key) VALUES (?, ?)'
);

function addDemandItem(spec) {
  const item = {
    title: spec.title,
    description: spec.description,
    source: spec.source,
    requested_by: spec.requested_by || pick(SPONSORS),
    date_raised: toIso(addMonths(today, -int(0, 3))),
    status: spec.status,
    tshirt_size: spec.tshirt_size ?? null,
    indicative_start_date: spec.window ? toIso(addMonths(today, spec.window[0])) : null,
    indicative_end_date: spec.window ? toIso(addMonths(today, spec.window[1])) : null,
    decision_note: spec.decision_note ?? null,
    linked_project_id: spec.linked_project_id ?? null,
  };
  const id = Number(insertDemand.run(item).lastInsertRowid);
  if (spec.sizing) {
    for (const [role, phases] of Object.entries(spec.sizing)) {
      for (const [phase, days] of Object.entries(phases)) {
        if (days > 0) insertSizing.run(id, role, phase, days);
      }
    }
  }
  for (const factor of spec.factors || []) insertFactor.run(id, factor);
  return id;
}

db.transaction(() => {
  for (const spec of DEMAND_ITEMS) addDemandItem(spec);

  // An Approved item, linked to the project it became — this is what the board
  // looks like after a conversion has happened.
  const converted = projects.find((p) => p.budget_type === 'enhancement demand' && p.status === 'active')
    || projects[0];
  addDemandItem({
    title: 'Straight-through processing for block trade allocations',
    description: 'Approved at the March triage and converted into a funded project.',
    source: 'business request',
    status: 'Approved',
    tshirt_size: 'L',
    window: [-4, 8],
    factors: ['vendor_dependency'],
    decision_note: 'Approved — Developer capacity was available in the requested window once two lower-priority items were deferred.',
    linked_project_id: converted.id,
    sizing: {
      'Tech BA': { Discovery: 16, Build: 6, Test: 5, Deploy: 2 },
      'Biz Lead': { Discovery: 12, Build: 4, Test: 6, Deploy: 2 },
      Developer: { Discovery: 5, Build: 46, Test: 12, Deploy: 5 },
      Tester: { Discovery: 1, Build: 3, Test: 24, Deploy: 3 },
      'Tech Lead': { Discovery: 8, Build: 14, Test: 5, Deploy: 3 },
      PM: { Discovery: 5, Build: 10, Test: 6, Deploy: 3 },
    },
  });
})();

// --- 6. Report and verify ----------------------------------------------------
const final = computeCapacity(db, {
  from: window.from, to: window.to, granularity: 'quarter', includePipeline: true,
});

const counts = {
  people: db.prepare('SELECT COUNT(*) AS n FROM person').get().n,
  users: db.prepare('SELECT COUNT(*) AS n FROM app_user').get().n,
  projects: db.prepare('SELECT COUNT(*) AS n FROM project').get().n,
  milestones: db.prepare('SELECT COUNT(*) AS n FROM milestone').get().n,
  ragEntries: db.prepare('SELECT COUNT(*) AS n FROM rag_entry').get().n,
  budgetLines: db.prepare('SELECT COUNT(*) AS n FROM budget_line').get().n,
  allocations: db.prepare('SELECT COUNT(*) AS n FROM resource_allocation').get().n,
  demandItems: db.prepare('SELECT COUNT(*) AS n FROM demand_item').get().n,
  sizingEstimates: db.prepare('SELECT COUNT(*) AS n FROM sizing_estimate').get().n,
};
const reds = db.prepare("SELECT COUNT(*) AS n FROM rag_entry WHERE status = 'Red'").get().n;
const ambers = db.prepare("SELECT COUNT(*) AS n FROM rag_entry WHERE status = 'Amber'").get().n;

console.log(`\nSeeded fabricated demo data into ${defaultDbPath()}\n`);
for (const [key, value] of Object.entries(counts)) {
  console.log(`  ${key.padEnd(16)} ${value}`);
}
console.log(`  ${'RAG red/amber'.padEnd(16)} ${reds} / ${ambers}`);

console.log(`\nPeak committed utilisation by role (${window.from} → ${window.to}):`);
for (const role of final.roles) {
  const peak = role.periods
    .filter((p) => p.capacityDays > 0)
    .reduce((best, p) => (p.committedUtilizationPct > (best?.committedUtilizationPct ?? -1) ? p : best), null);
  if (!peak) continue;
  const flag = peak.status === 'red' ? '  <-- over the ceiling' : '';
  console.log(
    `  ${role.role.padEnd(10)} ${String(peak.committedUtilizationPct).padStart(6)}%  ` +
    `in ${peak.periodLabel} (${role.headcount} people)${flag}`
  );
}

const breached = final.breaches.filter((b) => b.committedOnly);
if (breached.length === 0) {
  console.error(
    '\nWARNING: no role breaches capacity in the seeded data. Section 11 requires the ' +
    'demo to show the ceiling being hit — check UTILISATION_TARGETS in this script.'
  );
  process.exitCode = 1;
} else {
  console.log(
    `\n${breached.length} committed capacity breach(es) seeded, worst: ` +
    `${breached[0].role} at ${breached[0].utilizationPct}% in ${breached[0].periodLabel}.`
  );
}

console.log(`\nSign in with any of these — all use the password  ${DEMO_PASSWORD}`);
console.log('  admin@gfm.example        (admin — full access, assumptions, users)');
console.log(`  ${demoUsers.find((u) => u.accessRole === 'pm').email.padEnd(24)} (PM — owns projects)`);
console.log(`  ${demoUsers.find((u) => u.accessRole === 'biz_lead').email.padEnd(24)} (Biz Lead)`);
console.log(`  ${demoUsers.find((u) => u.accessRole === 'resource').email.padEnd(24)} (resource — own allocations only)`);
console.log('  psc.chair@gfm.example    (PSC — read-only portfolio view)\n');

db.close();
