export function money(value, currency = 'SGD', { compact = true } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (compact && Math.abs(n) >= 1000) {
    const millions = n / 1_000_000;
    if (Math.abs(n) >= 1_000_000) {
      return `${currency} ${millions.toFixed(millions >= 10 ? 1 : 2)}m`;
    }
    return `${currency} ${Math.round(n / 1000)}k`;
  }
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function moneyExact(value, currency = 'SGD') {
  if (value === null || value === undefined) return '—';
  return `${currency} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function days(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function pct(value) {
  if (value === null || value === undefined) return '—';
  if (!Number.isFinite(value)) return '∞';
  return `${Number(value).toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

export function date(value) {
  if (!value) return '—';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dateShort(value) {
  if (!value) return '—';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' });
}

export function fte(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(2);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function addMonthsIso(iso, months) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Capacity/RAG status → the reserved status colour role. */
export const STATUS_VAR = {
  green: 'var(--status-good)',
  amber: 'var(--status-warning)',
  red: 'var(--status-critical)',
  Green: 'var(--status-good)',
  Amber: 'var(--status-warning)',
  Red: 'var(--status-critical)',
};

/** Status colours never carry meaning alone — each ships with this glyph. */
export const STATUS_ICON = {
  green: '●', amber: '▲', red: '■',
  Green: '●', Amber: '▲', Red: '■',
};
