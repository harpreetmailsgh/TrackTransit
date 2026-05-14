/*
 List 10 GO train trips running today using public GTFS.
 Outputs: JSON lines with departure time, route, headsign, trip_id.
*/

const JSZip = require('jszip');
const Papa = require('papaparse');
const { DateTime } = require('luxon');

const GTFS_ZIP_URL = 'https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip';

function torontoNow() {
  return DateTime.now().setZone('America/Toronto');
}

function torontoTodayYmd() {
  return torontoNow().toFormat('yyyyMMdd');
}

function gtfsTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.trim().split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  const s = Number(parts[2]) || 0;
  return h * 3600 + m * 60 + s;
}

function stopTimeToDateTimeToday(timeStr) {
  const zone = 'America/Toronto';
  const totalSec = gtfsTimeToSeconds(timeStr);
  let dayOffset = 0;
  let remainder = totalSec;
  while (remainder >= 86400) {
    remainder -= 86400;
    dayOffset += 1;
  }
  return torontoNow().startOf('day').plus({ days: dayOffset, seconds: remainder }).setZone(zone);
}

async function readZipText(zip, fileName) {
  const lower = fileName.toLowerCase();
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const match = names.find((n) => n.toLowerCase() === lower || n.toLowerCase().endsWith(`/${lower}`));
  if (!match) return null;
  const entry = zip.file(match);
  return entry ? entry.async('string') : null;
}

function parseCsv(txt) {
  const parsed = Papa.parse(txt, { header: true, skipEmptyLines: true });
  return parsed.data;
}

function activeServiceIdsToday(calendarRows, calendarDatesRows) {
  const today = torontoTodayYmd();
  if (!calendarRows || calendarRows.length === 0) {
    const active = new Set();
    for (const row of calendarDatesRows || []) {
      if (String(row.date) === today && String(row.exception_type) === '1') {
        active.add(String(row.service_id));
      }
    }
    return active;
  }

  // With calendar.txt present: apply weekday + date range + exceptions
  const wd = torontoNow().weekday; // 1..7
  const weekdayMap = { 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday', 7: 'sunday' };
  const weekdayCol = weekdayMap[wd];

  const exceptions = new Map();
  for (const row of calendarDatesRows || []) {
    if (String(row.date) === today) {
      exceptions.set(String(row.service_id), String(row.exception_type));
    }
  }

  const active = new Set();
  for (const row of calendarRows) {
    const sid = String(row.service_id);
    if (exceptions.get(sid) === '2') continue; // removed today
    if (today < String(row.start_date) || today > String(row.end_date)) continue;
    const flag = row[weekdayCol];
    if (!(flag === '1' || flag === 1)) continue;
    active.add(sid);
  }
  for (const [sid, type] of exceptions) {
    if (type === '1') active.add(sid);
  }
  return active;
}

(async () => {
  try {
    const res = await fetch(GTFS_ZIP_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    const [routesTxt, tripsTxt, stopTimesTxt, calendarTxt, calendarDatesTxt] = await Promise.all([
      readZipText(zip, 'routes.txt'),
      readZipText(zip, 'trips.txt'),
      readZipText(zip, 'stop_times.txt'),
      readZipText(zip, 'calendar.txt'),
      readZipText(zip, 'calendar_dates.txt'),
    ]);

    const routes = parseCsv(routesTxt || '');
    const trips = parseCsv(tripsTxt || '');
    const stopTimes = parseCsv(stopTimesTxt || '');
    const calendar = calendarTxt ? parseCsv(calendarTxt) : [];
    const calendarDates = calendarDatesTxt ? parseCsv(calendarDatesTxt) : [];

    const trainRouteIds = new Set(routes.filter((r) => Number(r.route_type) === 2).map((r) => String(r.route_id)));
    const activeServices = activeServiceIdsToday(calendar, calendarDates);

    const trainTripsToday = trips
      .filter((t) => trainRouteIds.has(String(t.route_id)) && activeServices.has(String(t.service_id)));

    // index stop_times by trip and pick earliest (smallest stop_sequence) to get departure reference
    const byTrip = new Map();
    for (const st of stopTimes) {
      const tid = String(st.trip_id || '').trim();
      if (!tid) continue;
      if (!byTrip.has(tid)) byTrip.set(tid, []);
      byTrip.get(tid).push(st);
    }
    for (const arr of byTrip.values()) {
      arr.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    }

    const now = torontoNow();
    const items = [];
    for (const t of trainTripsToday) {
      const tid = String(t.trip_id);
      const rows = byTrip.get(tid);
      if (!rows || rows.length === 0) continue;
      const first = rows[0];
      const depStr = (first.departure_time || first.arrival_time || '').trim();
      if (!depStr) continue;
      const depDt = stopTimeToDateTimeToday(depStr);
      items.push({
        trip_id: tid,
        route_id: String(t.route_id),
        service_id: String(t.service_id),
        headsign: (t.trip_headsign || '').trim(),
        departure: depDt,
      });
    }

    // Keep upcoming trips today (>= now) and take first 10 by departure
    const upcoming = items
      .filter((x) => x.departure >= now)
      .sort((a, b) => a.departure.toMillis() - b.departure.toMillis())
      .slice(0, 10);

    const routeById = new Map(routes.map((r) => [String(r.route_id), r]));

    const out = upcoming.map((x) => {
      const r = routeById.get(x.route_id) || {};
      const line = (r.route_long_name || r.route_short_name || 'GO').toString();
      return {
        departureLocal: x.departure.toFormat('EEE, MMM d h:mm a').toUpperCase(),
        line,
        headsign: x.headsign,
        trip_id: x.trip_id,
        route_id: x.route_id,
      };
    });

    console.log(JSON.stringify({ date: torontoTodayYmd(), count: out.length, items: out }, null, 2));
  } catch (e) {
    console.error('Failed to list trains:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
