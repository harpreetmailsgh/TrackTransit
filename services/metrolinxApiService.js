// Fetch advisories from Metrolinx Open Data API
export async function getMetrolinxAdvisories() {
  const url = `${BASE_URL}/ServiceUpdate/Advisory?key=${encodeURIComponent(API_KEY)}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Metrolinx API advisories failed (${res.status})`);
  }
  const payload = await res.json();
  // Normalize to array
  const advisories = Array.isArray(payload) ? payload : (payload ? [payload] : []);
  // Map to a common alert-like structure
  return advisories.map((adv) => ({
    id: adv.AdvisoryId || adv.id || undefined,
    header: adv.Title || '',
    description: adv.Description || '',
    cause: adv.Cause || null,
    effect: adv.Severity || null,
    informedEntities: [],
    activePeriod: [
      {
        start: adv.StartDate ? DateTime.fromISO(adv.StartDate).toSeconds() : null,
        end: adv.EndDate ? DateTime.fromISO(adv.EndDate).toSeconds() : null,
      },
    ],
    source: 'metrolinx-advisory',
  }));
}
import { DateTime } from 'luxon';

const BASE_URL = 'https://api.openmetrolinx.com/OpenDataAPI/api/V1';
const API_KEY = '30027664';
const TORONTO_TZ = 'America/Toronto';

function parseMetrolinxDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return DateTime.invalid('missing datetime');

  let dt = DateTime.fromISO(raw, { zone: TORONTO_TZ });
  if (dt.isValid) return dt;

  dt = DateTime.fromSQL(raw, { zone: TORONTO_TZ });
  if (dt.isValid) return dt;

  return DateTime.invalid('unrecognized datetime format');
}

function parseTripNumber(value) {
  const raw = String(value || '').trim();
  return raw || null;
}

function normalizePlatform(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '-' || raw === '--') return null;
  return raw;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function normalizeServiceName(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/\s+line\b/g, '').replace(/\s+/g, ' ').trim();
}

function matchesService(candidate, wanted) {
  if (!wanted) return true;
  return normalizeServiceName(candidate).includes(wanted);
}

function findByExactMinute(items, targetDt, getTime, filterFn = null) {
  const targetMinute = targetDt.toFormat('yyyy-MM-dd HH:mm');
  return items.find((item) => {
    if (filterFn && !filterFn(item)) return false;
    const dt = parseMetrolinxDateTime(getTime(item));
    if (!dt.isValid) return false;
    return dt.toFormat('yyyy-MM-dd HH:mm') === targetMinute;
  }) || null;
}

function findNearest(items, targetDt, getTime, maxDeltaMinutes, filterFn = null) {
  let nearest = null;
  let nearestDeltaMin = Infinity;
  for (const item of items) {
    if (filterFn && !filterFn(item)) continue;
    const dt = parseMetrolinxDateTime(getTime(item));
    if (!dt.isValid) continue;
    const deltaMin = Math.abs(dt.diff(targetDt, 'minutes').minutes);
    if (deltaMin < nearestDeltaMin) {
      nearestDeltaMin = deltaMin;
      nearest = item;
    }
  }
  if (!nearest || nearestDeltaMin > maxDeltaMinutes) return null;
  return nearest;
}

export async function getStopNextService(stopCode) {
  const code = String(stopCode || '').trim();
  if (!code) return [];

  const url = `${BASE_URL}/Stop/NextService/${encodeURIComponent(code)}?key=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Metrolinx API failed (${res.status})`);
  }

  const payload = await res.json();
  return asArray(payload?.NextService?.Lines);
}

export async function getUnionDepartures() {
  const url = `${BASE_URL}/ServiceUpdate/UnionDepartures/All?key=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Metrolinx API failed (${res.status})`);
  }

  const payload = await res.json();
  return asArray(payload?.AllDepartures?.Trip);
}

export async function getPlatformMatchForStop({
  stopCode,
  scheduledDateTimeIso,
  serviceName = '',
  preferredTripNumber = null,
}) {
  const target = parseMetrolinxDateTime(scheduledDateTimeIso);
  if (!target.isValid) {
    return { platformCode: null, tripNumber: null, source: 'none' };
  }

  const wantedService = normalizeServiceName(serviceName);
  const preferredTrip = parseTripNumber(preferredTripNumber);

  const lines = await getStopNextService(stopCode);
  const lineServiceFilter = (line) => matchesService(line?.LineName, wantedService);

  let matchedLine = null;
  if (preferredTrip) {
    matchedLine =
      findByExactMinute(
        lines,
        target,
        (line) => line?.ScheduledDepartureTime,
        (line) => parseTripNumber(line?.TripNumber) === preferredTrip,
      ) ||
      findNearest(
        lines,
        target,
        (line) => line?.ScheduledDepartureTime,
        20,
        (line) => parseTripNumber(line?.TripNumber) === preferredTrip,
      );
  }

  if (!matchedLine) {
    matchedLine =
      findByExactMinute(lines, target, (line) => line?.ScheduledDepartureTime, lineServiceFilter) ||
      findNearest(lines, target, (line) => line?.ScheduledDepartureTime, 5, lineServiceFilter);
  }

  if (matchedLine) {
    return {
      platformCode:
        normalizePlatform(matchedLine?.ActualPlatform) ||
        normalizePlatform(matchedLine?.ScheduledPlatform),
      tripNumber: parseTripNumber(matchedLine?.TripNumber),
      source: 'nextservice',
    };
  }

  // Union-specific fallback: this endpoint has a dedicated Platform field.
  if (String(stopCode || '').trim().toUpperCase() !== 'UN') {
    return { platformCode: null, tripNumber: null, source: 'none' };
  }

  const trips = await getUnionDepartures();

  let matchedUnion = null;
  if (preferredTrip) {
    matchedUnion =
      findByExactMinute(
        trips,
        target,
        (trip) => trip?.Time,
        (trip) => parseTripNumber(trip?.TripNumber) === preferredTrip,
      ) ||
      findNearest(
        trips,
        target,
        (trip) => trip?.Time,
        20,
        (trip) => parseTripNumber(trip?.TripNumber) === preferredTrip,
      );
  }

  if (!matchedUnion) {
    matchedUnion =
      findByExactMinute(
        trips,
        target,
        (trip) => trip?.Time,
        (trip) => matchesService(trip?.Service, wantedService),
      ) ||
      findNearest(
        trips,
        target,
        (trip) => trip?.Time,
        5,
        (trip) => matchesService(trip?.Service, wantedService),
      );
  }

  if (!matchedUnion) {
    return { platformCode: null, tripNumber: null, source: 'none' };
  }

  return {
    platformCode: normalizePlatform(matchedUnion?.Platform),
    tripNumber: parseTripNumber(matchedUnion?.TripNumber),
    source: 'union',
  };
}

export async function getPlatformForDeparture(stopCode, scheduledDateTimeIso, serviceName = '') {
  const match = await getPlatformMatchForStop({ stopCode, scheduledDateTimeIso, serviceName });
  return match.platformCode;
}
