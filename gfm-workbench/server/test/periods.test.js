import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPeriods, effectiveDays, fiscalYearOf, overlap, workingDays, workingDaysInYear,
} from '../src/domain/periods.js';

test('workingDays counts Mon–Fri inclusive', () => {
  // 2026-01-05 is a Monday.
  assert.equal(workingDays('2026-01-05', '2026-01-09'), 5);
  assert.equal(workingDays('2026-01-05', '2026-01-11'), 5); // adds Sat + Sun
  assert.equal(workingDays('2026-01-10', '2026-01-11'), 0); // weekend only
  assert.equal(workingDays('2026-01-05', '2026-01-05'), 1);
});

test('workingDays returns 0 for an inverted range', () => {
  assert.equal(workingDays('2026-03-01', '2026-02-01'), 0);
});

test('a calendar year holds the expected number of working days', () => {
  // 2026 starts on a Thursday: 52 whole weeks plus one weekday.
  assert.equal(workingDaysInYear(2026), 261);
  assert.equal(workingDaysInYear(2027), 261);
});

test('effectiveDays over a full year equals the annual assumption', () => {
  assert.equal(Math.round(effectiveDays('2026-01-01', '2026-12-31', 200)), 200);
});

test('effectiveDays pro-rates a part year and spans a year boundary', () => {
  const h1 = effectiveDays('2026-01-01', '2026-06-30', 200);
  const h2 = effectiveDays('2026-07-01', '2026-12-31', 200);
  assert.ok(Math.abs(h1 + h2 - 200) < 0.01, 'halves should sum to the annual figure');

  const straddle = effectiveDays('2026-12-01', '2027-01-31', 200);
  const dec = effectiveDays('2026-12-01', '2026-12-31', 200);
  const jan = effectiveDays('2027-01-01', '2027-01-31', 200);
  assert.ok(Math.abs(straddle - (dec + jan)) < 0.01);
});

test('overlap intersects ranges and reports non-overlap as null', () => {
  const o = overlap('2026-01-01', '2026-06-30', '2026-04-01', '2026-12-31');
  assert.equal(o.start.toISOString().slice(0, 10), '2026-04-01');
  assert.equal(o.end.toISOString().slice(0, 10), '2026-06-30');
  assert.equal(overlap('2026-01-01', '2026-03-31', '2026-04-01', '2026-12-31'), null);
});

test('buildPeriods produces contiguous fiscal quarters', () => {
  const periods = buildPeriods('2026-01-01', '2026-12-31', 'quarter', 1);
  assert.equal(periods.length, 4);
  assert.equal(periods[0].key, 'FY2026-Q1');
  assert.equal(periods[0].start, '2026-01-01');
  assert.equal(periods[0].end, '2026-03-31');
  assert.equal(periods[3].end, '2026-12-31');
});

test('buildPeriods honours a non-January fiscal year start', () => {
  const periods = buildPeriods('2026-04-01', '2027-03-31', 'quarter', 4);
  assert.equal(periods.length, 4);
  assert.equal(periods[0].start, '2026-04-01');
  assert.equal(periods[3].end, '2027-03-31');
  assert.equal(fiscalYearOf('2026-03-31', 4), 2025);
  assert.equal(fiscalYearOf('2026-04-01', 4), 2026);
});

test('buildPeriods supports month and year granularity', () => {
  assert.equal(buildPeriods('2026-01-01', '2026-03-31', 'month', 1).length, 3);
  assert.equal(buildPeriods('2026-01-01', '2027-12-31', 'year', 1).length, 2);
});
