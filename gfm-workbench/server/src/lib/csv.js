/**
 * CSV export (Section 8 — a stated PSC-pack workflow need, not a nice-to-have).
 *
 * Hand-rolled rather than pulled in: the escaping rules are four lines and the
 * dependency surface of this repo matters more than the convenience.
 */

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // A leading =, +, - or @ is interpreted as a formula by Excel. Prefixing an
  // apostrophe keeps exported commentary from being executed on open.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

/**
 * @param {{key:string,label:string,format?:(row:any)=>any}[]} columns
 * @param {object[]} rows
 */
export function toCsv(columns, rows) {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows.map((row) =>
    columns
      .map((c) => escapeCell(c.format ? c.format(row) : row[c.key]))
      .join(',')
  );
  // BOM so Excel opens UTF-8 commentary correctly.
  return `﻿${[header, ...body].join('\r\n')}\r\n`;
}

export function sendCsv(res, filename, columns, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(columns, rows));
}
