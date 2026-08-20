/**
 * Small request helpers. Deliberately not a validation library — the schema
 * already carries CHECK constraints, and this layer only needs to turn bad
 * input into a 400 with a readable message instead of a 500.
 */

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const notFound = (message = 'Not found') => new HttpError(404, message);

/** Wraps a handler so thrown errors reach the error middleware. */
export function handler(fn) {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

export function errorMiddleware(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  // SQLite constraint violations are user error far more often than bugs.
  if (err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
    return res.status(400).json({ error: 'Rejected by a data constraint', details: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

/** Copies only the named fields that are actually present in the body. */
export function pick(body, fields) {
  const out = {};
  for (const field of fields) {
    if (body != null && Object.prototype.hasOwnProperty.call(body, field)) {
      out[field] = body[field];
    }
  }
  return out;
}

export function requireFields(body, fields) {
  const missing = fields.filter(
    (f) => body == null || body[f] === undefined || body[f] === null || body[f] === ''
  );
  if (missing.length) {
    throw badRequest(`Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }
}

export function oneOf(value, allowed, fieldName) {
  if (value === undefined) return;
  if (!allowed.includes(value)) {
    throw badRequest(`${fieldName} must be one of: ${allowed.join(', ')}`);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(value) {
  return typeof value === 'string' && DATE_RE.test(value);
}

export function assertDate(value, fieldName) {
  if (value === undefined || value === null || value === '') return;
  if (!isDate(value)) throw badRequest(`${fieldName} must be a date in YYYY-MM-DD form`);
}

export function assertDateOrder(start, end, startName = 'start_date', endName = 'end_date') {
  if (isDate(start) && isDate(end) && end < start) {
    throw badRequest(`${endName} cannot be before ${startName}`);
  }
}

/** Builds an UPDATE from a partial patch; returns false when nothing changed. */
export function applyUpdate(db, table, id, patch, { touch = true } = {}) {
  const keys = Object.keys(patch);
  if (!keys.length) return false;
  const sets = keys.map((k) => `${k} = @${k}`);
  if (touch) sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = @id`).run({ ...patch, id });
  return true;
}

export function toNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest(`${fieldName} must be a number`);
  return n;
}

export function toBool(value, fallback = undefined) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function csvList(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}
