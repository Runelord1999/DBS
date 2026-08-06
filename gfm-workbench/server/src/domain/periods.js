/**
 * Calendar / period helpers.
 *
 * Everything here is pure and date-string based (YYYY-MM-DD, UTC) so the
 * capacity math in capacity.js can be unit-tested without a database.
 */

const MS_DAY = 86_400_000;

export function toDate(value) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function toIso(date) {
  return toDate(date).toISOString().slice(0, 10);
}

export function addDays(date, n) {
  return new Date(toDate(date).getTime() + n * MS_DAY);
}

export function maxDate(a, b) {
  return toDate(a) > toDate(b) ? toDate(a) : toDate(b);
}

export function minDate(a, b) {
  return toDate(a) < toDate(b) ? toDate(a) : toDate(b);
}

/**
 * Mon–Fri days in [start, end] inclusive. Counted arithmetically rather than
 * by looping the calendar — this runs inside every capacity aggregation.
 *
 * `workingDaysPerWeek` other than 5 falls back to a proportional estimate,
 * since we have no calendar model for a non Mon–Fri week.
 */
export function workingDays(start, end, workingDaysPerWeek = 5) {
  const s = toDate(start);
  const e = toDate(end);
  if (e < s) return 0;

  const totalDays = Math.round((e - s) / MS_DAY) + 1;
  if (workingDaysPerWeek !== 5) {
    return (totalDays * workingDaysPerWeek) / 7;
  }

  const fullWeeks = Math.floor(totalDays / 7);
  let count = fullWeeks * 5;
  const remainder = totalDays - fullWeeks * 7;
  const firstDow = s.getUTCDay(); // 0 = Sunday, 6 = Saturday
  for (let i = 0; i < remainder; i += 1) {
    const dow = (firstDow + i) % 7;
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

export function workingDaysInYear(year, workingDaysPerWeek = 5) {
  return workingDays(`${year}-01-01`, `${year}-12-31`, workingDaysPerWeek);
}

/** Overlap of two inclusive ranges, or null when they do not intersect. */
export function overlap(aStart, aEnd, bStart, bEnd) {
  const start = maxDate(aStart, bStart);
  const end = minDate(aEnd, bEnd);
  if (end < start) return null;
  return { start, end };
}

/**
 * Effective delivery days available in a range for one person.
 *
 * A person does not deliver on every working day — leave, public holidays,
 * training and BAU absorb some of them. `effectiveDaysPerYear` (default 200,
 * a Section 13 placeholder) is the annual net figure; here it is pro-rated
 * onto the range by working days, handling ranges that straddle year ends.
 *
 * The same scaling is applied to allocations, so a 1.0 FTE allocation running
 * a full year consumes exactly 100% of one person — not 260/200 = 130%.
 */
export function effectiveDays(start, end, effectiveDaysPerYear, workingDaysPerWeek = 5) {
  const s = toDate(start);
  const e = toDate(end);
  if (e < s) return 0;

  let total = 0;
  for (let year = s.getUTCFullYear(); year <= e.getUTCFullYear(); year += 1) {
    const slice = overlap(s, e, `${year}-01-01`, `${year}-12-31`);
    if (!slice) continue;
    const yearWorkingDays = workingDaysInYear(year, workingDaysPerWeek);
    if (yearWorkingDays === 0) continue;
    const factor = effectiveDaysPerYear / yearWorkingDays;
    total += workingDays(slice.start, slice.end, workingDaysPerWeek) * factor;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Fiscal periods
// ---------------------------------------------------------------------------

/**
 * The fiscal year a date falls in, labelled by the calendar year the fiscal
 * year *starts* in. With the default start month of January this is simply the
 * calendar year. (Section 13: confirm the real GFM fiscal calendar.)
 */
export function fiscalYearOf(date, startMonth = 1) {
  const d = toDate(date);
  const year = d.getUTCFullYear();
  return d.getUTCMonth() + 1 >= startMonth ? year : year - 1;
}

export function fiscalYearRange(fiscalYear, startMonth = 1) {
  const start = new Date(Date.UTC(fiscalYear, startMonth - 1, 1));
  const end = addDays(new Date(Date.UTC(fiscalYear + 1, startMonth - 1, 1)), -1);
  return { start, end };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function endOfMonth(year, monthIndex) {
  return addDays(new Date(Date.UTC(year, monthIndex + 1, 1)), -1);
}

/**
 * Build the period buckets a capacity view is reported over.
 *
 * @param {string} from        inclusive start date
 * @param {string} to          inclusive end date
 * @param {'month'|'quarter'|'year'} granularity
 * @param {number} startMonth  fiscal year start month (1-12)
 * @returns {{key:string,label:string,start:string,end:string}[]}
 */
export function buildPeriods(from, to, granularity = 'quarter', startMonth = 1) {
  const rangeStart = toDate(from);
  const rangeEnd = toDate(to);
  if (rangeEnd < rangeStart) return [];
  const periods = [];

  if (granularity === 'month') {
    let cursor = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1));
    while (cursor <= rangeEnd) {
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth();
      periods.push({
        key: `${y}-${String(m + 1).padStart(2, '0')}`,
        label: `${MONTH_NAMES[m]} ${y}`,
        start: toIso(cursor),
        end: toIso(endOfMonth(y, m)),
      });
      cursor = new Date(Date.UTC(y, m + 1, 1));
    }
    return periods;
  }

  if (granularity === 'year') {
    let fy = fiscalYearOf(rangeStart, startMonth);
    const lastFy = fiscalYearOf(rangeEnd, startMonth);
    while (fy <= lastFy) {
      const { start, end } = fiscalYearRange(fy, startMonth);
      periods.push({
        key: `FY${fy}`,
        label: `FY${fy}`,
        start: toIso(start),
        end: toIso(end),
      });
      fy += 1;
    }
    return periods;
  }

  // quarter (fiscal)
  let fy = fiscalYearOf(rangeStart, startMonth);
  const lastFy = fiscalYearOf(rangeEnd, startMonth);
  while (fy <= lastFy) {
    for (let q = 0; q < 4; q += 1) {
      const qStart = new Date(Date.UTC(fy, startMonth - 1 + q * 3, 1));
      const qEnd = addDays(new Date(Date.UTC(fy, startMonth - 1 + q * 3 + 3, 1)), -1);
      if (qEnd < rangeStart || qStart > rangeEnd) continue;
      periods.push({
        key: `FY${fy}-Q${q + 1}`,
        label: `FY${String(fy).slice(2)} Q${q + 1}`,
        start: toIso(qStart),
        end: toIso(qEnd),
        sublabel: `${MONTH_NAMES[qStart.getUTCMonth()]}–${MONTH_NAMES[qEnd.getUTCMonth()]} ${qEnd.getUTCFullYear()}`,
      });
    }
    fy += 1;
  }
  return periods;
}

/** Default reporting window: this fiscal year plus the next. */
export function defaultWindow(today = new Date(), startMonth = 1) {
  const fy = fiscalYearOf(today, startMonth);
  const { start } = fiscalYearRange(fy, startMonth);
  const { end } = fiscalYearRange(fy + 1, startMonth);
  return { from: toIso(start), to: toIso(end) };
}
