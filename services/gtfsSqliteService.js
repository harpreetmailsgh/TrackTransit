import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { DateTime } from 'luxon';

const DEFAULT_TIMEOUT_MS = 30000;
const CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const TORONTO = 'America/Toronto';

const CORE_DB_NAME = 'go-gtfs-core.sqlite';
const MONTH_DB_NAME = 'go-gtfs-month.sqlite';
const LEGACY_DB_NAME = 'go-gtfs-v1.sqlite';

const DB_DIR = SQLite.defaultDatabaseDirectory;
const CORE_DB_FILE = `${DB_DIR}${CORE_DB_NAME}`;
const MONTH_DB_FILE = `${DB_DIR}${MONTH_DB_NAME}`;
const LEGACY_DB_FILE = `${DB_DIR}${LEGACY_DB_NAME}`;

const BUNDLE_META_FILE = `${FileSystem.documentDirectory}go-gtfs-bundle-meta.json`;
const LEGACY_META_FILE = `${FileSystem.documentDirectory}go-gtfs-v1-meta.json`;
const SQLITE_UPDATE_FILE = `${FileSystem.documentDirectory}go-gtfs-v1-update.json`;

const DEFAULT_MANIFEST_URL =
  'https://github.com/harpreetmailsgh/TrackTransit/releases/download/gtfs-data/manifest.json';
const DEFAULT_DB_URL =
  'https://github.com/harpreetmailsgh/TrackTransit/releases/download/gtfs-data/go-gtfs-v1.sqlite';

const MANIFEST_URL = (process.env.EXPO_PUBLIC_GTFS_SQLITE_MANIFEST_URL || DEFAULT_MANIFEST_URL).trim();
const FALLBACK_DB_URL = (process.env.EXPO_PUBLIC_GTFS_SQLITE_DB_URL || DEFAULT_DB_URL).trim();

const TRIP_BATCH_SIZE = 400;
const STOP_TIME_BATCH_SIZE = 500;

function hasAnyUrl() {
  return Boolean(MANIFEST_URL || FALLBACK_DB_URL);
}

function torontoTodayYmd() {
  return DateTime.now().setZone(TORONTO).toFormat('yyyyMMdd');
}

function addDaysYmd(ymd, days) {
  return DateTime.fromFormat(ymd, 'yyyyMMdd', { zone: TORONTO }).plus({ days }).toFormat('yyyyMMdd');
}

function resolveAssetUrl(url, baseUrl = MANIFEST_URL) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!baseUrl) return raw;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
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

async function getFileInfo(filePath) {
  try {
    return await FileSystem.getInfoAsync(filePath);
  } catch {
    return { exists: false };
  }
}

function normalizeAsset(asset, baseUrl) {
  if (!asset || typeof asset !== 'object') return null;
  const fileName = String(asset.fileName || '').trim();
  const url = resolveAssetUrl(asset.url || fileName, baseUrl);
  if (!url) return null;
  return {
    fileName: fileName || url.split('/').pop(),
    url,
    sizeBytes: Number(asset.sizeBytes || asset.size || 0) || 0,
    checksumSha256: String(asset.checksumSha256 || asset.sha256 || '').trim() || null,
    startDate: String(asset.startDate || '').trim() || null,
    endDate: String(asset.endDate || '').trim() || null,
    id: String(asset.id || asset.startDate || '').trim() || null,
  };
}

function normalizeManifest(payload) {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.core && payload.month) {
    const core = normalizeAsset(payload.core);
    const month = normalizeAsset(payload.month);
    if (!core?.url || !month?.url) return null;
    const weeks = Array.isArray(payload.weeks)
      ? payload.weeks.map((w) => normalizeAsset(w)).filter(Boolean)
      : [];
    return {
      format: 'v2',
      version: String(payload.version || payload.generatedAt || Date.now()),
      generatedAt: String(payload.generatedAt || '').trim() || null,
      buildDate: String(payload.buildDate || month.startDate || '').trim() || null,
      core,
      month,
      weeks,
    };
  }

  let dbUrl = String(payload.dbUrl || payload.db_url || FALLBACK_DB_URL || '').trim();
  dbUrl = resolveAssetUrl(dbUrl);
  if (!dbUrl) return null;
  return {
    format: 'v1',
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
      throw new Error('GTFS manifest is invalid.');
    }
    return manifest;
  }

  if (FALLBACK_DB_URL) {
    return normalizeManifest({
      dbUrl: FALLBACK_DB_URL,
      version: 'fallback-db-url',
    });
  }

  return null;
}

async function ensureDbDirectory() {
  await FileSystem.makeDirectoryAsync(DB_DIR, { intermediates: true }).catch(() => {});
}

async function downloadFile(dbUrl, destPath, onProgress, label = 'schedules') {
  const tempPath = `${destPath}.download`;
  await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
  await ensureDbDirectory();

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
      onProgress({ message: `Downloading ${label}... ${bucket}%`, percent: 0.05 + pct * 0.5 });
    },
  );

  const result = await download.downloadAsync();
  if (!result?.uri) {
    throw new Error(`Failed to download ${label}.`);
  }

  await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
  await FileSystem.moveAsync({ from: result.uri, to: destPath });
  return destPath;
}

async function validateDbTables(dbName, requiredTables, stopsRequired = false) {
  const db = await SQLite.openDatabaseAsync(dbName, { useNewConnection: true });
  try {
    const rows = await db.getAllAsync("SELECT name FROM sqlite_master WHERE type = 'table'");
    const tableNames = new Set((rows || []).map((row) => String(row?.name || '')));
    const missing = requiredTables.filter((table) => !tableNames.has(table));
    if (missing.length) {
      return { ok: false, reason: `Missing tables: ${missing.join(', ')}` };
    }
    if (stopsRequired) {
      const stopCountRow = await db.getFirstAsync('SELECT COUNT(*) AS count FROM stops');
      const stopCount = Number(stopCountRow?.count || 0);
      if (!Number.isFinite(stopCount) || stopCount <= 0) {
        return { ok: false, reason: 'Stops table is empty.' };
      }
    }
    return { ok: true };
  } finally {
    await db.closeAsync().catch(() => {});
  }
}

function weekDbName(startDate) {
  return `go-gtfs-week-${startDate}.sqlite`;
}

function weekDbFile(startDate) {
  return `${DB_DIR}${weekDbName(startDate)}`;
}

function computeEffectiveCoverageEnd(meta) {
  const monthEnd = String(meta?.month?.endDate || '');
  let maxEnd = monthEnd;
  for (const week of meta?.installedWeeks || []) {
    const end = String(week?.endDate || '');
    if (end && (!maxEnd || end > maxEnd)) {
      maxEnd = end;
    }
  }
  return maxEnd || monthEnd || null;
}

function isCheckDue(meta) {
  const last = Number(meta?.lastCheckAt || meta?.checkedAt || 0);
  if (!last) return true;
  return Date.now() - last >= CHECK_INTERVAL_MS;
}

function dateInSpan(ymd, startDate, endDate) {
  if (!startDate || !endDate) return false;
  return ymd >= startDate && ymd <= endDate;
}

function resolveScheduleDbForDate(ymd, meta) {
  if (dateInSpan(ymd, meta?.month?.startDate, meta?.month?.endDate)) {
    return { dbName: MONTH_DB_NAME, dbFile: MONTH_DB_FILE };
  }
  for (const week of meta?.installedWeeks || []) {
    if (dateInSpan(ymd, week.startDate, week.endDate)) {
      const name = weekDbName(week.startDate);
      return { dbName: name, dbFile: weekDbFile(week.startDate) };
    }
  }
  return null;
}

async function downloadLegacyDb(manifest, onProgress) {
  await downloadFile(manifest.dbUrl, LEGACY_DB_FILE, onProgress, 'schedules database');
  if (manifest.sizeBytes > 0 && !manifest.checksumSha256) {
    const info = await FileSystem.getInfoAsync(LEGACY_DB_FILE);
    const localSize = Number(info?.size || 0);
    const delta = Math.abs(localSize - manifest.sizeBytes);
    if (!info?.exists || delta > Math.max(4096, manifest.sizeBytes * 0.001)) {
      await FileSystem.deleteAsync(LEGACY_DB_FILE, { idempotent: true }).catch(() => {});
      throw new Error(
        `Downloaded schedules database size mismatch. expected=${manifest.sizeBytes} actual=${localSize}`,
      );
    }
  }
  const validation = await validateDbTables(
    LEGACY_DB_NAME,
    ['stops', 'routes', 'trips', 'stop_times'],
    true,
  ).catch((error) => ({ ok: false, reason: error?.message || 'Validation failed.' }));
  if (!validation.ok) {
    await FileSystem.deleteAsync(LEGACY_DB_FILE, { idempotent: true }).catch(() => {});
    throw new Error(`Downloaded schedules database is invalid. ${validation.reason}`);
  }
  await writeJson(LEGACY_META_FILE, {
    format: 'v1',
    version: manifest.version,
    dbUrl: manifest.dbUrl,
    generatedAt: manifest.generatedAt,
    installedAt: Date.now(),
    sizeBytes: manifest.sizeBytes,
    checksumSha256: manifest.checksumSha256,
    checkedAt: Date.now(),
    lastCheckAt: Date.now(),
  });
  return { ok: true, changed: true, format: 'v1' };
}

async function downloadBundleAsset(asset, destPath, onProgress, label) {
  await downloadFile(asset.url, destPath, onProgress, label);
  if (asset.sizeBytes > 0 && !asset.checksumSha256) {
    const info = await FileSystem.getInfoAsync(destPath);
    const localSize = Number(info?.size || 0);
    const delta = Math.abs(localSize - asset.sizeBytes);
    if (!info?.exists || delta > Math.max(4096, asset.sizeBytes * 0.001)) {
      await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
      throw new Error(`Downloaded ${label} size mismatch.`);
    }
  }
}

async function ensureHostedBundleV2(manifest, options = {}) {
  const { force = false, onProgress } = options;
  let meta = (await readJson(BUNDLE_META_FILE)) || {};
  const localVersion = String(meta?.version || '');
  const versionChanged = force || !localVersion || localVersion !== manifest.version;

  const coreInfo = await getFileInfo(CORE_DB_FILE);
  const monthInfo = await getFileInfo(MONTH_DB_FILE);
  const needsCore = versionChanged || !coreInfo?.exists;
  const needsMonth = versionChanged || !monthInfo?.exists;

  if (needsCore) {
    onProgress?.({ message: 'Downloading core schedules data...', percent: 0.06 });
    await downloadBundleAsset(manifest.core, CORE_DB_FILE, onProgress, 'core data');
    const coreValidation = await validateDbTables(
      CORE_DB_NAME,
      ['stops', 'routes', 'calendar_dates'],
      true,
    ).catch((error) => ({ ok: false, reason: error?.message }));
    if (!coreValidation.ok) {
      await FileSystem.deleteAsync(CORE_DB_FILE, { idempotent: true }).catch(() => {});
      throw new Error(`Core database invalid: ${coreValidation.reason}`);
    }
  }

  if (needsMonth) {
    onProgress?.({ message: 'Downloading monthly schedules...', percent: 0.35 });
    await downloadBundleAsset(manifest.month, MONTH_DB_FILE, onProgress, 'monthly schedules');
    const monthValidation = await validateDbTables(MONTH_DB_NAME, ['trips', 'stop_times']).catch((error) => ({
      ok: false,
      reason: error?.message,
    }));
    if (!monthValidation.ok) {
      await FileSystem.deleteAsync(MONTH_DB_FILE, { idempotent: true }).catch(() => {});
      throw new Error(`Month database invalid: ${monthValidation.reason}`);
    }
    meta.installedWeeks = [];
  }

  const installedWeekIds = new Set((meta.installedWeeks || []).map((w) => String(w.id || w.startDate)));
  const checkDue = force || isCheckDue(meta);
  let weeksChanged = false;

  if (checkDue && !versionChanged) {
    for (const week of manifest.weeks || []) {
      const weekId = String(week.id || week.startDate || '');
      if (!weekId || installedWeekIds.has(weekId)) continue;
      const dest = weekDbFile(week.startDate);
      onProgress?.({ message: `Downloading week ${week.startDate}...`, percent: 0.55 });
      await downloadBundleAsset(week, dest, onProgress, `week ${week.startDate}`);
      const weekValidation = await validateDbTables(weekDbName(week.startDate), ['trips', 'stop_times']).catch(
        (error) => ({ ok: false, reason: error?.message }),
      );
      if (!weekValidation.ok) {
        await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
        throw new Error(`Week database invalid: ${weekValidation.reason}`);
      }
      meta.installedWeeks = [
        ...(meta.installedWeeks || []),
        {
          id: weekId,
          startDate: week.startDate,
          endDate: week.endDate,
          fileName: week.fileName,
        },
      ];
      installedWeekIds.add(weekId);
      weeksChanged = true;
    }
  }

  meta = {
    ...meta,
    format: 'v2',
    version: manifest.version,
    generatedAt: manifest.generatedAt,
    buildDate: manifest.buildDate,
    core: {
      fileName: manifest.core.fileName,
      url: manifest.core.url,
      sizeBytes: manifest.core.sizeBytes,
    },
    month: {
      fileName: manifest.month.fileName,
      url: manifest.month.url,
      sizeBytes: manifest.month.sizeBytes,
      startDate: manifest.month.startDate,
      endDate: manifest.month.endDate,
    },
    installedAt: meta.installedAt || Date.now(),
    checkedAt: Date.now(),
    lastCheckAt: Date.now(),
  };
  meta.effectiveCoverageEnd = computeEffectiveCoverageEnd(meta);
  await writeJson(BUNDLE_META_FILE, meta);

  return {
    ok: true,
    changed: needsCore || needsMonth || weeksChanged,
    format: 'v2',
    manifest,
    meta,
  };
}

export function isHostedSqliteConfigured() {
  return hasAnyUrl();
}

export async function getHostedSqlitePath() {
  const bundleMeta = await readJson(BUNDLE_META_FILE);
  if (bundleMeta?.format === 'v2') {
    const core = await getFileInfo(CORE_DB_FILE);
    return core?.exists ? CORE_DB_FILE : null;
  }
  const legacy = await getFileInfo(LEGACY_DB_FILE);
  return legacy?.exists ? LEGACY_DB_FILE : null;
}

export async function getBundleMeta() {
  const bundle = await readJson(BUNDLE_META_FILE);
  if (bundle) return bundle;
  const legacy = await readJson(LEGACY_META_FILE);
  if (legacy) return { ...legacy, format: legacy.format || 'v1' };
  return null;
}

export function getEffectiveCoverageEnd(meta = null) {
  const m = meta || null;
  if (m?.effectiveCoverageEnd) return m.effectiveCoverageEnd;
  return computeEffectiveCoverageEnd(m);
}

export function getMonthDateSpan(meta = null) {
  const month = meta?.month;
  if (!month?.startDate || !month?.endDate) return null;
  return { startDate: month.startDate, endDate: month.endDate };
}

export async function ensureHostedSqlite(options = {}) {
  if (!hasAnyUrl()) {
    return { ok: false, reason: 'not-configured' };
  }

  const { force = false, onProgress } = options;
  onProgress?.({ message: 'Checking schedules database version...', percent: 0.02 });
  const manifest = await fetchRemoteManifest();
  if (!manifest) {
    return { ok: false, reason: 'manifest-unavailable' };
  }

  if (manifest.format === 'v2') {
    return ensureHostedBundleV2(manifest, { force, onProgress });
  }

  const localMeta = await readJson(LEGACY_META_FILE);
  const localInfo = await getFileInfo(LEGACY_DB_FILE);
  const localVersion = String(localMeta?.version || '');
  const hasLocalDb = !!localInfo?.exists;
  let needsDownload =
    force || !hasLocalDb || !localVersion || localVersion !== manifest.version;

  if (!needsDownload && hasLocalDb) {
    const validation = await validateDbTables(
      LEGACY_DB_NAME,
      ['stops', 'routes', 'trips', 'stop_times'],
      true,
    ).catch((error) => ({ ok: false, reason: error?.message }));
    if (!validation.ok) needsDownload = true;
  }

  if (needsDownload) {
    await downloadLegacyDb(manifest, onProgress);
    return { ok: true, changed: true, format: 'v1', manifest, dbPath: LEGACY_DB_FILE };
  }

  await writeJson(LEGACY_META_FILE, {
    ...(localMeta || {}),
    checkedAt: Date.now(),
    lastCheckAt: Date.now(),
    version: localMeta?.version || manifest.version,
  });

  return { ok: true, changed: false, format: 'v1', manifest, dbPath: LEGACY_DB_FILE };
}

export async function checkHostedSqliteUpdate() {
  if (!hasAnyUrl()) {
    return { status: 'not-configured', update: null };
  }

  const manifest = await fetchRemoteManifest();
  const bundleMeta = await readJson(BUNDLE_META_FILE);
  const legacyMeta = await readJson(LEGACY_META_FILE);
  const localMeta = bundleMeta || legacyMeta;
  const localVersion = String(localMeta?.version || '');

  if (!localVersion) {
    return { status: 'baseline-missing', update: null };
  }

  if (localVersion !== manifest.version) {
    const pending = {
      status: 'available',
      detectedAt: Date.now(),
      version: manifest.version,
      format: manifest.format,
      remoteFingerprint: {
        contentLength: manifest.month?.sizeBytes || manifest.sizeBytes || null,
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

  if (manifest.format === 'v2' && isCheckDue(localMeta)) {
    const installedWeekIds = new Set((localMeta.installedWeeks || []).map((w) => String(w.id || w.startDate)));
    const missingWeek = (manifest.weeks || []).find((w) => !installedWeekIds.has(String(w.id || w.startDate)));
    if (missingWeek) {
      const pending = {
        status: 'available',
        detectedAt: Date.now(),
        version: manifest.version,
        format: 'v2-week-extension',
        weekId: missingWeek.id || missingWeek.startDate,
        remoteFingerprint: {
          contentLength: missingWeek.sizeBytes || null,
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
  }

  await FileSystem.deleteAsync(SQLITE_UPDATE_FILE, { idempotent: true }).catch(() => {});
  return { status: 'up-to-date', update: null };
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
  const pending = await readJson(SQLITE_UPDATE_FILE);
  const meta = await readJson(BUNDLE_META_FILE);
  const forceFull =
    pending?.format !== 'v2-week-extension' && String(pending?.format || '') !== 'v2-week-extension';

  if (!forceFull && meta) {
    await writeJson(BUNDLE_META_FILE, { ...meta, lastCheckAt: 0 });
  }

  const result = await ensureHostedSqlite({
    force: forceFull,
    onProgress: options.onProgress,
  });
  return { ok: !!result?.ok, changed: !!result?.changed };
}

export async function loadHostedCoreTables(onProgress) {
  const meta = await getBundleMeta();
  if (meta?.format === 'v2') {
    const coreInfo = await getFileInfo(CORE_DB_FILE);
    if (!coreInfo?.exists) {
      throw new Error('Core schedules database was not found on this device.');
    }
    onProgress?.({ message: 'Reading stops and routes...', percent: 0.62 });
    const db = await SQLite.openDatabaseAsync(CORE_DB_NAME, { useNewConnection: true });
    try {
      await db.execAsync('PRAGMA journal_mode = WAL;');
      const stops = await db.getAllAsync(
        'SELECT stop_id, stop_name, stop_lat, stop_lon, platform_code, parent_station, location_type FROM stops',
      );
      const routes = await db.getAllAsync(
        'SELECT route_id, route_short_name, route_long_name, route_type FROM routes',
      );
      const pathways = await db
        .getAllAsync('SELECT pathway_id, from_stop_id, to_stop_id, pathway_mode FROM pathways')
        .catch(() => []);
      const calendar = await db
        .getAllAsync(
          'SELECT service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date FROM calendar',
        )
        .catch(() => []);
      const calendarDates = await db.getAllAsync(
        'SELECT service_id, date, exception_type FROM calendar_dates',
      );
      return { stops, routes, pathways, calendar, calendarDates, meta };
    } finally {
      await db.closeAsync().catch(() => {});
    }
  }

  const legacyInfo = await getFileInfo(LEGACY_DB_FILE);
  if (!legacyInfo?.exists) {
    throw new Error('Schedules database was not found on this device.');
  }

  onProgress?.({ message: 'Reading stops and routes...', percent: 0.62 });
  const db = await SQLite.openDatabaseAsync(LEGACY_DB_NAME, { useNewConnection: true });
  try {
    await db.execAsync('PRAGMA journal_mode = WAL;');
    const stops = await db.getAllAsync(
      'SELECT stop_id, stop_name, stop_lat, stop_lon, platform_code, parent_station, location_type FROM stops',
    );
    const routes = await db.getAllAsync(
      'SELECT route_id, route_short_name, route_long_name, route_type FROM routes',
    );
    const pathways = await db
      .getAllAsync('SELECT pathway_id, from_stop_id, to_stop_id, pathway_mode FROM pathways')
      .catch(() => []);
    const calendar = await db
      .getAllAsync(
        'SELECT service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date FROM calendar',
      )
      .catch(() => []);
    const calendarDates = await db.getAllAsync(
      'SELECT service_id, date, exception_type FROM calendar_dates',
    );
    return { stops, routes, pathways, calendar, calendarDates, meta: { format: 'v1' } };
  } finally {
    await db.closeAsync().catch(() => {});
  }
}

function routeTypesForModes(modes) {
  const types = [];
  if (!modes || modes.train !== false) types.push(2);
  if (!modes || modes.bus !== false) types.push(3);
  return types.length ? types : [2, 3];
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function loadTripsForServices(db, serviceIds, routeTypes) {
  if (!serviceIds.length || !routeTypes.length) return [];
  const trips = [];
  const serviceChunks = chunkArray(serviceIds, 200);
  for (const services of serviceChunks) {
    const placeholders = services.map(() => '?').join(',');
    const typePlaceholders = routeTypes.map(() => '?').join(',');
    const sql = `
      SELECT t.route_id, t.trip_id, t.trip_headsign, t.direction_id, t.shape_id, t.service_id
      FROM trips t
      JOIN routes r ON r.route_id = t.route_id
      WHERE t.service_id IN (${placeholders})
        AND CAST(r.route_type AS INTEGER) IN (${typePlaceholders})
    `;
    const rows = await db.getAllAsync(sql, [...services, ...routeTypes]);
    if (rows?.length) trips.push(...rows);
  }
  return trips;
}

async function loadStopTimesForTripIds(db, tripIds) {
  if (!tripIds.length) return [];
  const stopTimes = [];
  for (const chunk of chunkArray(tripIds, STOP_TIME_BATCH_SIZE)) {
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db.getAllAsync(
      `SELECT trip_id, arrival_time, departure_time, stop_id, stop_sequence, stop_headsign, pickup_type, drop_off_type
       FROM stop_times WHERE trip_id IN (${placeholders})`,
      chunk,
    );
    if (rows?.length) stopTimes.push(...rows);
  }
  return stopTimes;
}

export async function loadHostedSchedulesForDates(
  dates,
  modes,
  activeServiceIdsForDateFn,
  onProgress,
) {
  const meta = await getBundleMeta();
  const uniqueDates = [...new Set((dates || []).map((d) => String(d)))].filter(Boolean);
  if (!uniqueDates.length) {
    return { trips: [], stopTimes: [] };
  }

  const routeTypes = routeTypesForModes(modes);
  const allTrips = [];
  const allStopTimes = [];
  let datesDone = 0;

  if (meta?.format === 'v2') {
    for (const ymd of uniqueDates) {
      const target = resolveScheduleDbForDate(ymd, meta);
      if (!target) continue;

      const db = await SQLite.openDatabaseAsync(target.dbName, { useNewConnection: true });
      try {
        await db.execAsync('PRAGMA journal_mode = WAL;');
        const serviceIds = [...activeServiceIdsForDateFn(ymd)];
        const trips = await loadTripsForServices(db, serviceIds, routeTypes);
        const tripIds = trips.map((t) => String(t.trip_id));
        const stopTimes = await loadStopTimesForTripIds(db, tripIds);
        allTrips.push(...trips);
        allStopTimes.push(...stopTimes);
      } finally {
        await db.closeAsync().catch(() => {});
      }

      datesDone += 1;
      onProgress?.({
        message: `Loading schedules (${datesDone}/${uniqueDates.length})...`,
        percent: 0.7 + (datesDone / uniqueDates.length) * 0.25,
      });
    }
    return { trips: allTrips, stopTimes: allStopTimes };
  }

  const legacyInfo = await getFileInfo(LEGACY_DB_FILE);
  if (!legacyInfo?.exists) {
    throw new Error('Schedules database was not found on this device.');
  }

  const db = await SQLite.openDatabaseAsync(LEGACY_DB_NAME, { useNewConnection: true });
  try {
    await db.execAsync('PRAGMA journal_mode = WAL;');
    for (const ymd of uniqueDates) {
      const serviceIds = [...activeServiceIdsForDateFn(ymd)];
      const trips = await loadTripsForServices(db, serviceIds, routeTypes);
      const tripIds = trips.map((t) => String(t.trip_id));
      const stopTimes = await loadStopTimesForTripIds(db, tripIds);
      allTrips.push(...trips);
      allStopTimes.push(...stopTimes);

      datesDone += 1;
      onProgress?.({
        message: `Loading schedules (${datesDone}/${uniqueDates.length})...`,
        percent: 0.7 + (datesDone / uniqueDates.length) * 0.25,
      });
    }
    return { trips: allTrips, stopTimes: allStopTimes };
  } finally {
    await db.closeAsync().catch(() => {});
  }
}

/** @deprecated Use loadHostedCoreTables + loadHostedSchedulesForDates */
export async function loadHostedGtfsRows(onProgress) {
  const core = await loadHostedCoreTables(onProgress);
  const today = torontoTodayYmd();
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    dates.push(addDaysYmd(today, i));
  }
  const schedule = await loadHostedSchedulesForDates(
    dates,
    { train: true, bus: true },
    () => new Set(),
    onProgress,
  );
  return {
    ...core,
    trips: schedule.trips,
    stopTimes: schedule.stopTimes,
  };
}
