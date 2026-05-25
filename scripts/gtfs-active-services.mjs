import { DateTime } from 'luxon';

const TORONTO = 'America/Toronto';

/**
 * @param {string} ymd YYYYMMDD
 * @param {object[]} calendarRows
 * @param {object[]} calendarDatesRows
 * @returns {Set<string>}
 */
export function activeServiceIdsForDate(ymd, calendarRows, calendarDatesRows) {
  if (!calendarRows.length) {
    const active = new Set();
    for (const row of calendarDatesRows) {
      if (String(row.date) === ymd && String(row.exception_type) === '1') {
        active.add(String(row.service_id));
      }
    }
    return active;
  }

  const dt = DateTime.fromFormat(ymd, 'yyyyMMdd', { zone: TORONTO });
  const weekdayMap = {
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
    7: 'sunday',
  };
  const weekdayCol = weekdayMap[dt.weekday];

  const exceptions = new Map();
  for (const row of calendarDatesRows) {
    if (String(row.date) === ymd) {
      exceptions.set(String(row.service_id), String(row.exception_type));
    }
  }

  const active = new Set();
  for (const row of calendarRows) {
    const sid = String(row.service_id);
    if (exceptions.get(sid) === '2') continue;
    if (ymd < String(row.start_date) || ymd > String(row.end_date)) continue;
    const flag = row[weekdayCol];
    if (flag !== '1' && flag !== 1) continue;
    active.add(sid);
  }

  for (const [sid, type] of exceptions) {
    if (type === '1') active.add(sid);
  }

  return active;
}

/**
 * @param {string} startYmd inclusive
 * @param {number} dayCount
 * @param {object[]} calendarRows
 * @param {object[]} calendarDatesRows
 */
export function unionActiveServiceIdsForDays(startYmd, dayCount, calendarRows, calendarDatesRows) {
  const active = new Set();
  let dt = DateTime.fromFormat(startYmd, 'yyyyMMdd', { zone: TORONTO });
  for (let i = 0; i < dayCount; i += 1) {
    const ymd = dt.toFormat('yyyyMMdd');
    for (const sid of activeServiceIdsForDate(ymd, calendarRows, calendarDatesRows)) {
      active.add(sid);
    }
    dt = dt.plus({ days: 1 });
  }
  return active;
}

export function torontoTodayYmd(now = new Date()) {
  return DateTime.fromJSDate(now, { zone: TORONTO }).toFormat('yyyyMMdd');
}

export function addDaysYmd(ymd, days) {
  return DateTime.fromFormat(ymd, 'yyyyMMdd', { zone: TORONTO }).plus({ days }).toFormat('yyyyMMdd');
}

export function filterTripsAndStopTimes(trips, stopTimes, activeServiceIds) {
  const filteredTrips = trips.filter((t) => activeServiceIds.has(String(t.service_id)));
  const tripIds = new Set(filteredTrips.map((t) => String(t.trip_id)));
  const filteredStopTimes = stopTimes.filter((st) => tripIds.has(String(st.trip_id)));
  return { trips: filteredTrips, stopTimes: filteredStopTimes };
}
