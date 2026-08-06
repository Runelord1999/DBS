import { createApp } from './app.js';
import { defaultDbPath, getDb } from './db/index.js';

const port = Number(process.env.PORT) || 4000;
const db = getDb();
const app = createApp(db);

app.listen(port, () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM project').get().n;
  console.log(`GFM Delivery Workbench API listening on http://localhost:${port}`);
  console.log(`  database : ${defaultDbPath()}`);
  console.log(`  projects : ${count}`);
  if (count === 0) {
    console.log('  (empty — run `npm run seed` from gfm-workbench/ to load demo data)');
  }
});
