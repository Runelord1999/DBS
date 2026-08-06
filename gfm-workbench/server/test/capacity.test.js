import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db/index.js';
import { capacityCheck, computeCapacity, personCapacity } from '../src/domain/capacity.js';

const YEAR = { from: '2026-01-01', to: '2026-12-31', granularity: 'year' };

function fixture() {
  const db = openDb(':memory:');
  const addPerson = db.prepare(
    "INSERT INTO person (name, role, team, employment_type, active) VALUES (?, ?, 'Tech', 'perm', 1)"
  );
  const addProject = db.prepare(
    "INSERT INTO project (name, status, start_date, target_end_date) VALUES (?, ?, '2026-01-01', '2026-12-31')"
  );
  return { db, addPerson, addProject };
}

function roleRow(result, role) {
  return result.roles.find((r) => r.role === role);
}

test('one person fully allocated for a year reads as 100% utilised', () => {
  const { db, addPerson, addProject } = fixture();
  const personId = Number(addPerson.run('A Tester', 'Tester').lastInsertRowid);
  const projectId = Number(addProject.run('Test project', 'active').lastInsertRowid);
  db.prepare(
    `INSERT INTO resource_allocation (project_id, person_id, role, allocation_pct, start_date, end_date)
     VALUES (?, ?, 'Tester', 1.0, '2026-01-01', '2026-12-31')`
  ).run(projectId, personId);

  const result = computeCapacity(db, YEAR);
  const tester = roleRow(result, 'Tester');
  assert.equal(tester.headcount, 1);
  assert.equal(Math.round(tester.totals.capacityDays), 200);
  assert.equal(Math.round(tester.totals.allocatedDays), 200);
  assert.equal(tester.totals.committedUtilizationPct, 100);
  assert.equal(tester.totals.status, 'red', '100% is at the ceiling, not under it');
  db.close();
});

test('a half-time allocation consumes half the capacity', () => {
  const { db, addPerson, addProject } = fixture();
  const personId = Number(addPerson.run('B Dev', 'Developer').lastInsertRowid);
  const projectId = Number(addProject.run('Half project', 'active').lastInsertRowid);
  db.prepare(
    `INSERT INTO resource_allocation (project_id, person_id, role, allocation_pct, start_date, end_date)
     VALUES (?, ?, 'Developer', 0.5, '2026-01-01', '2026-12-31')`
  ).run(projectId, personId);

  const dev = roleRow(computeCapacity(db, YEAR), 'Developer');
  assert.equal(dev.totals.committedUtilizationPct, 50);
  assert.equal(dev.totals.status, 'green');
  db.close();
});

test('capacity scales with headcount', () => {
  const { db, addPerson, addProject } = fixture();
  addPerson.run('Dev One', 'Developer');
  addPerson.run('Dev Two', 'Developer');
  const projectId = Number(addProject.run('Shared', 'active').lastInsertRowid);
  db.prepare(
    `INSERT INTO resource_allocation (project_id, person_id, role, allocation_pct, start_date, end_date)
     VALUES (?, NULL, 'Developer', 1.0, '2026-01-01', '2026-12-31')`
  ).run(projectId);

  const dev = roleRow(computeCapacity(db, YEAR), 'Developer');
  assert.equal(dev.headcount, 2);
  assert.equal(Math.round(dev.totals.capacityDays), 400);
  assert.equal(dev.totals.committedUtilizationPct, 50);
  db.close();
});

test('over-allocation is reported as a breach with the days over', () => {
  const { db, addPerson, addProject } = fixture();
  addPerson.run('Only BA', 'Tech BA');
  const projectId = Number(addProject.run('Too much', 'active').lastInsertRowid);
  const insert = db.prepare(
    `INSERT INTO resource_allocation (project_id, person_id, role, allocation_pct, start_date, end_date)
     VALUES (?, NULL, 'Tech BA', ?, '2026-01-01', '2026-12-31')`
  );
  insert.run(projectId, 0.8);
  insert.run(projectId, 0.5);

  const result = computeCapacity(db, YEAR);
  const ba = roleRow(result, 'Tech BA');
  assert.equal(ba.totals.committedUtilizationPct, 130);
  assert.equal(ba.totals.status, 'red');
  assert.ok(Math.abs(ba.totals.remainingDays + 60) < 1, 'should be ~60 person-days short');

  const breach = result.breaches.find((b) => b.role === 'Tech BA');
  assert.ok(breach, 'breach should be listed');
  assert.equal(breach.committedOnly, true);
  db.close();
});

test('closed and on-hold projects do not consume capacity by default', () => {
  const { db, addPerson, addProject } = fixture();
  addPerson.run('Solo PM', 'PM');
  const closed = Number(addProject.run('Closed', 'closed').lastInsertRowid);
  const onHold = Number(addProject.run('Paused', 'on-hold').lastInsertRowid);
  const insert = db.prepare(
    `INSERT INTO resource_allocation (project_id, person_id, role, allocation_pct, start_date, end_date)
     VALUES (?, NULL, 'PM', 1.0, '2026-01-01', '2026-12-31')`
  );
  insert.run(closed);
  insert.run(onHold);

  assert.equal(roleRow(computeCapacity(db, YEAR), 'PM').totals.allocatedDays, 0);

  const withHold = computeCapacity(db, { ...YEAR, projectStatuses: ['active', 'on-hold'] });
  assert.equal(roleRow(withHold, 'PM').totals.committedUtilizationPct, 100);
  db.close();
});

test('allocations are pro-rated onto the periods they overlap', () => {
  const { db, addPerson, addProject } = fixture();
  addPerson.run('Quarterly Dev', 'Developer');
  const projectId = Number(addProject.run('Q1 only', 'active').lastInsertRowid);
  db.prepare(
    `INSERT INTO resource_allocation (project_id, person_id, role, allocation_pct, start_date, end_date)
     VALUES (?, NULL, 'Developer', 1.0, '2026-01-01', '2026-03-31')`
  ).run(projectId);

  const dev = roleRow(computeCapacity(db, { ...YEAR, granularity: 'quarter' }), 'Developer');
  assert.equal(dev.periods[0].committedUtilizationPct, 100);
  assert.equal(dev.periods[1].allocatedDays, 0);
  assert.ok(dev.totals.committedUtilizationPct < 30, 'a quarter of the year is a quarter of the load');
  db.close();
});

test('pipeline demand is reported separately from committed demand', () => {
  const { db, addPerson } = fixture();
  addPerson.run('Pipeline BA', 'Tech BA');
  const demandId = Number(db.prepare(
    `INSERT INTO demand_item (title, source, status, tshirt_size,
       indicative_start_date, indicative_end_date)
     VALUES ('Incoming work', 'business request', 'Triage', 'M', '2026-01-01', '2026-12-31')`
  ).run().lastInsertRowid);
  db.prepare(
    `INSERT INTO sizing_estimate (demand_item_id, role, phase, estimated_person_days)
     VALUES (?, 'Tech BA', 'Build', 100)`
  ).run(demandId);

  const ba = roleRow(computeCapacity(db, YEAR), 'Tech BA');
  assert.equal(ba.totals.allocatedDays, 0, 'nothing is committed yet');
  assert.equal(Math.round(ba.totals.pipelineDays), 100);
  assert.equal(ba.totals.committedUtilizationPct, 0);
  assert.equal(ba.totals.utilizationPct, 50);

  const withoutPipeline = computeCapacity(db, { ...YEAR, includePipeline: false });
  assert.equal(roleRow(withoutPipeline, 'Tech BA').totals.pipelineDays, 0);
  db.close();
});

test('unsized and unscheduled pipeline items are surfaced, never invented into a role', () => {
  const { db, addPerson } = fixture();
  addPerson.run('A BA', 'Tech BA');
  db.prepare(
    `INSERT INTO demand_item (title, source, status, tshirt_size)
     VALUES ('No detail yet', 'other', 'T-Shirt Sized', 'L')`
  ).run();
  const noWindow = Number(db.prepare(
    `INSERT INTO demand_item (title, source, status, tshirt_size)
     VALUES ('Sized but undated', 'other', 'Triage', 'M')`
  ).run().lastInsertRowid);
  db.prepare(
    `INSERT INTO sizing_estimate (demand_item_id, role, phase, estimated_person_days)
     VALUES (?, 'Tech BA', 'Build', 40)`
  ).run(noWindow);

  const result = computeCapacity(db, YEAR);
  assert.equal(result.pipeline.unsized.length, 1);
  assert.equal(result.pipeline.unsized[0].title, 'No detail yet');
  assert.equal(result.pipeline.unscheduled.length, 1);
  assert.equal(result.pipeline.unscheduled[0].totalDays, 40);
  assert.equal(roleRow(result, 'Tech BA').totals.pipelineDays, 0, 'neither reaches the role grid');
  db.close();
});

test('complexity factors lift the person-days that hit capacity', () => {
  const { db, addPerson } = fixture();
  addPerson.run('Loaded BA', 'Tech BA');
  const demandId = Number(db.prepare(
    `INSERT INTO demand_item (title, source, status, tshirt_size,
       indicative_start_date, indicative_end_date)
     VALUES ('Regulatory build', 'new regulatory', 'Triage', 'L', '2026-01-01', '2026-12-31')`
  ).run().lastInsertRowid);
  db.prepare(
    `INSERT INTO sizing_estimate (demand_item_id, role, phase, estimated_person_days)
     VALUES (?, 'Tech BA', 'Build', 100)`
  ).run(demandId);
  db.prepare(
    "INSERT INTO demand_complexity_factor (demand_item_id, factor_key) VALUES (?, 'regulatory')"
  ).run(demandId);

  // regulatory carries a 15% uplift by default.
  const ba = roleRow(computeCapacity(db, YEAR), 'Tech BA');
  assert.equal(Math.round(ba.totals.pipelineDays), 115);
  db.close();
});

test('per-person effective days override the global assumption', () => {
  const { db, addProject } = fixture();
  db.prepare(
    `INSERT INTO person (name, role, team, employment_type, active, effective_days_per_year)
     VALUES ('Part timer', 'Developer', 'Tech', 'contractor', 1, 100)`
  ).run();
  const projectId = Number(addProject.run('Small', 'active').lastInsertRowid);
  db.prepare(
    `INSERT INTO resource_allocation (project_id, person_id, role, allocation_pct, start_date, end_date)
     VALUES (?, NULL, 'Developer', 0.5, '2026-01-01', '2026-12-31')`
  ).run(projectId);

  const dev = roleRow(computeCapacity(db, YEAR), 'Developer');
  assert.equal(Math.round(dev.totals.capacityDays), 100);
  assert.equal(dev.totals.committedUtilizationPct, 100);
  db.close();
});

test('changing the effective-days assumption moves the whole model', () => {
  const { db, addPerson, addProject } = fixture();
  addPerson.run('Steady Dev', 'Developer');
  const projectId = Number(addProject.run('Steady', 'active').lastInsertRowid);
  db.prepare(
    `INSERT INTO resource_allocation (project_id, person_id, role, allocation_pct, start_date, end_date)
     VALUES (?, NULL, 'Developer', 1.0, '2026-01-01', '2026-12-31')`
  ).run(projectId);

  db.prepare("UPDATE assumption SET value = '160' WHERE key = 'capacity.effective_days_per_year'").run();
  const dev = roleRow(computeCapacity(db, YEAR), 'Developer');
  assert.equal(Math.round(dev.totals.capacityDays), 160);
  assert.equal(dev.totals.committedUtilizationPct, 100, 'demand rescales with supply');
  db.close();
});

test('capacityCheck refuses to answer without a window or a Tier 2 estimate', () => {
  const { db, addPerson } = fixture();
  addPerson.run('A BA', 'Tech BA');
  const unsized = Number(db.prepare(
    `INSERT INTO demand_item (title, source, status, tshirt_size,
       indicative_start_date, indicative_end_date)
     VALUES ('Unsized', 'other', 'Triage', 'M', '2026-01-01', '2026-06-30')`
  ).run().lastInsertRowid);
  assert.equal(capacityCheck(db, unsized).testable, false);

  const undated = Number(db.prepare(
    `INSERT INTO demand_item (title, source, status, tshirt_size)
     VALUES ('Undated', 'other', 'Triage', 'M')`
  ).run().lastInsertRowid);
  db.prepare(
    `INSERT INTO sizing_estimate (demand_item_id, role, phase, estimated_person_days)
     VALUES (?, 'Tech BA', 'Build', 10)`
  ).run(undated);
  assert.equal(capacityCheck(db, undated).testable, false);
  db.close();
});

test('capacityCheck reports the utilisation a demand item would cause', () => {
  const { db, addPerson, addProject } = fixture();
  addPerson.run('The BA', 'Tech BA');
  const projectId = Number(addProject.run('Committed', 'active').lastInsertRowid);
  db.prepare(
    `INSERT INTO resource_allocation (project_id, person_id, role, allocation_pct, start_date, end_date)
     VALUES (?, NULL, 'Tech BA', 0.8, '2026-01-01', '2026-12-31')`
  ).run(projectId);

  const demandId = Number(db.prepare(
    `INSERT INTO demand_item (title, source, status, tshirt_size,
       indicative_start_date, indicative_end_date)
     VALUES ('New ask', 'business request', 'Triage', 'M', '2026-01-01', '2026-12-31')`
  ).run().lastInsertRowid);
  db.prepare(
    `INSERT INTO sizing_estimate (demand_item_id, role, phase, estimated_person_days)
     VALUES (?, 'Tech BA', 'Build', 60)`
  ).run(demandId);

  const check = capacityCheck(db, demandId, { granularity: 'year' });
  assert.equal(check.testable, true);
  const ba = check.roles.find((r) => r.role === 'Tech BA');
  assert.equal(ba.requiredDays, 60);
  const cell = ba.periods[0];
  // 160 committed of 200, +60 required = 220 → 110%.
  assert.equal(cell.utilizationBeforePct, 80);
  assert.equal(cell.utilizationAfterPct, 110);
  assert.equal(cell.breach, true);
  assert.equal(check.verdict.fits, false);
  db.close();
});

test('capacityCheck does not count a pipeline item against itself', () => {
  const { db, addPerson } = fixture();
  addPerson.run('The BA', 'Tech BA');
  const demandId = Number(db.prepare(
    `INSERT INTO demand_item (title, source, status,
       indicative_start_date, indicative_end_date)
     VALUES ('Only item', 'business request', 'Triage', '2026-01-01', '2026-12-31')`
  ).run().lastInsertRowid);
  db.prepare(
    `INSERT INTO sizing_estimate (demand_item_id, role, phase, estimated_person_days)
     VALUES (?, 'Tech BA', 'Build', 50)`
  ).run(demandId);

  const cell = capacityCheck(db, demandId, { granularity: 'year' })
    .roles.find((r) => r.role === 'Tech BA').periods[0];
  assert.equal(cell.utilizationBeforePct, 0, 'the item is stripped from the "before" picture');
  assert.equal(cell.utilizationAfterPct, 25);
  assert.equal(cell.breach, false);
  db.close();
});

test('personCapacity shows one person their own load across projects', () => {
  const { db, addPerson, addProject } = fixture();
  const personId = Number(addPerson.run('Busy Dev', 'Developer').lastInsertRowid);
  const a = Number(addProject.run('Project A', 'active').lastInsertRowid);
  const b = Number(addProject.run('Project B', 'active').lastInsertRowid);
  const insert = db.prepare(
    `INSERT INTO resource_allocation (project_id, person_id, role, allocation_pct, start_date, end_date)
     VALUES (?, ?, 'Developer', ?, '2026-01-01', '2026-12-31')`
  );
  insert.run(a, personId, 0.6);
  insert.run(b, personId, 0.6);

  const result = personCapacity(db, personId, { ...YEAR });
  assert.equal(result.allocations.length, 2);
  assert.equal(result.periodRows[0].utilizationPct, 120);
  assert.equal(result.periodRows[0].status, 'red');
  db.close();
});

test('inactive people do not contribute capacity', () => {
  const { db } = fixture();
  db.prepare(
    "INSERT INTO person (name, role, team, employment_type, active) VALUES ('Left', 'Developer', 'Tech', 'perm', 0)"
  ).run();
  const dev = roleRow(computeCapacity(db, YEAR), 'Developer');
  assert.equal(dev.headcount, 0);
  assert.equal(dev.totals.capacityDays, 0);
  db.close();
});
