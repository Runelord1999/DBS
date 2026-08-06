import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installReferenceData } from './reference.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(here, 'schema.sql');

/** Default location of the live database — gitignored (Section 10). */
export function defaultDbPath() {
  if (process.env.GFM_DB_PATH) return process.env.GFM_DB_PATH;
  return path.resolve(here, '../../../data/workbench.db');
}

let singleton = null;

export function openDb(dbPath = defaultDbPath()) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
  installReferenceData(db);
  return db;
}

export function getDb() {
  if (!singleton) singleton = openDb();
  return singleton;
}

export function closeDb() {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}
