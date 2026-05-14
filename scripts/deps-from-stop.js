/* List next 15 departures from a given stop name (train-only) */
const JSZip = require('jszip');
const Papa = require('papaparse');
const { DateTime } = require('luxon');

const GTFS_ZIP_URL = 'https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip';

function tzNow() { return DateTime.now().setZone('America/Toronto'); }
function todayYmd() { return tzNow().toFormat('yyyyMMdd'); }
function gtfsTimeToSeconds(s){ if(!s) return 0; const [h,m,x] = s.split(':'); return (Number(h)||0)*3600+(Number(m)||0)*60+(Number(x)||0); }
function stopTimeToDateTimeToday(s){ const total=gtfsTimeToSeconds(s); let d=0,r=total; while(r>=86400){ r-=86400; d++; } return tzNow().startOf('day').plus({days:d,seconds:r}); }
async function readZipText(zip, name){ const lower=name.toLowerCase(); const names=Object.keys(zip.files).filter(n=>!zip.files[n].dir); const m=names.find(n=>n.toLowerCase()===lower||n.toLowerCase().endsWith('/'+lower)); return m? zip.file(m).async('string'): null; }
function parseCsv(t){ return Papa.parse(t||'', {header:true, skipEmptyLines:true}).data; }
function activeServiceIdsToday(calendar, calendarDates){
  const today = todayYmd();
  if(!calendar || calendar.length===0){
    const s=new Set();
    for(const r of calendarDates||[]){ if(String(r.date)===today && String(r.exception_type)==='1') s.add(String(r.service_id)); }
    return s;
  }
  const wd = tzNow().weekday; const map={1:'monday',2:'tuesday',3:'wednesday',4:'thursday',5:'friday',6:'saturday',7:'sunday'}; const col=map[wd];
  const ex=new Map(); for(const r of calendarDates||[]){ if(String(r.date)===today) ex.set(String(r.service_id), String(r.exception_type)); }
  const s=new Set();
  for(const r of calendar){ const sid=String(r.service_id); if(ex.get(sid)==='2') continue; if(today < String(r.start_date) || today > String(r.end_date)) continue; const flag=r[col]; if(!(flag==='1'||flag===1)) continue; s.add(sid); }
  for(const [sid,t] of ex){ if(t==='1') s.add(sid); }
  return s;
}

async function main(stopNameQuery){
  const res = await fetch(GTFS_ZIP_URL); if(!res.ok) throw new Error('HTTP '+res.status);
  const buf = await res.arrayBuffer(); const zip = await JSZip.loadAsync(buf);
  const [stopsTxt,routesTxt,tripsTxt,stopTimesTxt,calTxt,calDatesTxt] = await Promise.all([
    readZipText(zip,'stops.txt'), readZipText(zip,'routes.txt'), readZipText(zip,'trips.txt'), readZipText(zip,'stop_times.txt'), readZipText(zip,'calendar.txt'), readZipText(zip,'calendar_dates.txt')
  ]);
  const stops = parseCsv(stopsTxt); const routes = parseCsv(routesTxt); const trips = parseCsv(tripsTxt); const stopTimes = parseCsv(stopTimesTxt);
  const cal = calTxt? parseCsv(calTxt): []; const calDates = calDatesTxt? parseCsv(calDatesTxt): [];
  const active = activeServiceIdsToday(cal, calDates);
  const trainRouteIds = new Set(routes.filter(r=>Number(r.route_type)===2).map(r=>String(r.route_id)));

  const nameLc = stopNameQuery.trim().toLowerCase();
  const matchingStops = stops.filter(s => String(s.stop_name||'').toLowerCase()===nameLc);
  if(matchingStops.length===0){
    console.log(JSON.stringify({error:`No stop exactly named ${stopNameQuery}`}, null, 2));
    return;
  }
  // Include children with parent_station relation
  const stopIdSet = new Set(matchingStops.map(s=>String(s.stop_id)));
  for(const s of stops){ const parent = String(s.parent_station||'').trim(); if(parent && stopIdSet.has(parent)) stopIdSet.add(String(s.stop_id)); }

  const byTrip = new Map();
  for(const st of stopTimes){ const sid=String(st.stop_id); if(!stopIdSet.has(sid)) continue; const tid=String(st.trip_id||'').trim(); if(!tid) continue; if(!byTrip.has(tid)) byTrip.set(tid, []); byTrip.get(tid).push(st); }
  for(const arr of byTrip.values()) arr.sort((a,b)=>Number(a.stop_sequence)-Number(b.stop_sequence));

  const now = tzNow();
  const items = [];
  for(const t of trips){ const tid=String(t.trip_id); if(!byTrip.has(tid)) continue; if(!trainRouteIds.has(String(t.route_id))) continue; if(!active.has(String(t.service_id))) continue; const first = byTrip.get(tid)[0]; const dep = (first.departure_time||first.arrival_time||'').trim(); if(!dep) continue; const depDt = stopTimeToDateTimeToday(dep); if(depDt < now) continue; items.push({
    trip_id: tid,
    route_id: String(t.route_id),
    headsign: (t.trip_headsign||'').trim(),
    departure: depDt
  }); }

  items.sort((a,b)=>a.departure.toMillis()-b.departure.toMillis());
  const routeById = new Map(routes.map(r=>[String(r.route_id), r]));
  const out = items.slice(0,15).map(x=>({
    departureLocal: x.departure.toFormat('EEE, MMM d h:mm a').toUpperCase(),
    line: (routeById.get(x.route_id)?.route_long_name || routeById.get(x.route_id)?.route_short_name || 'GO')+'' ,
    headsign: x.headsign,
    trip_id: x.trip_id
  }));
  console.log(JSON.stringify({stop: stopNameQuery, date: todayYmd(), count: out.length, items: out}, null, 2));
}

const stopName = process.argv.slice(2).join(' ') || 'Kitchener GO';
main(stopName).catch(e=>{ console.error(e); process.exit(1); });
