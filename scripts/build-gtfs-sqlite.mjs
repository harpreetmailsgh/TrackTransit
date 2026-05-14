import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import Papa from 'papaparse';
import Database from 'better-sqlite3';

const GTFS_ZIP_URL =
  process.env.GTFS_ZIP_URL ||
  'https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip';

const OUTPUT_DIR = path.resolve(process.cwd(), 'dist', 'gtfs');
const DB_FILE_NAME = process.env.GTFS_DB_FILENAME || 'go-gtfs-v1.sqlite';
const DB_FILE_PATH = path.join(OUTPUT_DIR, DB_FILE_NAME);
const MANIFEST_FILE_PATH = path.join(OUTPUT_DIR, 'manifest.json');
const VERSION = process.env.GTFS_VERSION || new Date().toISOString().replace(/[.:]/g, '-');
const DB_URL = process.env.GTFS_DB_URL || '';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function fetchArrayBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download GTFS zip (${res.status})`);
  }
  return res.arrayBuffer();
}

function parseCsv(text) {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });
  return Array.isArray(parsed.data) ? parsed.data : [];
}

async function readZipText(zip, fileName) {
  const lower = fileName.toLowerCase();
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const match = names.find((name) => {
    const n = name.toLowerCase();
    return n === lower || n.endsWith(`/${lower}`);
  });
  if (!match) return null;
  const entry = zip.file(match);
  if (!entry) return null;
  return entry.async('string');
}

function toStr(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    DROP TABLE IF EXISTS stops;
    DROP TABLE IF EXISTS routes;
    DROP TABLE IF EXISTS trips;
    DROP TABLE IF EXISTS stop_times;
    DROP TABLE IF EXISTS pathways;
    DROP TABLE IF EXISTS calendar;
    DROP TABLE IF EXISTS calendar_dates;
    DROP TABLE IF EXISTS app_meta;

    CREATE TABLE stops (
      stop_id TEXT PRIMARY KEY,
      stop_name TEXT,
      stop_lat TEXT,
      stop_lon TEXT,
      platform_code TEXT,
      parent_station TEXT,
      location_type TEXT
    );

    CREATE TABLE routes (
      route_id TEXT PRIMARY KEY,
      route_short_name TEXT,
      route_long_name TEXT,
      route_type TEXT
    );

    CREATE TABLE trips (
      trip_id TEXT PRIMARY KEY,
      route_id TEXT,
      trip_headsign TEXT,
      direction_id TEXT,
      shape_id TEXT,
      service_id TEXT
    );

    CREATE TABLE stop_times (
      trip_id TEXT,
      arrival_time TEXT,
      departure_time TEXT,
      stop_id TEXT,
      stop_sequence INTEGER,
      stop_headsign TEXT,
      pickup_type TEXT,
      drop_off_type TEXT
    );

    CREATE TABLE pathways (
      pathway_id TEXT,
      from_stop_id TEXT,
      to_stop_id TEXT,
      pathway_mode TEXT
    );

    CREATE TABLE calendar (
      service_id TEXT,
      monday TEXT,
      tuesday TEXT,
      wednesday TEXT,
      thursday TEXT,
      friday TEXT,
      saturday TEXT,
      sunday TEXT,
      start_date TEXT,
      end_date TEXT
    );

    CREATE TABLE calendar_dates (
      service_id TEXT,
      date TEXT,
      exception_type TEXT
    );

    CREATE TABLE app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX idx_stop_times_stop_id ON stop_times(stop_id);
    CREATE INDEX idx_stop_times_trip_id ON stop_times(trip_id);
    CREATE INDEX idx_stop_times_stop_seq ON stop_times(trip_id, stop_sequence);
    CREATE INDEX idx_trips_service_id ON trips(service_id);
  `);
}

function insertRows(db, name, rows) {
  if (!rows.length) return;

  if (name === 'stops') {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO stops (stop_id, stop_name, stop_lat, stop_lon, platform_code, parent_station, location_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction((items) => {
      for (const row of items) {
        stmt.run(
          toStr(row.stop_id),
          toStr(row.stop_name),
          toStr(row.stop_lat),
          toStr(row.stop_lon),
          toStr(row.platform_code),
          toStr(row.parent_station),
          toStr(row.location_type),
        );
      }
    });
    tx(rows);
    return;
  }

  if (name === 'routes') {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO routes (route_id, route_short_name, route_long_name, route_type)
      VALUES (?, ?, ?, ?)
    `);
    const tx = db.transaction((items) => {
      for (const row of items) {
        stmt.run(
          toStr(row.route_id),
          toStr(row.route_short_name),
          toStr(row.route_long_name),
          toStr(row.route_type),
        );
      }
    });
    tx(rows);
    return;
  }

  if (name === 'trips') {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO trips (trip_id, route_id, trip_headsign, direction_id, shape_id, service_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction((items) => {
      for (const row of items) {
        stmt.run(
          toStr(row.trip_id),
          toStr(row.route_id),
          toStr(row.trip_headsign),
          toStr(row.direction_id),
          toStr(row.shape_id),
          toStr(row.service_id),
        );
      }
    });
    tx(rows);
    return;
  }

  if (name === 'stop_times') {
    const stmt = db.prepare(`
      INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence, stop_headsign, pickup_type, drop_off_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction((items) => {
      for (const row of items) {
        stmt.run(
          toStr(row.trip_id),
          toStr(row.arrival_time),
          toStr(row.departure_time),
          toStr(row.stop_id),
          Number(row.stop_sequence || 0),
          toStr(row.stop_headsign),
          toStr(row.pickup_type),
          toStr(row.drop_off_type),
        );
      }
    });
    tx(rows);
    return;
  }

  if (name === 'pathways') {
    const stmt = db.prepare(`
      INSERT INTO pathways (pathway_id, from_stop_id, to_stop_id, pathway_mode)
      VALUES (?, ?, ?, ?)
    `);
    const tx = db.transaction((items) => {
      for (const row of items) {
        stmt.run(
          toStr(row.pathway_id),
          toStr(row.from_stop_id),
          toStr(row.to_stop_id),
          toStr(row.pathway_mode),
        );
      }
    });
    tx(rows);
    return;
  }

  if (name === 'calendar') {
    const stmt = db.prepare(`
      INSERT INTO calendar (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction((items) => {
      for (const row of items) {
        stmt.run(
          toStr(row.service_id),
          toStr(row.monday),
          toStr(row.tuesday),
          toStr(row.wednesday),
          toStr(row.thursday),
          toStr(row.friday),
          toStr(row.saturday),
          toStr(row.sunday),
          toStr(row.start_date),
          toStr(row.end_date),
        );
      }
    });
    tx(rows);
    return;
  }

  if (name === 'calendar_dates') {
    const stmt = db.prepare(`
      INSERT INTO calendar_dates (service_id, date, exception_type)
      VALUES (?, ?, ?)
    `);
    const tx = db.transaction((items) => {
      for (const row of items) {
        stmt.run(
          toStr(row.service_id),
          toStr(row.date),
          toStr(row.exception_type),
        );
      }
    });
    tx(rows);
  }
}

function writeMeta(db, stats) {
  const insert = db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)');
  const tx = db.transaction(() => {
    insert.run('version', VERSION);
    insert.run('generatedAt', new Date().toISOString());
    insert.run('sourceUrl', GTFS_ZIP_URL);
    insert.run('stopsCount', String(stats.stops));
    insert.run('routesCount', String(stats.routes));
    insert.run('tripsCount', String(stats.trips));
    insert.run('stopTimesCount', String(stats.stopTimes));
  });
  tx();
}

function sha256ForFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function main() {
  ensureDir(OUTPUT_DIR);
  if (fs.existsSync(DB_FILE_PATH)) {
    fs.rmSync(DB_FILE_PATH);
  }

  console.log(`[gtfs] Downloading zip: ${GTFS_ZIP_URL}`);
  const arr = await fetchArrayBuffer(GTFS_ZIP_URL);
  const zip = await JSZip.loadAsync(arr);

  const [stopsTxt, routesTxt, tripsTxt, stopTimesTxt, pathwaysTxt, calendarTxt, calendarDatesTxt] = await Promise.all([
    readZipText(zip, 'stops.txt'),
    readZipText(zip, 'routes.txt'),
    readZipText(zip, 'trips.txt'),
    readZipText(zip, 'stop_times.txt'),
    readZipText(zip, 'pathways.txt'),
    readZipText(zip, 'calendar.txt'),
    readZipText(zip, 'calendar_dates.txt'),
  ]);

  if (!stopsTxt || !routesTxt || !tripsTxt || !stopTimesTxt) {
    throw new Error('GTFS zip missing required files: stops/routes/trips/stop_times');
  }

  console.log('[gtfs] Parsing CSV files');
  const stops = parseCsv(stopsTxt);
  const routes = parseCsv(routesTxt);
  const trips = parseCsv(tripsTxt);
  const stopTimes = parseCsv(stopTimesTxt);
  const pathways = pathwaysTxt ? parseCsv(pathwaysTxt) : [];
  const calendar = calendarTxt ? parseCsv(calendarTxt) : [];
  const calendarDates = calendarDatesTxt ? parseCsv(calendarDatesTxt) : [];

  console.log('[gtfs] Writing SQLite database');
  const db = new Database(DB_FILE_PATH);
  try {
    createSchema(db);
    insertRows(db, 'stops', stops);
    insertRows(db, 'routes', routes);
    insertRows(db, 'trips', trips);
    insertRows(db, 'stop_times', stopTimes);
    insertRows(db, 'pathways', pathways);
    insertRows(db, 'calendar', calendar);
    insertRows(db, 'calendar_dates', calendarDates);
    writeMeta(db, {
      stops: stops.length,
      routes: routes.length,
      trips: trips.length,
      stopTimes: stopTimes.length,
    });
    db.exec('VACUUM;');
  } finally {
    db.close();
  }

  const stat = fs.statSync(DB_FILE_PATH);
  const sha = sha256ForFile(DB_FILE_PATH);

  const manifest = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    dbFileName: DB_FILE_NAME,
    dbUrl: DB_URL || DB_FILE_NAME,
    sizeBytes: stat.size,
    checksumSha256: sha,
  };

  fs.writeFileSync(MANIFEST_FILE_PATH, JSON.stringify(manifest, null, 2));

  console.log(`[gtfs] Done`);
  console.log(`[gtfs] DB: ${DB_FILE_PATH}`);
  console.log(`[gtfs] Manifest: ${MANIFEST_FILE_PATH}`);
}

main().catch((err) => {
  console.error('[gtfs] Build failed:', err);
  process.exitCode = 1;
});
