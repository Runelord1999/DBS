import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db/index.js';
import { complexityUplift, demandReadiness, sizeDemandItem } from '../src/domain/sizing.js';

function makeItem(db, overrides = {}) {
  const item = {
    title: 'Test demand', source: 'business request', status: 'Triage',
    tshirt_size: null, indicative_start_date: null, indicative_end_date: null, ...overrides,
  };
  const keys = Object.keys(item);
  return Number(db.prepare(
    `INSERT INTO demand_item (${keys.join(', ')}) VALUES (${keys.map((k) => `@${k}`).join(', ')})`
  ).run(item).lastInsertRowid);
}

function addEstimate(db, id, role, phase, days) {
  db.prepare(
    `INSERT INTO sizing_estimate (demand_item_id, role, phase, estimated_person_days)
     VALUES (?, ?, ?, ?)`
  ).run(id, role, phase, days);
}

test('complexity uplift is additive and always upward', () => {
  const none = complexityUplift([]);
  assert.equal(none.multiplier, 1);

  const two = complexityUplift([
    { key: 'regulatory', label: 'Regulatory', uplift_pct: 15 },
    { key: 'vendor_dependency', label: 'Vendor', uplift_pct: 10 },
  ]);
  assert.equal(two.totalUpliftPct, 25);
  assert.equal(two.multiplier, 1.25);
  assert.equal(two.factors.length, 2, 'every applied factor stays itemised');
});

test('a Tier 2 grid totals by role and by phase', () => {
  const db = openDb(':memory:');
  const id = makeItem(db, { tshirt_size: 'M' });
  addEstimate(db, id, 'Tech BA', 'Discovery', 10);
  addEstimate(db, id, 'Tech BA', 'Build', 5);
  addEstimate(db, id, 'Developer', 'Build', 20);
  addEstimate(db, id, 'Tester', 'Test', 8);

  const sizing = sizeDemandItem(db, id);
  assert.equal(sizing.tier2.baselineTotalDays, 43);
  assert.equal(sizing.tier2.byRole['Tech BA'], 15);
  assert.equal(sizing.tier2.byRole.Developer, 20);
  assert.equal(sizing.tier2.byRole.PM, 0);
  assert.equal(sizing.tier2.phaseTotals.Build, 25);
  assert.equal(sizing.tier2.complete, true);
  db.close();
});

test('the complexity arithmetic is exposed, not just the result', () => {
  const db = openDb(':memory:');
  const id = makeItem(db, { tshirt_size: 'M' });
  addEstimate(db, id, 'Developer', 'Build', 100);
  db.prepare(
    "INSERT INTO demand_complexity_factor (demand_item_id, factor_key) VALUES (?, 'regulatory')"
  ).run(id);
  db.prepare(
    "INSERT INTO demand_complexity_factor (demand_item_id, factor_key) VALUES (?, 'cross_border')"
  ).run(id);

  const { complexity, tier2 } = sizeDemandItem(db, id);
  assert.equal(complexity.baselineTotalDays, 100);
  assert.equal(complexity.totalUpliftPct, 25);
  assert.equal(complexity.upliftDays, 25);
  assert.equal(complexity.adjustedTotalDays, 125);
  assert.deepEqual(complexity.factors.map((f) => f.key), ['regulatory', 'cross_border']);
  assert.equal(tier2.byRole.Developer, 125);
  db.close();
});

test('a Tier 2 total outside its t-shirt band is flagged, not corrected', () => {
  const db = openDb(':memory:');
  const id = makeItem(db, { tshirt_size: 'S' }); // S band is 5–20 person-days
  addEstimate(db, id, 'Developer', 'Build', 90);

  const { tier1 } = sizeDemandItem(db, id);
  assert.equal(tier1.consistency.checked, true);
  assert.equal(tier1.consistency.agrees, false);
  assert.match(tier1.consistency.message, /above/);
  assert.equal(sizeDemandItem(db, id).tier2.baselineTotalDays, 90, 'the estimate is left alone');
  db.close();
});

test('a consistent estimate raises no flag', () => {
  const db = openDb(':memory:');
  const id = makeItem(db, { tshirt_size: 'M' }); // 20–60 person-days
  addEstimate(db, id, 'Developer', 'Build', 30);
  const { tier1 } = sizeDemandItem(db, id);
  assert.equal(tier1.consistency.agrees, true);
  assert.equal(tier1.consistency.message, null);
  db.close();
});

test('approval is blocked until Tier 2 sizing and a window exist', () => {
  const db = openDb(':memory:');
  const id = makeItem(db, { tshirt_size: 'M' });

  let readiness = demandReadiness(db, id);
  assert.equal(readiness.canMoveTo.Approved.allowed, false);
  assert.equal(readiness.canMoveTo['T-Shirt Sized'].allowed, true);
  assert.match(readiness.canMoveTo.Approved.blockers.join(' '), /Tier 2/);
  assert.match(readiness.canMoveTo.Approved.blockers.join(' '), /indicative delivery window/);

  addEstimate(db, id, 'Developer', 'Build', 30);
  db.prepare(
    `UPDATE demand_item SET indicative_start_date = '2026-01-01',
       indicative_end_date = '2026-06-30' WHERE id = ?`
  ).run(id);

  readiness = demandReadiness(db, id);
  assert.equal(readiness.canMoveTo.Approved.allowed, true);
  assert.deepEqual(readiness.canMoveTo.Approved.blockers, []);
  db.close();
});

test('an item with no t-shirt size cannot reach T-Shirt Sized', () => {
  const db = openDb(':memory:');
  const id = makeItem(db, { status: 'New' });
  const readiness = demandReadiness(db, id);
  assert.equal(readiness.canMoveTo['T-Shirt Sized'].allowed, false);
  assert.equal(readiness.canMoveTo.Rejected.allowed, true, 'rejection is always available');
  assert.equal(readiness.canMoveTo.Deferred.allowed, true);
  db.close();
});
