import 'react-native-gesture-handler';

import React, { useState, useEffect, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { GtfsDataProvider } from '../contexts/GtfsDataContext';
import { GtfsUpdateProvider } from '../contexts/GtfsUpdateContext';
import OnboardingScreen from './onboarding';
import { getHasCompletedOnboarding } from '../services/onboardingService';
import { configureNotifications } from '../services/notificationService';

function RootContent() {
  const [onboardingComplete, setOnboardingComplete] = useState(null); // null = loading

  const handleOnboardingComplete = useCallback(() => {
    setOnboardingComplete(true);
  }, []);

  useEffect(() => {
    configureNotifications().catch(() => {
      // Keep app usable even if notification setup fails.
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkOnboarding = async () => {
      try {
        const completed = await getHasCompletedOnboarding();
        if (!cancelled) {
          setOnboardingComplete(completed);
        }
      } catch (e) {
        if (!cancelled) {
          // Assume onboarding is complete on error so app stays functional
          setOnboardingComplete(true);
        }
      }
    };

    checkOnboarding();

    return () => {
      cancelled = true;
    };
  }, []);

  if (onboardingComplete === null) {
    // Loading state: show empty container while checking
    return <View style={{ flex: 1, backgroundColor: '#fff' }} />;
  }

  if (!onboardingComplete) {
    // First run: show onboarding (no GTFS loading yet)
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  // Returning user: show normal app with GTFS bootstrap
  return (
    <GtfsDataProvider>
      <GtfsUpdateProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="trip-detail" options={{ headerShown: false }} />
          <Stack.Screen name="screens/departures" options={{ headerShown: false }} />
        </Stack>
      </GtfsUpdateProvider>
    </GtfsDataProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <RootContent />
        </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
