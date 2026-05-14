/*
 Find a Kitchener Line trip that departs Union Station GO at 18:38 today.
 Prints the matching trip, including destination and key identifiers.
*/

const JSZip = require('jszip');
const Papa = require('papaparse');
const { DateTime } = require('luxon');

const GTFS_ZIP_URL = 'https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip';

function tzNow() { return DateTime.now().setZone('America/Toronto'); }
function todayYmd() { return tzNow().toFormat('yyyyMMdd'); }

function parseCsv(txt){ return Papa.parse(txt || '', { header: true, skipEmptyLines: true }).data; }

async function readZipText(zip, name){
  const lower = name.toLowerCase();
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
  const m = names.find(n => n.toLowerCase() === lower || n.toLowerCase().endsWith('/' + lower));
  return m ? zip.file(m).async('string') : null;
}

function activeServiceIdsToday(calendarRows, calendarDatesRows){
  const today = todayYmd();
  if (!calendarRows || calendarRows.length === 0) {
    const active = new Set();
    for (const row of calendarDatesRows || []) {
      if (String(row.date) === today && String(row.exception_type) === '1') {
        active.add(String(row.service_id));
      }
    }
    return active;
  }
  const wd = tzNow().weekday; // 1..7 Mon..Sun
  const weekdayMap = { 1:'monday',2:'tuesday',3:'wednesday',4:'thursday',5:'friday',6:'saturday',7:'sunday' };
  const weekdayCol = weekdayMap[wd];
  const exceptions = new Map();
  for (const row of calendarDatesRows || []) {
    if (String(row.date) === today) exceptions.set(String(row.service_id), String(row.exception_type));
  }
  const active = new Set();
  for (const row of calendarRows) {
    const sid = String(row.service_id);
    if (exceptions.get(sid) === '2') continue;
    if (today < String(row.start_date) || today > String(row.end_date)) continue;
    const flag = row[weekdayCol];
    if (!(flag === '1' || flag === 1)) continue;
    active.add(sid);
  }
  for (const [sid, type] of exceptions) if (type === '1') active.add(sid);
  return active;
}

(async () => {
  try {
    const res = await fetch(GTFS_ZIP_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    const [stopsTxt, routesTxt, tripsTxt, stopTimesTxt, calendarTxt, calendarDatesTxt] = await Promise.all([
      readZipText(zip, 'stops.txt'),
      readZipText(zip, 'routes.txt'),
      readZipText(zip, 'trips.txt'),
      readZipText(zip, 'stop_times.txt'),
      readZipText(zip, 'calendar.txt'),
      readZipText(zip, 'calendar_dates.txt'),
    ]);

    const stops = parseCsv(stopsTxt);
    const routes = parseCsv(routesTxt);
    const trips = parseCsv(tripsTxt);
    const stopTimes = parseCsv(stopTimesTxt);
    const calendar = calendarTxt ? parseCsv(calendarTxt) : [];
    const calendarDates = calendarDatesTxt ? parseCsv(calendarDatesTxt) : [];

    const norm = s => String(s || '').trim().toLowerCase();
    const union = stops.find(s => norm(s.stop_name) === 'union station go');
    if (!union) throw new Error('Union Station GO not found in stops');

    const kitchenerRoutes = routes.filter(r => /kitchener/i.test(r.route_long_name) || /kitchener/i.test(r.route_short_name));
    const kitchenerRouteIds = new Set(kitchenerRoutes.map(r => String(r.route_id)));
    if (kitchenerRouteIds.size === 0) throw new Error('No routes matched "Kitchener"');

    const activeSids = activeServiceIdsToday(calendar, calendarDates);

    // Build index: trip_id -> stop_times rows for efficient filtering
    const byTrip = new Map();
    for (const st of stopTimes) {
      const tid = String(st.trip_id || '').trim();
      if (!tid) continue;
      if (!byTrip.has(tid)) byTrip.set(tid, []);
      byTrip.get(tid).push(st);
    }
    for (const arr of byTrip.values()) arr.sort((a,b)=> Number(a.stop_sequence) - Number(b.stop_sequence));

    const targetDep = '18:38:00';
    const matches = [];

    for (const t of trips) {
      const tid = String(t.trip_id);
      if (!kitchenerRouteIds.has(String(t.route_id))) continue;
      if (activeSids.size && !activeSids.has(String(t.service_id))) continue;
      const rows = byTrip.get(tid);
      if (!rows) continue;
      const atUnion = rows.find(r => String(r.stop_id) === String(union.stop_id) && String(r.departure_time || '').trim() === targetDep);
      if (!atUnion) continue;

      const first = rows[0];
      const last = rows[rows.length - 1];
      const origin = stops.find(s => String(s.stop_id) === String(first.stop_id));
      const dest = stops.find(s => String(s.stop_id) === String(last.stop_id));
      matches.push({
        trip_id: tid,
        route_id: String(t.route_id),
        service_id: String(t.service_id),
        headsign: (t.trip_headsign || '').trim(),
        union_departure: targetDep,
        origin: origin ? origin.stop_name : String(first.stop_id),
        destination: dest ? dest.stop_name : String(last.stop_id),
      });
    }

    if (!matches.length) {
      // Fallback: find any Kitchener trip that has a stop with departure 18:38 anywhere
      const anyMatches = [];
      for (const t of trips) {
        if (!kitchenerRouteIds.has(String(t.route_id))) continue;
        if (activeSids.size && !activeSids.has(String(t.service_id))) continue;
        const tid = String(t.trip_id);
        const rows = byTrip.get(tid);
        if (!rows) continue;
        const r = rows.find(r => String(r.departure_time || '').trim() === targetDep);
        if (!r) continue;
        const stop = stops.find(s => String(s.stop_id) === String(r.stop_id));
        const first = rows[0];
        const last = rows[rows.length - 1];
        const origin = stops.find(s => String(s.stop_id) === String(first.stop_id));
        const dest = stops.find(s => String(s.stop_id) === String(last.stop_id));
        const unionRow = rows.find(x => String(x.stop_id) === String(union.stop_id));
        anyMatches.push({
          trip_id: tid,
          at_stop_id: String(r.stop_id),
          at_stop_name: stop ? stop.stop_name : String(r.stop_id),
          union_departure: unionRow ? String(unionRow.departure_time || unionRow.arrival_time || '').trim() : null,
          origin: origin ? origin.stop_name : String(first.stop_id),
          destination: dest ? dest.stop_name : String(last.stop_id),
          route_id: String(t.route_id),
          headsign: (t.trip_headsign || '').trim(),
        });
      }
      if (anyMatches.length) {
        console.log(JSON.stringify({ date: todayYmd(), found: true, union: false, count: anyMatches.length, matches: anyMatches }, null, 2));
      } else {
        console.log(JSON.stringify({ date: todayYmd(), found: false, reason: 'No Kitchener trip has a stop with 18:38 departure today' }, null, 2));
      }
    } else {
      console.log(JSON.stringify({ date: todayYmd(), found: true, count: matches.length, matches }, null, 2));
    }
  } catch (e) {
    console.error('Error:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
