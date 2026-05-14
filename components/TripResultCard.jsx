import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { DateTime } from 'luxon';

const GO_GREEN = '#00853F';
const STATUS_DELAYED = '#D22F27';
const STATUS_UNKNOWN = '#6B7280';

function StatusPill({ status, delayLabel, updatedTimeLabel }) {
  let label = 'On-Time';
  if (status === 'delayed') {
    // delayLabel is like '+5 min', updatedTimeLabel is like '5:47 PM'
    label = `Delay: ${delayLabel.replace('+', '')}${updatedTimeLabel ? ': ' + updatedTimeLabel : ''}`;
  } else if (status === 'unknown') {
    label = 'Live: Unavailable';
  }
  return (
    <View
      style={
        status === 'delayed'
          ? pillStyles.pillDelayed
          : status === 'unknown'
          ? pillStyles.pillUnknown
          : pillStyles.pillOnTime
      }
    >
      <Text style={pillStyles.pillText}>{label}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  pillOnTime: {
    backgroundColor: GO_GREEN,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillDelayed: {
    backgroundColor: STATUS_DELAYED,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillUnknown: {
    backgroundColor: STATUS_UNKNOWN,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default function TripResultCard({
  item,
  fromStop,
  toStop,
  onPress,
  showPlatform = false,
  style = {},
  fromPlatform,
  toPlatform,
}) {
  const isBus = Number(item.route_type) === 3;
  const accentColor = isBus ? STATUS_DELAYED : GO_GREEN;
  const accentTint = isBus ? '#fff8f5' : '#f6fcf8';
  const chipTint = isBus ? '#fff2ee' : '#eef8f2';
  const hasToInfo = item.durationMinutes != null;
  const cardDate = DateTime.fromISO(item.liveDateTime || item.scheduledDateTime)
    .setZone('America/Toronto')
    .toFormat('EEE, MMM d');
  const status = item.liveStatus || (item.delayMinutes == null ? 'unknown' : item.delayMinutes > 0 ? 'delayed' : 'on-time');
  const delayLabel = item.delayMinutes != null ? `+${item.delayMinutes} min` : '';
  const updatedTimeLabel = item.liveTimeLabel || '';
  const stopsLabel = item.stopsCount != null ? `${item.stopsCount} stop${item.stopsCount !== 1 ? 's' : ''}` : '-- stops';
  const durationLabel = item.durationMinutes != null ? `${item.durationMinutes} min` : '-- min';
  // Always show 'Platform: --' if showPlatform is true, even if platformCode is missing or blank
  // Always show 'Platform: --' if showPlatform is true, even if platformCode is missing or blank
  let platform = '--';
  if (showPlatform && typeof item.platformCode === 'string' && item.platformCode.trim() !== '') {
    platform = item.platformCode.trim();
  }
  // For trip details: allow explicit fromPlatform/toPlatform override
  const fromPlat = typeof fromPlatform === 'string' && fromPlatform.trim() !== '' ? fromPlatform.trim() : platform;
  const toPlat = typeof toPlatform === 'string' && toPlatform.trim() !== '' ? toPlatform.trim() : platform;
  const toLabel = toStop?.stop_name || item.endStopName || item.headsign || '—';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { borderColor: accentTint }, pressed && styles.cardPressed, style]}
      onPress={onPress}
    >
      <View style={[styles.cardAccentBand, { backgroundColor: accentTint }]}> 
        <View style={styles.cardHeader}>
          <View style={styles.cardRouteMeta}>
            <View style={[styles.modeBadge, { backgroundColor: accentColor }]}> 
              <MaterialCommunityIcons name={isBus ? 'bus' : 'train'} size={18} color="#fff" />
            </View>
            <View style={styles.cardRouteTextWrap}>
              <Text style={styles.routeText} numberOfLines={1}>{item.lineName || item.route_long_name || item.route_short_name || 'GO'}</Text>
              <Text style={styles.cardSubRouteText}>{isBus ? 'Bus service' : 'Train service'}</Text>
            </View>
          </View>
          <View style={styles.cardHeaderRight}>
            <Text style={styles.cardDateText}>{cardDate}</Text>
            <MaterialIcons name="chevron-right" size={20} color="#9aa0a6" />
          </View>
        </View>
      </View>

      <View style={[styles.heroRow, { alignItems: 'flex-start' }]}> 
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.heroTimeLabel}>Departs</Text>
          <Text style={styles.heroTimeValue}>{item.scheduledTimeLabel}</Text>
        </View>
        <View style={{ width: 32 }} />
        <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
          <Text style={styles.heroTimeLabel}>{hasToInfo ? 'Arrives' : 'Towards'}</Text>
          <Text style={[styles.heroTimeValue, !hasToInfo && styles.heroDestinationValue]} numberOfLines={1}>
            {/* Always show arrival time if available, even if no destination is selected */}
            {(() => {
              if (item.arrivalTimeAtTo) return item.arrivalTimeAtTo;
              // Fallback: show last stop's time if available
              if (Array.isArray(item.stops) && item.stops.length > 0 && item.stops[item.stops.length - 1].arrival_time_label) {
                return item.stops[item.stops.length - 1].arrival_time_label;
              }
              return '--';
            })()}
          </Text>
        </View>
      </View>

      <View style={[styles.journeyPathRow, { alignItems: 'flex-start' }]}> 
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.journeyPathStop} numberOfLines={2} ellipsizeMode="tail">{fromStop?.stop_name || item.fromStopName || '—'}</Text>
          {showPlatform ? (
            <Text style={styles.platformSummary}>{`Platform: ${fromPlat}`}</Text>
          ) : null}
        </View>
        <View style={{ width: 32, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialIcons name="east" size={24} color={GO_GREEN} />
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
          <Text style={styles.journeyPathStop} numberOfLines={2} ellipsizeMode="tail">{toLabel}</Text>
          {showPlatform ? (
            <Text style={styles.platformSummary}>{`Platform: ${toPlat}`}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.cardChipRow}>
        <StatusPill status={status} delayLabel={delayLabel} updatedTimeLabel={updatedTimeLabel} />
        <View style={[styles.infoChip, { backgroundColor: chipTint }]}> 
          <MaterialIcons name="timelapse" size={13} color="#4b5563" />
          <Text style={styles.infoChipText}>{durationLabel}</Text>
        </View>
        <View style={[styles.infoChip, { backgroundColor: chipTint }]}> 
          <MaterialCommunityIcons name="map-marker-path" size={13} color="#4b5563" />
          <Text style={styles.infoChipText}>{stopsLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    marginVertical: 8,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardAccentBand: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardRouteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  cardRouteTextWrap: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  routeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  cardSubRouteText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardDateText: {
    fontSize: 13,
    color: '#888',
    marginRight: 4,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroTimeBlock: {
    alignItems: 'center',
  },
  heroTimeBlockRight: {
    alignItems: 'flex-end',
  },
  heroTimeLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  heroTimeValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
  },
  heroDestinationValue: {
    fontSize: 16,
    color: '#555',
  },
  heroDividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  heroDivider: {
    width: 16,
    height: 2,
    borderRadius: 1,
    marginHorizontal: 2,
  },
  journeyPathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  journeyPathCol: {
    flex: 1,
  },
  journeyPathColRight: {
    alignItems: 'flex-end',
  },
  journeyPathStop: {
    fontSize: 18, // Match heroTimeValue size
    color: '#00853F', // Green for both
    fontWeight: '700',
  },
  journeyPathStopDestination: {
    // No override, keep green
  },
  platformInline: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  platformSummary: {
    fontSize: 14.4, // 20% smaller than 18
    color: '#111',
    marginTop: 2,
  },
  cardChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef8f2',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 6,
  },
  infoChipText: {
    fontSize: 12,
    color: '#222',
    fontWeight: '600',
    marginLeft: 4,
  },
});
