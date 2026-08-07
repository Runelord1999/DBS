#!/usr/bin/env node
/**
 * Snapshots the seeded database into the demo build's public folder.
 *
 * VACUUM INTO produces a single compact file with the write-ahead log already
 * folded in — copying workbench.db on its own would silently omit anything
 * still sitting in the WAL.
 *
 * Refuses to run against a database that is not the fabricated demo seed, so a
 * live portfolio can never be packaged into a publicly served page.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = process.env.GFM_DB_PATH || path.resolve(here, '../data/workbench.db');
// Lives in src/ rather than public/ so the bundler can inline it: the published
// page is a single self-contained .html file, matching the sibling dashboards.
const destination = path.resolve(here, '../web/src/demo/demo-portfolio.db');

if (!fs.existsSync(source)) {
  console.error(`No database at ${source}. Run \`npm run seed\` first.`);
  process.exit(1);
}

const db = new Database(source, { readonly: true });

// Guard: the seed marks itself by using @gfm.example addresses throughout.
// Anything else is assumed to be real data and is refused.
const people = db.prepare('SELECT COUNT(*) AS n FROM person').get().n;
const fabricated = db.prepare(
  "SELECT COUNT(*) AS n FROM person WHERE email LIKE '%@gfm.example'"
).get().n;

if (people === 0 || fabricated !== people) {
  console.error(
    'Refusing to export: this database does not look like the fabricated demo seed\n' +
    `(${fabricated} of ${people} people carry demo addresses).\n` +
    'The published demo must never be built from real portfolio data.'
  );
  db.close();
  process.exit(1);
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.rmSync(destination, { force: true });
db.exec(`VACUUM INTO '${destination.replace(/'/g, "''")}'`);
db.close();

const kb = Math.round(fs.statSync(destination).size / 1024);
console.log(`Exported fabricated demo dataset → ${destination} (${kb} KB)`);
