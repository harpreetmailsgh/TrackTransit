import { DateTime } from 'luxon';
import { StyleSheet, Text, View } from 'react-native';

const GO_GREEN = '#00853F';
const STATUS_ON_TIME = '#00853F';
const STATUS_DELAYED = '#D22F27';
const STATUS_UNKNOWN = '#6B7280';
const BUS_ROUTE_TYPE = 3;

export default function DepartureListRow({ item, style }) {
  const unknown = item.delayMinutes == null;
  const delayed = item.delayMinutes != null && item.delayMinutes > 0;
  const isBus = Number(item.route_type) === BUS_ROUTE_TYPE;
  const badgeLabel = isBus ? 'B' : 'T';

  const now = DateTime.now().setZone('America/Toronto');
  const sourceDt = item.liveDateTime || item.scheduledDateTime;
  const liveDt = sourceDt ? DateTime.fromISO(sourceDt).setZone('America/Toronto') : null;
  const minutesAway = liveDt && liveDt.isValid
    ? Math.max(0, Math.ceil(liveDt.diff(now, 'minutes').minutes))
    : 0;

  const lineTitle = item.lineName || 'GO Line';

  let stopsFromHere = 0;
  if (Array.isArray(item.stops) && item.stops.length > 0 && item.stop_sequence != null) {
    const currentIdx = item.stops.findIndex((s) => s.stop_sequence == item.stop_sequence);
    if (currentIdx !== -1) {
      stopsFromHere = item.stops.length - currentIdx;
    }
  }

  const servicePattern = stopsFromHere > 0 ? `${stopsFromHere} stop${stopsFromHere !== 1 ? 's' : ''}` : 'All Stops';
  const startStop = item.startStopName || '—';
  const endStop = item.endStopName || item.headsign || '—';

  return (
    <View style={[styles.depRow, style]}>
      <View style={styles.depHeader}>
        <View style={[styles.depBadge, isBus ? styles.depBadgeBus : styles.depBadgeTrain]}>
          <Text style={styles.depBadgeText}>{badgeLabel}</Text>
        </View>
        <Text style={styles.depRoute} numberOfLines={1}>
          {`${lineTitle} (${servicePattern})`}
        </Text>
      </View>

      <Text style={styles.depDest} numberOfLines={2}>
        {`${startStop} → ${endStop}`}
      </Text>

      <Text style={styles.depMeta} numberOfLines={2}>
        <Text style={styles.depTime}>{item.scheduledTimeLabel || item.liveTimeLabel || '--:--'}</Text>
        {`  (In ${minutesAway} min)  `}
        <Text style={unknown ? styles.depStatusUnknown : delayed ? styles.depStatusDelayed : styles.depStatusOnTime}>
          {unknown ? 'Live unavailable' : delayed ? `+${item.delayMinutes} min late` : 'On-Time'}
        </Text>
        {item.platformCode && `  • Platform ${item.platformCode}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  depRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 12,
  },
  depHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  depBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depBadgeTrain: {
    backgroundColor: GO_GREEN,
  },
  depBadgeBus: {
    backgroundColor: STATUS_DELAYED,
  },
  depBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  depRoute: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1E1E1E',
  },
  depDest: {
    fontSize: 15,
    color: '#343434',
    marginTop: 4,
  },
  depMeta: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#444',
  },
  depTime: {
    fontWeight: 'bold',
  },
  depStatusOnTime: {
    color: STATUS_ON_TIME,
    fontWeight: '700',
  },
  depStatusDelayed: {
    color: STATUS_DELAYED,
    fontWeight: '700',
  },
  depStatusUnknown: {
    color: STATUS_UNKNOWN,
    fontWeight: '700',
  },
});
