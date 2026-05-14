
import React, { useRef, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Dimensions, StyleSheet, Platform, Animated, View, Text, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HEADER_GRADIENT = ['#00994C', '#007A3D'];
const HEADER_TEXT = '#fff';
const SCREEN_WIDTH = Dimensions.get('window').width;

export default function FancyHeader({ route, options }) {
  const insets = useSafeAreaInsets();
  let title = options?.title || route.name;
  let icon = 'star';
  let subtitle = '';
  if (route.name === 'index') {
    title = 'Stops';
    icon = 'place';
    subtitle = 'Find your nearest station';
  } else if (route.name === 'search') {
    title = 'Search';
    icon = 'search';
    subtitle = 'Look up stops and routes';
  } else if (route.name === 'saved') {
    title = 'Saved';
    icon = 'bookmark';
    subtitle = 'Your favorite trips';
  }

  // Animation: slide in from right on every route change
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const iconScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    slideAnim.setValue(SCREEN_WIDTH); // Reset before animating
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
      easing: Easing.out(Easing.exp),
    }).start();
    // Icon bounce
    iconScale.setValue(1.2);
    Animated.spring(iconScale, {
      toValue: 1,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [route.key]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }} pointerEvents="box-none">
      <Animated.View style={[styles.headerBg, { transform: [{ translateX: slideAnim }] }]}> 
        <LinearGradient
          colors={HEADER_GRADIENT}
          style={{
            width: '100%',
            paddingTop: insets.top,
            paddingBottom: 8,
            paddingHorizontal: 18,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12,
            alignItems: 'center',
          }}
        >
          <View style={[styles.headerContent, { minHeight: 56 }]}> 
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <MaterialIcons name={icon} size={36} color={HEADER_TEXT} style={styles.headerIcon} />
            </Animated.View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={styles.headerTitle}>{title}</Text>
              <Text style={styles.headerSubtitle}>{subtitle}</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // safeArea removed
  headerBg: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
    alignItems: 'center',
    marginHorizontal: 0,
    backgroundColor: 'transparent',
  },
  // gradient style moved inline for dynamic insets
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 56,
  },
  headerIcon: {
    marginRight: 10,
    shadowColor: '#fff',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: HEADER_TEXT,
    letterSpacing: 1.1,
    textShadowColor: 'rgba(0,0,0,0.13)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    textAlign: 'center',
    marginBottom: 0,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.80)',
    textAlign: 'center',
    fontWeight: '500',
    marginTop: 0,
  },
  // divider removed
});
