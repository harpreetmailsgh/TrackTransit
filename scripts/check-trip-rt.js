/*
 Check if a given trip_id has a GTFS-RT Trip Update.
 Usage: node scripts/check-trip-rt.js <trip_id>
 Optional: set env TRIP_UPDATES_URL to override the RT endpoint.
*/

const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const { execFile } = require('child_process');

const TRIP_UPDATES_URL = process.env.TRIP_UPDATES_URL || 'https://api.gotrains.ca/gtfsrt/v2/GO/GTFSRt/TripUpdates';
const tripId = process.argv[2] || '';

if (!tripId) {
  console.error('Usage: node scripts/check-trip-rt.js <trip_id>');
  process.exit(2);
}

function execFileBuffer(cmd, args){
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: 'buffer', maxBuffer: 50*1024*1024 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(Buffer.from(stdout));
    });
  });
}

async function fetchRtBuffer(){
  // Primary: native fetch
  try {
    const res = await fetch(TRIP_UPDATES_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    // Fallback 1: curl
    try {
      return await execFileBuffer('curl', ['-sS', '-L', '--fail', TRIP_UPDATES_URL]);
    } catch (ce) {
      // Fallback 2: PowerShell IWR
      const os = require('os');
      const path = require('path');
      const tmp = path.join(os.tmpdir(), `tripupdates_${Date.now()}.bin`);
      const psCmd = `Invoke-WebRequest -Uri '${TRIP_UPDATES_URL}' -OutFile '${tmp}' -UseBasicParsing`;
      try {
        await execFileBuffer('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd]);
        const fs = require('fs');
        const buf = await fs.promises.readFile(tmp);
        try { fs.unlinkSync(tmp); } catch {}
        return buf;
      } catch (pe) {
        throw e; // surface the original fetch error
      }
    }
  }
}

(async () => {
  try {
    const buf = await fetchRtBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buf));
    const entity = feed.entity.find(e => e.tripUpdate && e.tripUpdate.trip && String(e.tripUpdate.trip.tripId) === String(tripId));
    if (!entity) {
      console.log(JSON.stringify({ trip_id: tripId, rt: false }, null, 2));
      return;
    }
    const stu = (entity.tripUpdate.stopTimeUpdate || []).map(x => ({
      stop_id: x.stopId || null,
      arrival: x.arrival && x.arrival.time ? Number(x.arrival.time) : null,
      departure: x.departure && x.departure.time ? Number(x.departure.time) : null,
      arrival_delay: x.arrival && typeof x.arrival.delay === 'number' ? x.arrival.delay : null,
      departure_delay: x.departure && typeof x.departure.delay === 'number' ? x.departure.delay : null,
      schedule_relationship: x.scheduleRelationship || null,
    }));
    console.log(JSON.stringify({ trip_id: tripId, rt: true, updates: stu }, null, 2));
  } catch (e) {
    console.error('Failed to fetch/parse TripUpdates:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
