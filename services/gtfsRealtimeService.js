
// Returns an array of tripIds that have at least one live stop update
export function getTripIdsWithLiveUpdates() {
  const ids = new Set();
  for (const key of stopDelaySeconds.keys()) {
    const [tripId] = key.split(':');
    if (tripId) ids.add(tripId);
  }
  return Array.from(ids);
}
/**
 * GO Transit GTFS-RT (real-time) feeds
 * ---------------------------------
 * These endpoints return **binary Protocol Buffer** data — not JSON.
 * We decode them with the official `gtfs-realtime-bindings` package (same
 * structure Google uses for GTFS-RT).
 *
 * Feeds are polled every 30 seconds while the app is running.
 */

import { DateTime } from 'luxon';
import GtfsRoot from 'gtfs-realtime-bindings';

import {
  getDeparturesForStop,
  getPlatformForTrip,
} from './gtfsService';

const FeedMessage = GtfsRoot.transit_realtime.FeedMessage;

const TRIP_UPDATES_URL =
  'https://api.gotrains.ca/gtfsrt/v2/GO/GTFSRt/TripUpdates';
const VEHICLE_POSITIONS_URL =
  'https://api.gotrains.ca/gtfsrt/v2/GO/GTFSRt/VehiclePosition';

/** @type {Map<string, number>} "tripId:stopId" → per-stop delay in seconds */
const stopDelaySeconds = new Map();

/** @type {Map<string, number>} tripId → trip-level delay in seconds (fallback) */
const tripFallbackDelay = new Map();

/** @type {Map<string, string>} "tripId:stopId" → platform_code from GTFS-RT */
const realtimePlatforms = new Map();

/** @type {object[]} last decoded vehicle entities */
let vehicleSnapshots = [];


/** @type {number|null} last successful realtime refresh timestamp (ms epoch) */
let realtimeLastUpdatedMs = null;

let pollTimer = null;
let pollGeneration = 0;

// ---------------------------------------------------------------------------
// Protobuf decode helper
// ---------------------------------------------------------------------------

function decodeFeed(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return FeedMessage.decode(bytes);
}

/**
 * GTFS-RT "TranslatedString" holds one or more language / text pairs.
 * We grab the first text blob for simplicity.
 */
function readTranslatedField(field) {
  if (!field) return '';
  const list = field.translation;
  if (list && list.length) {
    return list[0].text || '';
  }
  return '';
}

// ---------------------------------------------------------------------------
// Ingest each feed type
// ---------------------------------------------------------------------------

function ingestTripUpdates(feed) {
  stopDelaySeconds.clear();
  tripFallbackDelay.clear();
  realtimePlatforms.clear();
  const entities = feed.entity || [];
  for (const ent of entities) {
    // Protobuf JS uses camelCase (tripUpdate, tripId, stopTimeUpdate, …)
    const tu = ent.tripUpdate;
    if (!tu || !tu.trip || !tu.trip.tripId) continue;
    const tripId = String(tu.trip.tripId);

    // Keep a trip-wide fallback delay in case stop-level IDs are missing.
    let fallbackDelaySec =
      tu.delay !== undefined && tu.delay !== null ? Number(tu.delay) : null;

    const stus = tu.stopTimeUpdate || [];
    for (const stu of stus) {
      let stopDelaySec = null;
      if (stu.departure?.delay !== undefined && stu.departure?.delay !== null) {
        stopDelaySec = stu.departure.delay;
      } else if (stu.arrival?.delay !== undefined && stu.arrival?.delay !== null) {
        stopDelaySec = stu.arrival.delay;
      } else if (tu.delay !== undefined && tu.delay !== null) {
        stopDelaySec = tu.delay;
      }

      if (fallbackDelaySec === null && stopDelaySec !== null) {
        fallbackDelaySec = Number(stopDelaySec);
      }

      // Store per-stop delay keyed by tripId:stopId
      if (stu.stopId) {
        const stopId = String(stu.stopId);
        if (stopDelaySec !== null) {
          stopDelaySeconds.set(`${tripId}:${stopId}`, Number(stopDelaySec));
        }
      }
      // Extract platform_code — GTFS-RT spec allows it on StopTimeUpdate
      const pc = stu.platformCode || stu.platform_code;
      if (pc && String(pc).trim() && stu.stopId) {
        realtimePlatforms.set(`${tripId}:${String(stu.stopId)}`, String(pc).trim());
      }
    }

    if (fallbackDelaySec !== null) {
      tripFallbackDelay.set(tripId, fallbackDelaySec);
    }
  }
}

function ingestVehiclePositions(feed) {
  const out = [];
  const entities = feed.entity || [];
  for (const ent of entities) {
    const v = ent.vehicle;
    if (!v || !v.position) continue;
    const lat = v.position.latitude;
    const lon = v.position.longitude;
    if (lat === undefined || lon === undefined) continue;
    out.push({
      id: ent.id ? String(ent.id) : undefined,
      trip_id: v.trip && v.trip.tripId ? String(v.trip.tripId) : null,
      route_id: v.trip && v.trip.routeId ? String(v.trip.routeId) : null,
      latitude: lat,
      longitude: lon,
      bearing: v.position.bearing !== undefined ? v.position.bearing : null,
      speed: v.position.speed !== undefined ? v.position.speed : null,
      timestamp: v.timestamp ? Number(v.timestamp) : null,
    });
  }
  vehicleSnapshots = out;
}


// ---------------------------------------------------------------------------
// Network fetch
// ---------------------------------------------------------------------------

async function fetchProtobuf(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GTFS-RT ${url} failed: HTTP ${res.status}`);
  }
  return res.arrayBuffer();
}

async function refreshAllFeeds() {

  const [tripRes, vehRes] = await Promise.allSettled([
    fetchProtobuf(TRIP_UPDATES_URL),
    fetchProtobuf(VEHICLE_POSITIONS_URL),
  ]);

  let successCount = 0;

  if (tripRes.status === 'fulfilled') {
    ingestTripUpdates(decodeFeed(tripRes.value));
    successCount += 1;
  }

  if (vehRes.status === 'fulfilled') {
    ingestVehiclePositions(decodeFeed(vehRes.value));
    successCount += 1;
  }


  if (successCount > 0) {
    realtimeLastUpdatedMs = Date.now();
    return;
  }

  throw new Error('All GTFS-RT feeds failed to refresh.');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns delay in seconds for a specific trip+stop, or `undefined` if unknown.
 * Falls back to the trip-level delay if no per-stop entry is available.
 */
export function getDelayForStop(tripId, stopId) {
  const perStop = stopDelaySeconds.get(`${String(tripId)}:${String(stopId)}`);
  if (perStop !== undefined) return perStop;
  return tripFallbackDelay.get(String(tripId));
}

/**
 * Returns delay for a trip in **whole minutes** (rounded), or `null` if unknown.
 */
export function getLiveDelay(tripId) {
  const sec = tripFallbackDelay.get(String(tripId));
  if (sec === undefined) return null;
  return Math.round(sec / 60);
}

export function getVehiclePositions() {
  return [...vehicleSnapshots];
}


export function getRealtimeLastUpdatedMs() {
  return realtimeLastUpdatedMs;
}

/**
 * Static departures for the stop, merged with live delay seconds when we have them.
 * `liveDateTime` / `liveTimeLabel` reflect schedule + delay (Toronto local clock).
 */
export function getLiveDepartures(stopId, limit = 10, options = {}) {
  const { mode = null } = options;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 10;
  const staticDeps = getDeparturesForStop(stopId, safeLimit, { mode });
  const now = DateTime.now().setZone('America/Toronto');
  const merged = staticDeps.map((row) => {
    const tid = String(row.trip_id);
    const delaySec = getDelayForStop(tid, String(row._actual_stop_id));

    let liveDt = DateTime.fromISO(row.scheduledDateTime);
    if (delaySec !== undefined) {
      liveDt = liveDt.plus({ seconds: delaySec });
    }

    return {
      ...row,
      delayMinutes:
        delaySec !== undefined ? Math.round(delaySec / 60) : null,
      liveDateTime: liveDt.toISO(),
      liveTimeLabel: liveDt.toFormat('h:mm a').toUpperCase(),
      platformCode:
        realtimePlatforms.get(`${tid}:${stopId}`) ||
        row.platformCode ||
        getPlatformForTrip(tid, stopId) ||
        null,
    };
  });

  merged.sort(
    (a, b) =>
      DateTime.fromISO(a.liveDateTime).toMillis() -
      DateTime.fromISO(b.liveDateTime).toMillis(),
  );

  return merged.filter((row) => DateTime.fromISO(row.liveDateTime) >= now).slice(0, safeLimit);
}

/**
 * Starts the 30-second polling loop. Safe to call once after static GTFS loads.
 */
export function startRealtimeUpdates() {
  stopRealtimeUpdates();
  const gen = ++pollGeneration;

  const run = async () => {
    if (gen !== pollGeneration) return;
    try {
      await refreshAllFeeds();
    } catch {
      // Keep previous snapshot on failure — trains may still be partially shown.
    }
  };

  run();
  pollTimer = setInterval(run, 30000);
}

/**
 * Stops polling (e.g. when the root component unmounts).
 */
export function stopRealtimeUpdates() {
  pollGeneration += 1;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
