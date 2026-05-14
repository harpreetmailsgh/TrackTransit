/*
Find the trip_id for Kitchener Line, Mount Pleasant GO to Union Station GO, 5:47pm departure, and check if it appears in GTFS-RT Trip Updates.
*/
const JSZip = require('jszip');
const Papa = require('papaparse');
const { DateTime } = require('luxon');
const fetch = require('node-fetch');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const GTFS_ZIP_URL = 'https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip';
const TRIP_UPDATES_URL = process.env.TRIP_UPDATES_URL || 'https://api.gotrains.ca/gtfsrt/v2/GO/GTFSRt/TripUpdates';
const RT_FILE_ARG = process.argv.find(a => a.startsWith('--rt-file='));
const RT_FILE_PATH = RT_FILE_ARG ? RT_FILE_ARG.split('=')[1] : null;
const RETRIES = Number(process.env.RT_RETRIES || 2);

function tzNow() { return DateTime.now().setZone('America/Toronto'); }
function todayYmd() { return tzNow().toFormat('yyyyMMdd'); }
function gtfsTimeToSeconds(s){ if(!s) return 0; const [h,m,x] = s.split(':'); return (Number(h)||0)*3600+(Number(m)||0)*60+(Number(x)||0); }
function stopTimeToDateTimeToday(s){ const total=gtfsTimeToSeconds(s); let d=0,r=total; while(r>=86400){ r-=86400; d++; } return tzNow().startOf('day').plus({days:d,seconds:r}); }
async function readZipText(zip, name){ const lower=name.toLowerCase(); const names=Object.keys(zip.files).filter(n=>!zip.files[n].dir); const m=names.find(n=>n.toLowerCase()===lower||n.toLowerCase().endsWith('/'+lower)); return m? zip.file(m).async('string'): null; }
function parseCsv(t){ return Papa.parse(t||'', {header:true, skipEmptyLines:true}).data; }

async function main() {
  // 1. Download GTFS static in parallel with a lazy RT fetch promise
  const gtfsPromise = fetch(GTFS_ZIP_URL);
  const rtPromise = fetchTripUpdatesBufferLazy();
  const [gtfsRes, _ignore] = await Promise.all([gtfsPromise, rtPromise.catch(() => null)]);
  if (!gtfsRes.ok) throw new Error('HTTP ' + gtfsRes.status);

  // 2. Parse GTFS static
  const buf = await gtfsRes.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const [stopsTxt, routesTxt, tripsTxt, stopTimesTxt, calendarTxt, calendarDatesTxt] = await Promise.all([
    readZipText(zip, 'stops.txt'),
    readZipText(zip, 'routes.txt'),
    readZipText(zip, 'trips.txt'),
    readZipText(zip, 'stop_times.txt'),
    readZipText(zip, 'calendar.txt'),
    readZipText(zip, 'calendar_dates.txt')
  ]);
  const stops = parseCsv(stopsTxt);
  const routes = parseCsv(routesTxt);
  const trips = parseCsv(tripsTxt);
  const stopTimes = parseCsv(stopTimesTxt);
  const calendars = parseCsv(calendarTxt || '');
  const calendarDates = parseCsv(calendarDatesTxt || '');

  // 2b. Compute today-active service_ids
  const ymd = todayYmd();
  const dt = tzNow();
  const weekday = dt.toFormat('cccc').toLowerCase(); // e.g., 'saturday'
  const weekdayField = {
    monday: 'monday',
    tuesday: 'tuesday',
    wednesday: 'wednesday',
    thursday: 'thursday',
    friday: 'friday',
    saturday: 'saturday',
    sunday: 'sunday',
  }[weekday];
  const activeService = new Set();
  for (const row of calendars) {
    if (!row.service_id) continue;
    const start = row.start_date;
    const end = row.end_date;
    const inRange = (!start || start <= ymd) && (!end || ymd <= end);
    const runsToday = weekdayField && String(row[weekdayField] || '0') === '1';
    if (inRange && runsToday) activeService.add(String(row.service_id));
  }
  for (const row of calendarDates) {
    if (!row.service_id || row.date !== ymd) continue;
    const sid = String(row.service_id);
    const ex = Number(row.exception_type);
    if (ex === 1) activeService.add(sid); // added service
    else if (ex === 2) activeService.delete(sid); // removed service
  }

  // 3. Find stop_ids for Mount Pleasant GO and Union Station GO
  const norm = s => String(s || '').trim().toLowerCase();
  const fromStop = stops.find(s => norm(s.stop_name) === 'mount pleasant go');
  const toStop = stops.find(s => norm(s.stop_name) === 'union station go');
  if (!fromStop || !toStop) throw new Error('Could not find stop ids');

  // 4. Find Kitchener Line route_id(s)
  const kitchenerRoutes = routes.filter(r => /kitchener/i.test(r.route_long_name) || /kitchener/i.test(r.route_short_name));
  const kitchenerRouteIds = new Set(kitchenerRoutes.map(r => String(r.route_id)));

  // 5. Build a map from trip_id to stop_times for faster lookup
  const tripStopMap = new Map();
  for (const st of stopTimes) {
    if (!tripStopMap.has(st.trip_id)) tripStopMap.set(st.trip_id, []);
    tripStopMap.get(st.trip_id).push(st);
  }

  // 6. Find the first trip that matches all criteria
  const targetDep = '17:47:00';
  const targetArr = '18:35:00';
  let tripId = null;
  for (const t of trips) {
    if (!kitchenerRouteIds.has(String(t.route_id))) continue;
    if (activeService.size && !activeService.has(String(t.service_id))) continue;
    const tripStopTimes = tripStopMap.get(t.trip_id);
    if (!tripStopTimes) continue;
    const fromRow = tripStopTimes.find(st => String(st.stop_id) === String(fromStop.stop_id) && st.departure_time && st.departure_time.trim() === targetDep);
    const toRow = tripStopTimes.find(st => String(st.stop_id) === String(toStop.stop_id) && st.arrival_time && st.arrival_time.trim() === targetArr);
    if (fromRow && toRow) {
      tripId = t.trip_id;
      break; // Short-circuit on first match
    }
  }
  if (!tripId) {
    console.log('No matching trip found for Mount Pleasant GO to Union Station GO at 5:47pm.');
    return;
  }
  console.log('Found trip_id:', tripId);

  // 7. Parse GTFS-RT Trip Updates and look for this trip_id
  const arrBuf = await fetchTripUpdatesBufferLazy();
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(arrBuf));
  const found = feed.entity.find(e => e.tripUpdate && e.tripUpdate.trip && String(e.tripUpdate.trip.tripId) === String(tripId));
  if (found) {
    console.log('Trip update found in GTFS-RT for trip_id:', tripId);
    if (found.tripUpdate.stopTimeUpdate && found.tripUpdate.stopTimeUpdate.length) {
      for (const stu of found.tripUpdate.stopTimeUpdate) {
        console.log('  stop_id:', stu.stopId, 'arrival:', stu.arrival && stu.arrival.time, 'departure:', stu.departure && stu.departure.time, 'delay:', stu.arrival && stu.arrival.delay, stu.departure && stu.departure.delay);
      }
    }
  } else {
    console.log('No trip update found in GTFS-RT for trip_id:', tripId);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

// --- helpers: resilient RT fetching ---
const fs = require('fs');
const { execFile } = require('child_process');

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function fetchTripUpdatesBufferLazy(){
  // Priority 1: local file override for offline/diagnostics
  if (RT_FILE_PATH) {
    return fs.promises.readFile(RT_FILE_PATH);
  }
  // Priority 2: HTTP(S) via node-fetch with simple retries
  let lastErr = null;
  for (let i=0;i<=RETRIES;i++){
    try {
      const res = await fetch(TRIP_UPDATES_URL);
      if (!res.ok) throw new Error('GTFS-RT TripUpdates fetch failed: HTTP '+res.status);
      return res.arrayBuffer();
    } catch (e) {
      lastErr = e;
      if (i<RETRIES) await sleep(500 * (i+1));
    }
  }
  // Priority 3: curl.exe fallback (often bypasses odd Node/DNS issues on Windows)
  try {
    const buf = await execFileBuffer('curl', ['-sS', '-L', '--fail', TRIP_UPDATES_URL]);
    return buf;
  } catch (e) {
    // Priority 4: PowerShell Invoke-WebRequest to a temp file
    try {
      const os = require('os');
      const path = require('path');
      const tmp = path.join(os.tmpdir(), `tripupdates_${Date.now()}.bin`);
      const psCmd = `Invoke-WebRequest -Uri '${TRIP_UPDATES_URL}' -OutFile '${tmp}' -UseBasicParsing`;
      await execFileBuffer('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd]);
      const fileBuf = await fs.promises.readFile(tmp);
      try { fs.unlinkSync(tmp); } catch {}
      return fileBuf;
    } catch (psErr) {
      // Surface the original HTTP error if all fallbacks fail
      throw lastErr || psErr;
    }
  }
}

function execFileBuffer(cmd, args){
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: 'buffer', maxBuffer: 50*1024*1024 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(Buffer.from(stdout));
    });
  });
}
