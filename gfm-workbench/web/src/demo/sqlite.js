/**
 * A better-sqlite3-compatible facade over sql.js (SQLite compiled to wasm),
 * for the static demo build only.
 *
 * This exists so the server's query code — every route, plus the capacity and
 * sizing domain modules — runs unchanged in the browser. It implements the
 * slice of the better-sqlite3 API the server actually uses, and nothing else.
 */

import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

/** sql.js rejects booleans and undefined; SQLite has neither. */
function coerce(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

/**
 * better-sqlite3 accepts either positional args or a single object for named
 * (@key) parameters. sql.js wants the sigil included in the object keys.
 */
function normalizeParams(args) {
  if (args.length === 0) return undefined;
  const [first] = args;
  if (args.length === 1 && first !== null && typeof first === 'object'
      && !Array.isArray(first) && !(first instanceof Date)) {
    const bound = {};
    for (const [key, value] of Object.entries(first)) bound[`@${key}`] = coerce(value);
    return bound;
  }
  return args.map(coerce);
}

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  #run(args, collect) {
    const params = normalizeParams(args);
    const stmt = this.db.raw.prepare(this.sql);
    try {
      if (params !== undefined) stmt.bind(params);
      return collect(stmt);
    } finally {
      stmt.free();
    }
  }

  get(...args) {
    return this.#run(args, (stmt) => (stmt.step() ? stmt.getAsObject() : undefined));
  }

  all(...args) {
    return this.#run(args, (stmt) => {
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    });
  }

  run(...args) {
    this.#run(args, (stmt) => { stmt.step(); return null; });
    const [row] = this.db.raw.exec('SELECT last_insert_rowid() AS id');
    return {
      changes: this.db.raw.getRowsModified(),
      lastInsertRowid: row?.values?.[0]?.[0] ?? 0,
    };
  }
}

class DemoDatabase {
  constructor(raw) {
    this.raw = raw;
    this.depth = 0;
  }

  prepare(sql) { return new Statement(this, sql); }

  exec(sql) { this.raw.exec(sql); return this; }

  pragma() { /* journal mode and foreign keys are fixed in the demo image */ }

  /**
   * better-sqlite3 returns a callable; savepoints are unnecessary here because
   * the server never nests transactions, but the depth guard keeps it honest.
   */
  transaction(fn) {
    return (...args) => {
      const outermost = this.depth === 0;
      if (outermost) this.raw.exec('BEGIN');
      this.depth += 1;
      try {
        const result = fn(...args);
        this.depth -= 1;
        if (outermost) this.raw.exec('COMMIT');
        return result;
      } catch (err) {
        this.depth -= 1;
        if (outermost) this.raw.exec('ROLLBACK');
        throw err;
      }
    };
  }

  close() { this.raw.close(); }
}

let sqlPromise = null;

/** Loads the wasm runtime and the seeded demo database image. */
export async function openDemoDatabase(databaseUrl) {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => wasmUrl });
  const SQL = await sqlPromise;

  const response = await fetch(databaseUrl);
  if (!response.ok) throw new Error(`Could not load the demo dataset (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());

  const raw = new SQL.Database(bytes);
  raw.exec('PRAGMA foreign_keys = ON');
  return new DemoDatabase(raw);
}
