import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Animated, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setOnboardingComplete } from '../services/onboardingService';
import { registerForPushNotifications } from '../services/notificationService';

const GO_GREEN = '#00853F';
const BG_LIGHT = '#f6fcf8';
const TEXT_DARK = '#1e1e1e';
const TEXT_MUTED = '#666';

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(false);

  // useRef keeps Animated.Value stable across re-renders
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const footerFade = useRef(new Animated.Value(0)).current;

  const feature1Fade = useRef(new Animated.Value(0)).current;
  const feature1Slide = useRef(new Animated.Value(20)).current;
  const feature2Fade = useRef(new Animated.Value(0)).current;
  const feature2Slide = useRef(new Animated.Value(20)).current;
  const feature3Fade = useRef(new Animated.Value(0)).current;
  const feature3Slide = useRef(new Animated.Value(20)).current;
  const feature4Fade = useRef(new Animated.Value(0)).current;
  const feature4Slide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Scroll content slides up and fades in
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();

    // Footer fades in only — no translateY so it never overlaps scroll content
    Animated.timing(footerFade, { toValue: 1, duration: 500, delay: 200, useNativeDriver: true }).start();

    // Stagger feature rows
    Animated.stagger(250, [
      Animated.parallel([
        Animated.timing(feature1Fade, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(feature1Slide, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(feature2Fade, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(feature2Slide, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(feature3Fade, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(feature3Slide, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(feature4Fade, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(feature4Slide, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const handleContinue = async () => {
    setIsLoading(true);
    try {
      await setOnboardingComplete();
      router.replace('/(tabs)');
    } catch (e) {
      console.log('[TrackTransit] onboarding continue failed:', e?.message);
      setIsLoading(false);
    }
  };

  const handleEnableNotifications = async () => {
    setIsEnablingNotifications(true);
    try {
      const result = await registerForPushNotifications();
      if (result?.granted) {
        setNotificationsGranted(true);
      } else {
        Alert.alert(
          'Notifications not enabled',
          'Permission was not granted. You can enable notifications later in Settings.',
        );
      }
    } catch (e) {
      Alert.alert(
        'Could not enable notifications',
        'Something went wrong. Please try again.',
      );
    } finally {
      setIsEnablingNotifications(false);
    }
  };

  const busy = isLoading || isEnablingNotifications;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Scrollable content */}
      <Animated.View
        style={[styles.scrollContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollInner}>
          <View style={styles.appNameWrap}>
            <Text style={styles.appName}>TrackTransit</Text>
          </View>

          <View style={styles.iconContainer}>
            <View style={styles.iconBadge}>
              <MaterialIcons name="directions-transit" size={52} color={GO_GREEN} />
            </View>
          </View>

          <Text style={styles.title}>Your Transit Companion</Text>
          <Text style={styles.subtitle}>Real-time departures, live tracking, and smart planning for GO Transit</Text>

          <View style={styles.featureList}>
            <FeatureItem icon="map" text="Discover nearby stops and stations" fadeAnim={feature1Fade} slideAnim={feature1Slide} />
            <FeatureItem icon="schedule" text="Check live departure times for buses and trains" fadeAnim={feature2Fade} slideAnim={feature2Slide} />
            <FeatureItem icon="my-location" text="Find the fastest route with your current location" fadeAnim={feature3Fade} slideAnim={feature3Slide} />
            <FeatureItem icon="bookmark" text="Save favourite trips for quick access" fadeAnim={feature4Fade} slideAnim={feature4Slide} />
          </View>
        </ScrollView>
      </Animated.View>

      {/* Fixed footer — fades in without translateY so it never overlaps scroll content */}
      <Animated.View
        style={[styles.footer, { opacity: footerFade, paddingBottom: Math.max(insets.bottom, 20) }]}
      >
        {!notificationsGranted ? (
          <Pressable
            style={[styles.button, styles.notificationsButton, busy && styles.buttonDisabled]}
            onPress={handleEnableNotifications}
            disabled={busy}
          >
            <MaterialIcons
              name={isEnablingNotifications ? 'hourglass-empty' : 'notifications-none'}
              size={20}
              color={GO_GREEN}
              style={styles.buttonIcon}
            />
            <Text style={styles.notificationsButtonText}>
              {isEnablingNotifications ? 'Enabling…' : 'Enable Notifications'}
            </Text>
          </Pressable>
        ) : (
          <View style={[styles.button, styles.notificationsGranted]}>
            <MaterialIcons name="check-circle" size={20} color={GO_GREEN} style={styles.buttonIcon} />
            <Text style={styles.notificationsGrantedText}>Notifications enabled</Text>
          </View>
        )}

        <Pressable
          style={[styles.button, styles.continueButton, busy && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={busy}
        >
          <Text style={styles.continueButtonText}>{isLoading ? 'Loading…' : 'Get Started'}</Text>
          {!isLoading && (
            <MaterialIcons name="arrow-forward" size={20} color="#fff" style={styles.buttonIconRight} />
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function FeatureItem({ icon, text, fadeAnim, slideAnim }) {
  return (
    <Animated.View style={[styles.featureItem, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.featureIconBox}>
        <MaterialIcons name={icon} size={22} color={GO_GREEN} />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_LIGHT,
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  appNameWrap: {
    alignItems: 'center',
    marginBottom: 28,
  },
  appName: {
    fontSize: 40,
    fontWeight: '900',
    color: GO_GREEN,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconBadge: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: '#e8f7ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: TEXT_DARK,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 36,
  },
  featureList: {
    marginBottom: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  featureIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#eef8f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
  },
  featureText: {
    fontSize: 15,
    color: TEXT_DARK,
    lineHeight: 21,
    flex: 1,
  },
  footer: {
    backgroundColor: BG_LIGHT,
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d8ede2',
    gap: 10,
  },
  button: {
    flexDirection: 'row',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonIconRight: {
    marginLeft: 8,
  },
  notificationsButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: GO_GREEN,
  },
  notificationsButtonText: {
    color: GO_GREEN,
    fontSize: 16,
    fontWeight: '700',
  },
  notificationsGranted: {
    backgroundColor: '#eef8f2',
    borderWidth: 1.5,
    borderColor: '#b2dfca',
  },
  notificationsGrantedText: {
    color: GO_GREEN,
    fontSize: 16,
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: GO_GREEN,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});

