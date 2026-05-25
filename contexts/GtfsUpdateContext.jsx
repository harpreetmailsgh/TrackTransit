import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGtfsData } from './GtfsDataContext';
import {
  applyPendingGtfsUpdate,
  checkForGtfsStaticUpdate,
  clearLoadedScheduleKeys,
  getPendingGtfsUpdate,
  markGtfsUpdatePrompted,
  reloadGtfsFromCache,
  snoozePendingGtfsUpdate,
  usesHostedGtfsSqlite,
} from '../services/gtfsService';
import { getBundleMeta } from '../services/gtfsSqliteService';

const HOSTED_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const SNOOZE_MS = 30 * 60 * 1000;
const GO_GREEN = '#00853F';

const GtfsUpdateContext = createContext({
  updateState: 'idle',
  updateInfo: null,
  refreshNow: async () => {},
  snoozeFor30Minutes: async () => {},
  retryCheck: async () => {},
});

function mapProgressMessageToPercent(message, currentPercent) {
  const msg = String(message || '').toLowerCase();

  const stagedPercentages = [
    { includes: 'loading go transit data', value: 0.12 },
    { includes: 'reading stops & routes', value: 0.35 },
    { includes: 'parsing schedules', value: 0.62 },
    { includes: 'parsing route shapes', value: 0.78 },
    { includes: 'saving cache', value: 0.92 },
  ];

  for (const stage of stagedPercentages) {
    if (msg.includes(stage.includes)) {
      return Math.max(currentPercent, stage.value);
    }
  }

  return Math.min(0.96, Math.max(currentPercent, currentPercent + 0.03));
}

function formatDurationLabel(seconds) {
  const safeSeconds = Number(seconds) || 0;
  if (!safeSeconds) return 'about 1 min';
  if (safeSeconds < 60) return `about ${Math.max(10, Math.round(safeSeconds / 5) * 5)}s`;
  return `about ${Math.max(1, Math.ceil(safeSeconds / 60))} min`;
}

function buildEstimateSeconds(updateInfo) {
  if (updateInfo?.estimatedDurationSec) {
    return Math.max(15, Number(updateInfo.estimatedDurationSec));
  }

  const bytes = Number(updateInfo?.remoteFingerprint?.contentLength || 0);
  if (bytes > 0) {
    const sizeMb = bytes / 1e6;
    return Math.max(20, Math.round(sizeMb * 2.2 + 25));
  }

  return 60;
}

function UpdatePrompt({
  state,
  updateInfo,
  progressPercent,
  progressMessage,
  onRefresh,
  onSnooze,
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4,
      speed: 14,
    }).start();
  }, []);

  const estimateSeconds = buildEstimateSeconds(updateInfo);

  let title = 'New Schedules Available';
  let body = `A newer GO Transit schedule file is available. Your current schedules still work fine. Refreshing will take ${formatDurationLabel(estimateSeconds)}.`;

  if (state === 'downloading') {
    title = 'Refreshing Schedules\u2026';
    body = progressMessage || 'Downloading and rebuilding schedules on this phone.';
  } else if (state === 'completed') {
    title = 'Schedules Updated \u2713';
    body = 'The latest GO Transit schedules are now active.';
  } else if (state === 'failed') {
    title = 'Refresh Failed';
    body = progressMessage || 'Your existing schedules are still available. Try again when your connection is stable.';
  }

  return (
    <View pointerEvents="box-none" style={styles.sheetOverlay}>
      <Animated.View
        style={[
          styles.sheetCard,
          { paddingBottom: Math.max(insets.bottom, 16), transform: [{ translateY }] },
        ]}
      >
        <View style={styles.handle} />

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>

        {state === 'downloading' ? (
          <>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progressPercent * 100)}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{Math.round(progressPercent * 100)}%</Text>
          </>
        ) : null}

        <View style={styles.actions}>
          {state === 'available' || state === 'failed' ? (
            <Pressable onPress={onRefresh} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{state === 'failed' ? 'Try Again' : 'Refresh Now'}</Text>
            </Pressable>
          ) : null}

          {state === 'available' ? (
            <Pressable onPress={onSnooze} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Snooze 30 min</Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

export function useGtfsUpdate() {
  return useContext(GtfsUpdateContext);
}

export function GtfsUpdateProvider({ children }) {
  const { ready, error } = useGtfsData();
  const [updateState, setUpdateState] = useState('idle');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const hasCheckedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const silentHostedUpdates = usesHostedGtfsSqlite();

  const runRefresh = useCallback(async ({ silent = false } = {}) => {
    if (refreshInFlightRef.current) {
      return { ok: false, reason: 'refresh-in-progress' };
    }

    refreshInFlightRef.current = true;
    setUpdateState(silent ? 'silent-downloading' : 'downloading');
    setProgressMessage('Downloading updated schedules...');
    setProgressPercent(0.08);

    try {
      const result = await applyPendingGtfsUpdate({
        onProgress: (message) => {
          setProgressMessage(message);
          setProgressPercent((prev) => mapProgressMessageToPercent(message, prev));
        },
      });

      if (!result?.ok) {
        throw new Error('No pending schedule update was found.');
      }

      setProgressPercent(1);
      setProgressMessage('Applying updated schedules...');
      if (usesHostedGtfsSqlite()) {
        clearLoadedScheduleKeys();
      }
      await reloadGtfsFromCache();
      setUpdateInfo(null);

      if (silent) {
        setProgressMessage('Schedules updated in background.');
        setUpdateState('idle');
      } else {
        setProgressMessage('Schedules are now up to date.');
        setUpdateState('completed');
      }

      return { ok: true };
    } catch (e) {
      setProgressMessage(e instanceof Error ? e.message : 'Refresh failed.');
      setUpdateState('failed');
      return { ok: false, reason: 'refresh-failed' };
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  const shouldRunHostedCheck = useCallback(async () => {
    if (!usesHostedGtfsSqlite()) return true;
    const meta = await getBundleMeta();
    const last = Number(meta?.lastCheckAt || meta?.checkedAt || 0);
    if (!last) return true;
    return Date.now() - last >= HOSTED_CHECK_INTERVAL_MS;
  }, []);

  const syncUpdateState = useCallback(async (allowCheck) => {
    const pending = await getPendingGtfsUpdate();
    const now = Date.now();

    if (pending?.snoozeUntil && Number(pending.snoozeUntil) > now) {
      setUpdateInfo(pending);
      setUpdateState('snoozed');
      return;
    }

    if (pending) {
      const normalized = { ...pending, status: 'available', snoozeUntil: null };
      setUpdateInfo(normalized);

      if (silentHostedUpdates) {
        await runRefresh({ silent: true });
        return;
      }

      setUpdateState('available');
      await markGtfsUpdatePrompted(now);
      return;
    }

    if (!allowCheck) {
      setUpdateInfo(null);
      setUpdateState('idle');
      return;
    }

    if (!(await shouldRunHostedCheck())) {
      setUpdateInfo(null);
      setUpdateState('idle');
      return;
    }

    setUpdateState('checking');
    const result = await checkForGtfsStaticUpdate();
    if (result?.status === 'update-available' && result.update) {
      setUpdateInfo(result.update);

      if (silentHostedUpdates) {
        await runRefresh({ silent: true });
        return;
      }

      setUpdateState('available');
      await markGtfsUpdatePrompted(now);
      return;
    }

    setUpdateInfo(null);
    setUpdateState('idle');
  }, [runRefresh, shouldRunHostedCheck, silentHostedUpdates]);

  useEffect(() => {
    if (!ready || error) return;
    if (hasCheckedRef.current) return;

    hasCheckedRef.current = true;
    syncUpdateState(true).catch(() => {
      setUpdateState('idle');
    });
  }, [ready, error, syncUpdateState]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && ready && !error) {
        shouldRunHostedCheck()
          .then((due) => {
            if (!due) return;
            return syncUpdateState(true);
          })
          .catch(() => {
            setUpdateState((current) => (current === 'downloading' ? current : 'idle'));
          });
      }
    });

    return () => {
      sub.remove();
    };
  }, [ready, error, shouldRunHostedCheck, syncUpdateState]);

  useEffect(() => {
    if (updateState !== 'completed') return undefined;

    const timer = setTimeout(() => {
      setUpdateState('idle');
      setProgressMessage('');
      setProgressPercent(0);
    }, 4000);

    return () => clearTimeout(timer);
  }, [updateState]);

  const refreshNow = useCallback(async () => {
    await runRefresh({ silent: false });
  }, [runRefresh]);

  const snoozeFor30Minutes = useCallback(async () => {
    const snoozeUntil = Date.now() + SNOOZE_MS;
    const next = await snoozePendingGtfsUpdate(snoozeUntil);
    setUpdateInfo(next);
    setUpdateState('snoozed');
  }, []);

  const retryCheck = useCallback(async () => {
    await syncUpdateState(true);
  }, [syncUpdateState]);

  const value = useMemo(
    () => ({
      updateState,
      updateInfo,
      refreshNow,
      snoozeFor30Minutes,
      retryCheck,
    }),
    [updateInfo, updateState, refreshNow, retryCheck, snoozeFor30Minutes],
  );

  const showPrompt = updateState === 'available' || updateState === 'downloading' || updateState === 'completed' || updateState === 'failed';

  return (
    <GtfsUpdateContext.Provider value={value}>
      {children}
      {showPrompt ? (
        <UpdatePrompt
          state={updateState}
          updateInfo={updateInfo}
          progressPercent={progressPercent}
          progressMessage={progressMessage}
          onRefresh={refreshNow}
          onSnooze={snoozeFor30Minutes}
        />
      ) : null}
    </GtfsUpdateContext.Provider>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  sheetCard: {
    backgroundColor: '#072817',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: -6 },
    shadowRadius: 20,
    elevation: 14,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 14,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  body: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  progressTrack: {
    marginTop: 14,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#CFF7D8',
  },
  progressLabel: {
    marginTop: 8,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 4,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: GO_GREEN,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
