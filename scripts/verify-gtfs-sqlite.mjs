import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';

const args = process.argv.slice(2);
let artifactType = 'full';
const positional = [];

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--type' && args[i + 1]) {
    artifactType = String(args[i + 1]).toLowerCase();
    i += 1;
    continue;
  }
  positional.push(args[i]);
}

const TABLE_RULES = {
  core: {
    required: ['stops', 'routes', 'calendar_dates'],
    optional: ['pathways', 'calendar'],
    counts: ['stops', 'routes'],
  },
  month: {
    required: ['trips', 'stop_times'],
    optional: ['routes'],
    counts: ['trips', 'stop_times'],
  },
  week: {
    required: ['trips', 'stop_times'],
    optional: ['routes'],
    counts: ['trips', 'stop_times'],
  },
  full: {
    required: ['stops', 'routes', 'trips', 'stop_times'],
    optional: ['pathways', 'calendar', 'calendar_dates'],
    counts: ['stops', 'routes', 'trips', 'stop_times'],
  },
};

function fail(message) {
  console.error(`[verify] ${message}`);
  process.exitCode = 1;
}

function verifyOneFile(dbPath, type) {
  const rules = TABLE_RULES[type] || TABLE_RULES.full;
  if (!fs.existsSync(dbPath)) {
    fail(`File not found: ${dbPath}`);
    return false;
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check;').get();
    if (!integrity || String(integrity.integrity_check || '').toLowerCase() !== 'ok') {
      fail(`SQLite integrity_check failed for ${dbPath}`);
      return false;
    }

    const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = new Set(tableRows.map((row) => String(row.name || '')));
    const missing = rules.required.filter((name) => !tableNames.has(name));
    if (missing.length) {
      fail(`Missing required tables in ${dbPath}: ${missing.join(', ')}`);
      return false;
    }

    const counts = {};
    for (const table of rules.counts) {
      if (!tableNames.has(table)) continue;
      counts[table] = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count || 0);
      if (!Number.isFinite(counts[table]) || counts[table] <= 0) {
        fail(`Table ${table} has invalid row count (${counts[table]}) in ${dbPath}`);
        return false;
      }
    }

    const journalMode = db.prepare('PRAGMA journal_mode;').get();
    console.log(`[verify] type=${type} file=${path.basename(dbPath)} journal_mode=${journalMode?.journal_mode || 'unknown'}`);
    console.log(`[verify] counts ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    return true;
  } finally {
    db.close();
  }
}

try {
  const distDir = path.resolve(process.cwd(), 'dist', 'gtfs');

  if (positional.length === 0) {
    const targets = [
      { path: path.join(distDir, 'go-gtfs-core.sqlite'), type: 'core' },
      { path: path.join(distDir, 'go-gtfs-month.sqlite'), type: 'month' },
    ];
    const weekFiles = fs.existsSync(distDir)
      ? fs.readdirSync(distDir).filter((name) => /^go-gtfs-week-\d{8}\.sqlite$/i.test(name))
      : [];
    for (const name of weekFiles) {
      targets.push({ path: path.join(distDir, name), type: 'week' });
    }

    if (!targets.some((t) => fs.existsSync(t.path))) {
      targets.push({ path: path.join(distDir, 'go-gtfs-v1.sqlite'), type: 'full' });
    }

    let ok = true;
    for (const target of targets) {
      if (!fs.existsSync(target.path)) continue;
      ok = verifyOneFile(target.path, target.type) && ok;
    }
    if (!ok) process.exit();
    console.log('[verify] All present SQLite artifacts validated.');
    process.exit();
  }

  const dbPath = path.resolve(process.cwd(), positional[0]);
  if (!verifyOneFile(dbPath, artifactType)) {
    process.exit();
  }
  console.log('[verify] SQLite artifact validation passed.');
} catch (error) {
  fail(error?.message || String(error));
}
