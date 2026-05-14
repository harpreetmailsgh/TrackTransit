import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet, Easing, Pressable, Share } from 'react-native';
import Svg, { Ellipse, Circle } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';

const GO_GREEN = '#00853F';

function derivePipelinePhase(message) {
  const text = String(message || '').toLowerCase();
  if (text.includes('loading cached go transit data')) return 'cache load';
  if (text.includes('preparing go transit data')) return 'prepare download';
  if (text.includes('downloading go transit data')) return 'download archive';
  if (text.includes('native unzip') || text.includes('unzip')) return 'native unzip';
  if (text.includes('reading stops & routes')) return 'read required files';
  if (text.includes('parsing schedules')) return 'parse stop_times';
  if (text.includes('persisting cache')) return 'cache persistence';
  if (text.includes('finalizing schedules')) return 'finalize startup';
  return 'startup';
}

function formatElapsed(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function StartupLoadingScreen({
  errorMessage = '',
  progressPercent = 0,
  progressMessage = 'Loading GO Transit data...',
  stalled = false,
  detailText = '',
  etaText = '',
  checklist = [],
  loadAttempt = 1,
  loadElapsedSeconds = 0,
  secondsSinceLastUpdate = 0,
  startupTrace = [],
  stopsReady = false,
  schedulesReady = false,
  stopsSource = 'none',
  servicePhase = 'idle',
  servicePhaseDetail = '',
  debugLogCaptured = false,
  debugLogPath = '',
  onRetry,
}) {
  const pinY = useRef(new Animated.Value(0)).current;
  const [clipboardState, setClipboardState] = useState('');
  const progress = Math.max(0, Math.min(1, Number(progressPercent) || 0));
  const pipelinePhase = useMemo(
    () => servicePhaseDetail || derivePipelinePhase(progressMessage),
    [progressMessage, servicePhaseDetail],
  );

  const diagnosticsText = useMemo(() => {
    const traceText = startupTrace.length
      ? startupTrace.join('\n')
      : '(no recent trace lines)';
    return [
      'TrackTransit startup diagnostics',
      `attempt=${loadAttempt}`,
      `progress=${Math.round(progress * 100)}%`,
      `elapsed=${loadElapsedSeconds}s`,
      `since_last_update=${secondsSinceLastUpdate}s`,
      `stops_ready=${stopsReady ? 'yes' : 'no'}`,
      `schedules_ready=${schedulesReady ? 'yes' : 'no'}`,
      `stops_source=${stopsSource}`,
      `service_phase=${servicePhase}`,
      `phase=${pipelinePhase}`,
      `stage=${progressMessage || 'Loading...'}`,
      `stalled=${stalled ? 'yes' : 'no'}`,
      debugLogPath ? `debug_log=${debugLogPath}` : null,
      '',
      'trace:',
      traceText,
      errorMessage ? ['error:', String(errorMessage)] : null,
    ]
      .flat()
      .filter(Boolean)
      .join('\n');
  }, [
    debugLogPath,
    errorMessage,
    loadAttempt,
    loadElapsedSeconds,
    progress,
    progressMessage,
    pipelinePhase,
    schedulesReady,
    servicePhase,
    secondsSinceLastUpdate,
    stopsReady,
    stopsSource,
    stalled,
    startupTrace,
  ]);

  const handleCopyDiagnostics = useMemo(
    () => async () => {
      try {
        await Clipboard.setStringAsync(diagnosticsText);
        setClipboardState('Copied diagnostics to clipboard.');
      } catch {
        setClipboardState('Copy failed.');
      }
    },
    [diagnosticsText],
  );

  const handleShareDiagnostics = useMemo(
    () => async () => {
      try {
        await Share.share({ message: diagnosticsText });
        setClipboardState('Share sheet opened.');
      } catch {
        setClipboardState('Share failed.');
      }
    },
    [diagnosticsText],
  );

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pinY, {
          toValue: -18,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pinY, {
          toValue: 0,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
    return undefined;
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ translateY: pinY }] }}>
        <Svg width={90} height={110} viewBox="0 0 90 110">
          {/* Pin shadow */}
          <Ellipse cx="45" cy="100" rx="18" ry="7" fill="#000" opacity="0.18" />
          {/* Pin body */}
          <Ellipse cx="45" cy="54" rx="24" ry="32" fill="#fff" />
          {/* Pin head */}
          <Circle cx="45" cy="44" r="14" fill={GO_GREEN} />
          {/* Pin border */}
          <Ellipse cx="45" cy="54" rx="24" ry="32" fill="none" stroke="#006837" strokeWidth="3" />
        </Svg>
      </Animated.View>
      <Text style={styles.title}>TrackTransit</Text>
      <Text style={styles.elapsedText}>Elapsed {formatElapsed(loadElapsedSeconds)}</Text>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBar, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <Text style={styles.loadingText}>{progressMessage || 'Loading...'}</Text>
      {detailText ? <Text style={styles.detailText}>{detailText}</Text> : null}
      {etaText ? <Text style={styles.etaText}>{etaText}</Text> : null}
      {checklist.length ? (
        <View style={styles.checklistCard}>
          {checklist.map((item) => (
            <View key={item.key} style={styles.checklistRow}>
              <Text style={styles.checklistIcon}>
                {item.status === 'done' ? '✓' : item.status === 'current' ? '•' : '○'}
              </Text>
              <Text
                style={[
                  styles.checklistText,
                  item.status === 'done' ? styles.checklistDone : null,
                  item.status === 'current' ? styles.checklistCurrent : null,
                ]}
              >
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.diagnosticsCard}>
        <Text style={styles.diagnosticsTitle}>Startup Diagnostics</Text>
        <Text style={styles.diagnosticsLine}>Attempt: {loadAttempt}</Text>
        <Text style={styles.diagnosticsLine}>Progress: {Math.round(progress * 100)}%</Text>
        <Text style={styles.diagnosticsLine}>Elapsed: {loadElapsedSeconds}s</Text>
        <Text style={styles.diagnosticsLine}>Since last update: {secondsSinceLastUpdate}s</Text>
        <Text style={styles.diagnosticsLine}>Stops ready: {stopsReady ? 'yes' : 'no'}</Text>
        <Text style={styles.diagnosticsLine}>Schedules ready: {schedulesReady ? 'yes' : 'no'}</Text>
        <Text style={styles.diagnosticsLine}>Stops source: {stopsSource}</Text>
        <Text style={styles.diagnosticsLine}>Pipeline phase: {pipelinePhase}</Text>
        <Text style={styles.diagnosticsLine}>Service phase: {servicePhase}</Text>
        <Text numberOfLines={2} style={styles.diagnosticsLine}>Current stage: {progressMessage || 'Loading...'}</Text>
        {startupTrace.length ? (
          <View style={styles.traceBox}>
            {startupTrace.map((line) => (
              <Text key={line} numberOfLines={1} style={styles.traceLine}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={styles.diagnosticsActions}>
          <Pressable onPress={handleCopyDiagnostics} style={styles.diagnosticsBtn}>
            <Text style={styles.diagnosticsBtnText}>Copy</Text>
          </Pressable>
          <Pressable onPress={handleShareDiagnostics} style={styles.diagnosticsBtnSecondary}>
            <Text style={styles.diagnosticsBtnSecondaryText}>Share</Text>
          </Pressable>
        </View>
        {clipboardState ? <Text style={styles.diagnosticsStatus}>{clipboardState}</Text> : null}
      </View>
      {stalled ? (
        <Text style={styles.helperText}>
          Still working. First-time transit data setup can take several minutes on slower networks.
        </Text>
      ) : null}
      {debugLogCaptured ? (
        <Text style={styles.debugText}>
          Debug snapshot captured{debugLogPath ? `: ${debugLogPath}` : '.'}
        </Text>
      ) : null}
      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Transit data setup failed</Text>
          <Text numberOfLines={4} style={styles.errorMessage}>
            {String(errorMessage).split('\n')[0]}
          </Text>
          <View style={styles.errorActions}>
            <Pressable onPress={onRetry} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Retry</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GO_GREEN,
    width: '100%',
    height: '100%',
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 24,
    marginBottom: 8,
    letterSpacing: 1.2,
  },
  elapsedText: {
    color: '#fff',
    fontSize: 13,
    opacity: 0.92,
    marginBottom: 8,
    fontVariant: ['tabular-nums'],
  },
  progressBarBg: {
    width: 120,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    marginTop: 12,
    marginBottom: 8,
  },
  progressBar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    opacity: 0.9,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 280,
  },
  detailText: {
    color: '#fff',
    fontSize: 13,
    opacity: 0.78,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 300,
  },
  etaText: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.82,
    marginTop: 6,
    textAlign: 'center',
  },
  helperText: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.7,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 300,
  },
  checklistCard: {
    marginTop: 12,
    width: '84%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  checklistIcon: {
    width: 18,
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  checklistText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
  },
  checklistDone: {
    color: 'rgba(255,255,255,0.86)',
  },
  checklistCurrent: {
    color: '#fff',
    fontWeight: '700',
  },
  diagnosticsCard: {
    marginTop: 10,
    width: '88%',
    backgroundColor: 'rgba(0,0,0,0.16)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  diagnosticsTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  diagnosticsLine: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    marginTop: 1,
  },
  traceBox: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingTop: 5,
  },
  traceLine: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
  },
  diagnosticsActions: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  diagnosticsBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  diagnosticsBtnText: {
    color: GO_GREEN,
    fontWeight: '700',
    fontSize: 11,
  },
  diagnosticsBtnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  diagnosticsBtnSecondaryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 11,
  },
  diagnosticsStatus: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    marginTop: 6,
  },
  debugText: {
    color: '#fff',
    fontSize: 11,
    opacity: 0.85,
    marginTop: 10,
    textAlign: 'center',
    maxWidth: 320,
  },
  errorCard: {
    marginTop: 14,
    width: '88%',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  errorTitle: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  errorMessage: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    textAlign: 'center',
  },
  errorActions: {
    marginTop: 10,
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: GO_GREEN,
    fontWeight: '700',
  },
});
