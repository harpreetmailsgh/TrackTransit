import { Platform } from 'react-native';
import SleekHeaderBar from '../../components/SleekHeaderBar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import TripResultCard from '../../components/TripResultCard';
import { useFocusEffect, useRouter } from 'expo-router';
import { DateTime } from 'luxon';

import {
  clearSavedTrips,
  getSavedTrips,
} from '../../services/savedTripsService';

import {
  ensureSchedulesForDate,
  getDeparturesForDate,
  getDeparturesForStop,
  getTripsFromTo,
  getTripsFromToForDate,
} from '../../services/gtfsService';
import { getDelayForStop } from '../../services/gtfsRealtimeService';
import { useGtfsData } from '../../contexts/GtfsDataContext';

const GO_GREEN = '#00853F';
const STATUS_DELAYED = '#D22F27';
const SLOT_LOOKAHEAD_DAYS = 14;

function parseClockLabelToMinutes(label) {
  const raw = String(label || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;

  const hour12 = Number(m[1]);
  const minute = Number(m[2]);
  const meridiem = String(m[3]).toUpperCase();
  if (!Number.isFinite(hour12) || !Number.isFinite(minute)) return null;

  let hour24 = hour12 % 12;
  if (meridiem === 'PM') hour24 += 12;
  return hour24 * 60 + minute;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function pickMatchingSavedSlot(item, rows) {
  const wantedDeparture = String(item?.departureTime || '').trim();
  const wantedPattern = normalizeText(item?.servicePattern);
  const wantedLine = normalizeText(item?.lineName);

  const filtered = rows.filter((row) => {
    if (wantedDeparture && String(row?.scheduledTimeLabel || '').trim() !== wantedDeparture) return false;
    if (wantedPattern && normalizeText(row?.servicePattern) !== wantedPattern) return false;
    if (wantedLine && normalizeText(row?.lineName || row?.route_long_name || row?.route_short_name) !== wantedLine) {
      return false;
    }
    return true;
  });

  if (!filtered.length) return null;
  return filtered[0];
}

export default function SavedScreen() {
  const router = useRouter();
  const { ready } = useGtfsData();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savedSchedulesEpoch, setSavedSchedulesEpoch] = useState(0);

  useEffect(() => {
    if (!ready || !items.length) return undefined;
    let cancelled = false;
    const modes = { train: true, bus: true };
    const now = DateTime.now().setZone('America/Toronto');

    (async () => {
      const seen = new Set();
      for (const item of items) {
        const targetDate = String(item?.serviceDate || '').trim();
        const anchor = targetDate
          ? DateTime.fromISO(targetDate).setZone('America/Toronto')
          : now;
        const startDate = anchor < now.startOf('day') ? now.startOf('day') : anchor.startOf('day');
        for (let dayOffset = 0; dayOffset <= SLOT_LOOKAHEAD_DAYS; dayOffset += 1) {
          const ymd = startDate.plus({ days: dayOffset }).toFormat('yyyyMMdd');
          if (seen.has(ymd)) continue;
          seen.add(ymd);
          await ensureSchedulesForDate(ymd, { modes });
        }
      }
      if (!cancelled) setSavedSchedulesEpoch((n) => n + 1);
    })().catch(() => {
      if (!cancelled) setSavedSchedulesEpoch((n) => n + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [ready, items]);

  const loadSaved = useCallback(async () => {
    try {
      const data = await getSavedTrips();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSaved();
    }, [loadSaved]),
  );

  const handleClearAll = useCallback(() => {
    Alert.alert('Clear saved trips?', 'This will remove all saved trips.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          const next = await clearSavedTrips();
          setItems(next);
        },
      },
    ]);
  }, []);

  const getNextTripForTemplate = useCallback((item) => {
    if (!ready || !item?.fromStopId) return null;

    const preferredMode = String(item.preferredMode || '').toLowerCase();
    const modeFilter = preferredMode === 'bus' || preferredMode === 'train' ? preferredMode : null;
    const now = DateTime.now().setZone('America/Toronto');
    const enrichWithLive = (st) => {
      const departDelaySec = (() => {
        const sec = getDelayForStop(st.trip_id, item.fromStopId);
        return sec !== undefined ? Number(sec) : null;
      })();
      const arriveDelaySec = item.toStopId
        ? (() => {
            const sec = getDelayForStop(st.trip_id, item.toStopId);
            return sec !== undefined ? Number(sec) : departDelaySec;
          })()
        : departDelaySec;
      const delayMin = departDelaySec != null ? Math.round(departDelaySec / 60) : null;
      const liveDepartDt = DateTime.fromISO(st.scheduledDateTime).plus({ seconds: departDelaySec ?? 0 });
      const liveArriveDt = st.arrivalDateTime
        ? DateTime.fromISO(st.arrivalDateTime).plus({ seconds: arriveDelaySec ?? 0 })
        : null;

      return {
        ...st,
        delayMinutes: delayMin,
        liveDateTime: liveDepartDt.toISO(),
        liveTimeLabel: liveDepartDt.toFormat('h:mm a').toUpperCase(),
        liveArrivalTimeLabel: liveArriveDt
          ? liveArriveDt.toFormat('h:mm a').toUpperCase()
          : st.arrivalTimeAtTo,
      };
    };

    const targetDate = String(item?.serviceDate || '').trim();
    const wantedMinutes = parseClockLabelToMinutes(item?.departureTime);
    if (targetDate && wantedMinutes != null) {
      const anchorDate = DateTime.fromISO(targetDate).setZone('America/Toronto');
      if (anchorDate.isValid) {
        const startDate = anchorDate < now.startOf('day') ? now.startOf('day') : anchorDate.startOf('day');
        for (let dayOffset = 0; dayOffset <= SLOT_LOOKAHEAD_DAYS; dayOffset += 1) {
          const probeDate = startDate.plus({ days: dayOffset });
          const ymd = probeDate.toFormat('yyyyMMdd');
          const rows = item.toStopId
            ? getTripsFromToForDate(item.fromStopId, item.toStopId, ymd, 200, { mode: modeFilter })
            : getDeparturesForDate(item.fromStopId, ymd, 200, {
                mode: modeFilter,
                allowRouteTimeCollapse: false,
              });

          const matched = pickMatchingSavedSlot(item, rows);
          if (!matched) continue;

          const enriched = enrichWithLive(matched);
          const effectiveDt = DateTime.fromISO(enriched.liveDateTime || enriched.scheduledDateTime);
          if (probeDate.hasSame(now, 'day') && effectiveDt.isValid && effectiveDt < now) {
            continue;
          }
          return enriched;
        }
      }

      return null;
    }

    const staticFrom = getDeparturesForStop(item.fromStopId, 50, {
      mode: modeFilter,
      allowRouteTimeCollapse: false,
    });

    if (item.toStopId) {
      const staticTrips = getTripsFromTo(item.fromStopId, item.toStopId, 50, {
        mode: modeFilter,
      });
      if (!staticTrips.length) return null;

      const filtered = staticTrips.map(enrichWithLive).filter((x) => {
        const delaySec = x.delayMinutes != null ? Number(x.delayMinutes) * 60 : 0;
        return DateTime.fromISO(x.scheduledDateTime).plus({ seconds: delaySec }) >= now;
      });
      return filtered[0] || null;
    }

    const enrichedFromOnly = staticFrom.map((dep) => {
      const sec = getDelayForStop(dep.trip_id, item.fromStopId);
      const delaySec = sec !== undefined ? Number(sec) : null;
      const liveDepartDt = DateTime.fromISO(dep.scheduledDateTime).plus({ seconds: delaySec ?? 0 });
      return {
        ...dep,
        delayMinutes: delaySec != null ? Math.round(delaySec / 60) : null,
        liveDateTime: liveDepartDt.toISO(),
        liveTimeLabel: liveDepartDt.toFormat('h:mm a').toUpperCase(),
      };
    }).filter((x) => DateTime.fromISO(x.liveDateTime) >= now);

    return enrichedFromOnly[0] || null;
  }, [ready]);

  const previewMap = useMemo(() => {
    const map = new Map();
    if (!ready) return map;
    for (const item of items) {
      map.set(item.key, getNextTripForTemplate(item));
    }
    return map;
  }, [getNextTripForTemplate, items, ready, savedSchedulesEpoch]);

  const openTrip = useCallback(
    (item) => {
      const next = previewMap.get(item.key);
      if (!next) {
        Alert.alert('No trips right now', 'No upcoming trips found for this saved route at the moment.');
        return;
      }

      const toName = item.toStopName || next.endStopName || next.headsign || '';
      router.push({
        pathname: '/trip-detail',
        params: {
          tripId: next.trip_id,
          fromStopId: item.fromStopId,
          toStopId: item.toStopId || '',
          fromStopName: item.fromStopName || '',
          toStopName: toName,
          lineName: next.lineName || item.lineName || '',
          servicePattern: next.servicePattern || item.servicePattern || '',
          durationMinutes: next.durationMinutes != null ? String(next.durationMinutes) : '',
          stopsCount: next.stopsCount != null ? String(next.stopsCount) : '',
          departureTime: next.scheduledTimeLabel || '',
          scheduledDateTime: next.scheduledDateTime || '',
          arrivalTime: next.arrivalTimeAtTo || '',
          delayMinutes: next.delayMinutes != null ? String(next.delayMinutes) : '',
          isBus: Number(next.route_type) === 3 ? 'true' : 'false',
          platformCode: next.platformCode ?? '',
        },
      });
    },
    [previewMap, router],
  );

  const renderItem = useCallback(
    ({ item }) => {
      const next = previewMap.get(item.key);
      if (!next) {
        return (
          <View style={styles.card}>
            <Text style={styles.noTripsText}>No upcoming trips right now</Text>
          </View>
        );
      }
      return (
        <TripResultCard
          item={next}
          fromStop={{ stop_name: item.fromStopName || '—' }}
          toStop={item.toStopId ? { stop_name: item.toStopName } : undefined}
          showPlatform={false}
          onPress={() => openTrip(item)}
          style={{ marginHorizontal: 8, marginVertical: 8 }}
        />
      );
    },
    [openTrip, previewMap],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <SleekHeaderBar title="Saved" icon="bookmark" description="Your saved trips" />

      <View style={{ marginTop: (Platform.OS === 'ios' ? 101 : 56) + 12, flex: 1 }}>
        {items.length > 0 ? (
          <View style={styles.clearAllRow}>
            <TouchableOpacity onPress={handleClearAll}>
              <Text style={styles.clearAllText}>Clear All</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading || !ready ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={GO_GREEN} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.centerBox}>
            <MaterialIcons name="bookmark-border" size={42} color="#c0c0c0" />
            <Text style={styles.emptyText}>No saved trips yet</Text>
            <Text style={styles.emptySubText}>Open a trip and tap Save to keep it here.</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.key)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
    paddingHorizontal: 14,
  },
  clearAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  clearAllText: {
    color: STATUS_DELAYED,
    fontSize: 14,
    fontWeight: '600',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  emptySubText: {
    marginTop: 6,
    fontSize: 14,
    color: '#9a9a9a',
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    marginHorizontal: 0,
    marginVertical: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
  noTripsText: {
    fontSize: 12,
    color: '#9a9a9a',
    fontWeight: '600',
  },
});
