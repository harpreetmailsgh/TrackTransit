import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const files = [
  'dist/gtfs/go-gtfs-core.sqlite',
  'dist/gtfs/go-gtfs-month.sqlite',
  'dist/gtfs/go-gtfs-week-20260624.sqlite',
];

for (const file of files) {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) {
    console.log(file, 'MISSING');
    continue;
  }
  const db = new Database(full, { readonly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  console.log(file, 'tables=', tables.join(', '));
  if (file.includes('core')) {
    const counts = {};
    for (const t of ['stops', 'routes', 'pathways', 'calendar', 'calendar_dates']) {
      const row = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get();
      counts[t] = row ? row.c : '(missing)';
    }
    console.log(' core counts=', counts);
  }
  if (file.includes('month') || file.includes('week')) {
    const counts = {};
    for (const t of ['routes', 'trips', 'stop_times']) {
      const row = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get();
      counts[t] = row ? row.c : '(missing)';
    }
    console.log(' schedule counts=', counts);
  }
  db.close();
}
