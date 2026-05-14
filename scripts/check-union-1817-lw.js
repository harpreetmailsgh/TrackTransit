/*
 Check Lakeshore West train at Union departing 6:17 PM today via Metrolinx API only.
 Reports delay/on-time status and platform availability.
*/

const { DateTime } = require('luxon');

const BASE_URL = 'https://api.openmetrolinx.com/OpenDataAPI/api/V1';
const API_KEY = '30027664';
const TORONTO_TZ = 'America/Toronto';

function tzNow(){ return DateTime.now().setZone(TORONTO_TZ); }
function parseDT(value){
  const raw = String(value || '').trim();
  if (!raw) return DateTime.invalid('missing');
  let dt = DateTime.fromISO(raw, { zone: TORONTO_TZ });
  if (dt.isValid) return dt;
  dt = DateTime.fromSQL(raw, { zone: TORONTO_TZ });
  return dt;
}

function normServiceName(s){
  return String(s || '').toLowerCase().replace(/\s+line\b/g,'').trim();
}

async function getUnionDepartures(){
  const url = `${BASE_URL}/ServiceUpdate/UnionDepartures/All?key=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('UnionDepartures HTTP '+res.status);
  const payload = await res.json();
  const trips = payload && payload.AllDepartures && payload.AllDepartures.Trip;
  return Array.isArray(trips) ? trips : (trips ? [trips] : []);
}

async function getStopNextService(stopCode){
  const url = `${BASE_URL}/Stop/NextService/${encodeURIComponent(stopCode)}?key=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('NextService HTTP '+res.status);
  const payload = await res.json();
  const lines = payload && payload.NextService && payload.NextService.Lines;
  return Array.isArray(lines) ? lines : (lines ? [lines] : []);
}

(async () => {
  try {
    const target = tzNow().set({ hour: 18, minute: 17, second: 0, millisecond: 0 });
    const targetMinute = target.toFormat('yyyy-MM-dd HH:mm');

    // 1) Query Union Departures for Lakeshore West around 18:17
    const unionTrips = await getUnionDepartures();
    const unionMatches = unionTrips
      .map((t) => ({
        Service: t && t.Service,
        Time: t && t.Time,
        Platform: t && t.Platform,
        TripNumber: t && t.TripNumber,
      }))
      .filter((t) => normServiceName(t.Service).includes('lakeshore west'))
      .map((t) => ({ ...t, dt: parseDT(t.Time) }))
      .filter((t) => t.dt && t.dt.isValid);

    // Prefer exact minute match, else nearest within 5 minutes
    let unionPick = unionMatches.find((t) => t.dt.toFormat('yyyy-MM-dd HH:mm') === targetMinute);
    if (!unionPick) {
      let best = null, bestDelta = Infinity;
      for (const t of unionMatches) {
        const delta = Math.abs(t.dt.diff(target, 'minutes').minutes);
        if (delta < bestDelta) { bestDelta = delta; best = t; }
      }
      if (best && bestDelta <= 5) unionPick = best;
    }

    // 2) Query NextService for UN to compute delay from Computed vs Scheduled
    const lines = await getStopNextService('UN');
    const lineMatches = lines
      .map((l) => ({
        LineName: l && l.LineName,
        ScheduledDepartureTime: l && l.ScheduledDepartureTime,
        ComputedDepartureTime: l && l.ComputedDepartureTime,
        ActualPlatform: l && l.ActualPlatform,
        ScheduledPlatform: l && l.ScheduledPlatform,
        TripNumber: l && l.TripNumber,
      }))
      .filter((l) => normServiceName(l.LineName).includes('lakeshore west'))
      .map((l) => ({
        ...l,
        sched: parseDT(l.ScheduledDepartureTime),
        comp: parseDT(l.ComputedDepartureTime),
      }))
      .filter((l) => l.sched && l.sched.isValid);

    // Prefer same trip number if known from Union pick
    let linePick = null;
    if (unionPick && unionPick.TripNumber) {
      linePick = lineMatches.find((l) => String(l.TripNumber || '').trim() === String(unionPick.TripNumber).trim());
    }
    // Else exact minute match, else nearest within 5 minutes
    if (!linePick) {
      linePick = lineMatches.find((l) => l.sched.toFormat('yyyy-MM-dd HH:mm') === targetMinute) || null;
    }
    if (!linePick) {
      let best = null, bestDelta = Infinity;
      for (const l of lineMatches) {
        const delta = Math.abs(l.sched.diff(target, 'minutes').minutes);
        if (delta < bestDelta) { bestDelta = delta; best = l; }
      }
      if (best && bestDelta <= 5) linePick = best;
    }

    // Derive delay
    let delaySec = null;
    if (linePick && linePick.sched && linePick.comp && linePick.comp.isValid) {
      delaySec = Math.round(linePick.comp.diff(linePick.sched, 'seconds').seconds);
    }
    const status = delaySec == null ? 'unknown' : (delaySec > 0 ? 'delayed' : 'on-time');

    const platform = (linePick && (String(linePick.ActualPlatform || '').trim() || String(linePick.ScheduledPlatform || '').trim())) ||
                     (unionPick && String(unionPick.Platform || '').trim()) || null;

    console.log(JSON.stringify({
      date: tzNow().toISODate(),
      target: target.toFormat('h:mm a'),
      union:
        unionPick ? {
          service: unionPick.Service,
          time: unionPick.dt.toISO(),
          platform: unionPick.Platform || null,
          tripNumber: unionPick.TripNumber || null,
        } : null,
      nextService:
        linePick ? {
          lineName: linePick.LineName,
          scheduled: linePick.sched.toISO(),
          computed: linePick.comp && linePick.comp.isValid ? linePick.comp.toISO() : null,
          actualPlatform: linePick.ActualPlatform || null,
          scheduledPlatform: linePick.ScheduledPlatform || null,
          tripNumber: linePick.TripNumber || null,
        } : null,
      derived: {
        delaySeconds: delaySec,
        status,
        platform,
      }
    }, null, 2));
  } catch (e) {
    console.error('Error:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
