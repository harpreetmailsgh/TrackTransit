import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

const DEFAULT_TIMEOUT_MS = 30000;
const SQLITE_DB_NAME = 'go-gtfs-v1.sqlite';
const SQLITE_DB_FILE = `${SQLite.defaultDatabaseDirectory}${SQLITE_DB_NAME}`;
const SQLITE_META_FILE = `${FileSystem.documentDirectory}go-gtfs-v1-meta.json`;
const SQLITE_UPDATE_FILE = `${FileSystem.documentDirectory}go-gtfs-v1-update.json`;

const DEFAULT_MANIFEST_URL =
  'https://github.com/harpreetmailsgh/TrackTransit/releases/download/gtfs-data/manifest.json';
const DEFAULT_DB_URL =
  'https://github.com/harpreetmailsgh/TrackTransit/releases/download/gtfs-data/go-gtfs-v1.sqlite';

const MANIFEST_URL = (process.env.EXPO_PUBLIC_GTFS_SQLITE_MANIFEST_URL || DEFAULT_MANIFEST_URL).trim();
const FALLBACK_DB_URL = (process.env.EXPO_PUBLIC_GTFS_SQLITE_DB_URL || DEFAULT_DB_URL).trim();

function hasAnyUrl() {
  return Boolean(MANIFEST_URL || FALLBACK_DB_URL);
}

async function fetchWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readJson(path) {
  try {
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJson(path, value) {
  await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
}

function normalizeManifest(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const dbUrl = String(payload.dbUrl || payload.db_url || FALLBACK_DB_URL || '').trim();
  if (!dbUrl) return null;
  return {
    version: String(payload.version || payload.generatedAt || payload.updatedAt || Date.now()),
    dbUrl,
    sizeBytes: Number(payload.sizeBytes || payload.size || 0) || 0,
    checksumSha256: String(payload.checksumSha256 || payload.sha256 || '').trim() || null,
    generatedAt: String(payload.generatedAt || '').trim() || null,
  };
}

async function fetchRemoteManifest() {
  if (MANIFEST_URL) {
    const res = await fetchWithTimeout(MANIFEST_URL, DEFAULT_TIMEOUT_MS);
    if (!res.ok) {
      throw new Error(`GTFS manifest fetch failed (${res.status})`);
    }
    const payload = await res.json();
    const manifest = normalizeManifest(payload);
    if (!manifest) {
      throw new Error('GTFS manifest is invalid or missing dbUrl.');
    }
    return manifest;
  }

  if (FALLBACK_DB_URL) {
    return {
      version: 'fallback-db-url',
      dbUrl: FALLBACK_DB_URL,
      sizeBytes: 0,
      checksumSha256: null,
      generatedAt: null,
    };
  }

  return null;
}

async function downloadDbFile(dbUrl, onProgress) {
  const tempPath = `${SQLITE_DB_FILE}.download`;
  await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
  await FileSystem.makeDirectoryAsync(SQLite.defaultDatabaseDirectory, { intermediates: true }).catch(() => {});

  let lastBucket = -1;
  const download = FileSystem.createDownloadResumable(
    dbUrl,
    tempPath,
    {},
    (event) => {
      if (!onProgress) return;
      const written = Number(event?.totalBytesWritten || 0);
      const expected = Number(event?.totalBytesExpectedToWrite || 0);
      if (expected <= 0) return;
      const pct = Math.max(0, Math.min(1, written / expected));
      const bucket = Math.floor(pct * 100);
      if (bucket === lastBucket) return;
      lastBucket = bucket;
      onProgress({ message: `Downloading schedules database... ${bucket}%`, percent: 0.05 + pct * 0.55 });
    },
  );

  const result = await download.downloadAsync();
  if (!result?.uri) {
    throw new Error('Failed to download schedules database.');
  }

  await FileSystem.moveAsync({ from: result.uri, to: SQLITE_DB_FILE });
  return SQLITE_DB_FILE;
}

async function getDbInfo() {
  try {
    const info = await FileSystem.getInfoAsync(SQLITE_DB_FILE);
    return info;
  } catch {
    return { exists: false };
  }
}

export function isHostedSqliteConfigured() {
  return hasAnyUrl();
}

export async function getHostedSqlitePath() {
  const info = await getDbInfo();
  return info?.exists ? SQLITE_DB_FILE : null;
}

export async function ensureHostedSqlite(options = {}) {
  const { force = false, onProgress } = options;
  if (!hasAnyUrl()) {
    return { ok: false, reason: 'not-configured' };
  }

  onProgress?.({ message: 'Checking schedules database version...', percent: 0.02 });
  const manifest = await fetchRemoteManifest();
  if (!manifest) {
    return { ok: false, reason: 'manifest-unavailable' };
  }

  const localMeta = await readJson(SQLITE_META_FILE);
  const localInfo = await getDbInfo();
  const localVersion = String(localMeta?.version || '');
  const hasLocalDb = !!localInfo?.exists;

  const needsDownload =
    force ||
    !hasLocalDb ||
    !localVersion ||
    localVersion !== manifest.version;

  if (needsDownload) {
    onProgress?.({ message: 'Downloading schedules database...', percent: 0.05 });
    await downloadDbFile(manifest.dbUrl, onProgress);
    await writeJson(SQLITE_META_FILE, {
      version: manifest.version,
      dbUrl: manifest.dbUrl,
      generatedAt: manifest.generatedAt,
      installedAt: Date.now(),
      sizeBytes: manifest.sizeBytes,
      checksumSha256: manifest.checksumSha256,
      checkedAt: Date.now(),
    });
  } else {
    await writeJson(SQLITE_META_FILE, {
      ...(localMeta || {}),
      checkedAt: Date.now(),
      version: localMeta?.version || manifest.version,
      dbUrl: localMeta?.dbUrl || manifest.dbUrl,
    });
  }

  return {
    ok: true,
    changed: needsDownload,
    manifest,
    dbPath: SQLITE_DB_FILE,
  };
}

export async function checkHostedSqliteUpdate() {
  if (!hasAnyUrl()) {
    return { status: 'not-configured', update: null };
  }

  const manifest = await fetchRemoteManifest();
  const localMeta = await readJson(SQLITE_META_FILE);
  const localVersion = String(localMeta?.version || '');

  if (!localVersion) {
    return { status: 'baseline-missing', update: null };
  }

  if (localVersion === manifest.version) {
    await FileSystem.deleteAsync(SQLITE_UPDATE_FILE, { idempotent: true }).catch(() => {});
    return { status: 'up-to-date', update: null };
  }

  const pending = {
    status: 'available',
    detectedAt: Date.now(),
    version: manifest.version,
    dbUrl: manifest.dbUrl,
    remoteFingerprint: {
      contentLength: manifest.sizeBytes || null,
      etag: manifest.version,
      lastModified: manifest.generatedAt,
    },
    estimatedDurationSec: null,
    snoozeUntil: null,
    lastPromptedAt: null,
  };

  await writeJson(SQLITE_UPDATE_FILE, pending);
  return { status: 'update-available', update: pending };
}

export async function getPendingHostedSqliteUpdate() {
  return readJson(SQLITE_UPDATE_FILE);
}

export async function setPendingHostedSqliteUpdate(value) {
  await writeJson(SQLITE_UPDATE_FILE, value);
  return value;
}

export async function clearPendingHostedSqliteUpdate() {
  await FileSystem.deleteAsync(SQLITE_UPDATE_FILE, { idempotent: true }).catch(() => {});
}

export async function applyPendingHostedSqliteUpdate(options = {}) {
  const { onProgress } = options;
  const result = await ensureHostedSqlite({ force: true, onProgress });
  return { ok: !!result?.ok, changed: !!result?.changed };
}

export async function loadHostedGtfsRows(onProgress) {
  const dbInfo = await getDbInfo();
  if (!dbInfo?.exists) {
    throw new Error('Schedules database was not found on this device.');
  }

  onProgress?.({ message: 'Opening schedules database...', percent: 0.62 });
  const db = await SQLite.openDatabaseAsync(SQLITE_DB_NAME, {
    useNewConnection: true,
  });

  try {
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA temp_store = MEMORY;');

    onProgress?.({ message: 'Reading stops and routes...', percent: 0.68 });
    const stops = await db.getAllAsync(
      'SELECT stop_id, stop_name, stop_lat, stop_lon, platform_code, parent_station, location_type FROM stops',
    );
    const routes = await db.getAllAsync(
      'SELECT route_id, route_short_name, route_long_name, route_type FROM routes',
    );
    const trips = await db.getAllAsync(
      'SELECT route_id, trip_id, trip_headsign, direction_id, shape_id, service_id FROM trips',
    );

    onProgress?.({ message: 'Reading schedules...', percent: 0.8 });
    const stopTimes = await db.getAllAsync(
      'SELECT trip_id, arrival_time, departure_time, stop_id, stop_sequence, stop_headsign, pickup_type, drop_off_type FROM stop_times',
    );

    onProgress?.({ message: 'Reading service calendar...', percent: 0.9 });
    const pathways = await db.getAllAsync(
      'SELECT pathway_id, from_stop_id, to_stop_id, pathway_mode FROM pathways',
    ).catch(() => []);
    const calendar = await db.getAllAsync(
      'SELECT service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date FROM calendar',
    ).catch(() => []);
    const calendarDates = await db.getAllAsync(
      'SELECT service_id, date, exception_type FROM calendar_dates',
    ).catch(() => []);

    return {
      stops,
      routes,
      trips,
      stopTimes,
      pathways,
      calendar,
      calendarDates,
    };
  } finally {
    await db.closeAsync().catch(() => {});
  }
}
