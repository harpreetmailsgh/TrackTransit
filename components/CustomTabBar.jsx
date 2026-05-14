import React, { useRef, useState } from 'react';
import { View, TouchableOpacity, Animated, StyleSheet, Platform, Text, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';

const TAB_ICONS = [
  { name: 'Stops', icon: 'place' },
  { name: 'Search', icon: 'search' },
  { name: 'Saved', icon: 'bookmark' },
];


export default function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const [tabLayouts, setTabLayouts] = useState([]);
  const pillLeftAnim = useRef(new Animated.Value(0)).current;
  const pillWidthAnim = useRef(new Animated.Value(64)).current;
  const pillHeight = 53;
  const [animatingIndex, setAnimatingIndex] = useState(state.index);
  // Animate pill when animatingIndex changes
  React.useEffect(() => {
    if (tabLayouts.length === state.routes.length && tabLayouts.every(l => l)) {
      const { x, width } = tabLayouts[animatingIndex] || { x: 18, width: 64 };
      const pillWidth = width * 0.8;
      const pillLeft = x + (width - pillWidth) / 2;
      Animated.parallel([
        Animated.timing(pillLeftAnim, {
          toValue: pillLeft,
          duration: 220,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pillWidthAnim, {
          toValue: pillWidth,
          duration: 220,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]).start(({ finished }) => {
        if (finished && animatingIndex !== state.index) {
          navigation.navigate(state.routes[animatingIndex].name);
        }
      });
    }
  }, [animatingIndex, tabLayouts]);
  // Sync animatingIndex to state.index if navigation changes (e.g. swipe)
  React.useEffect(() => {
    if (animatingIndex !== state.index) {
      setAnimatingIndex(state.index);
    }
  }, [state.index]);

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', zIndex: 100 }}>
      <BlurView intensity={60} tint="light" style={[styles.tabBar, { marginBottom: Math.max(insets.bottom, 24) }]}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', position: 'relative' }}>
          {/* Pill highlight */}
          <Animated.View
            style={[
              styles.pill,
              {
                width: pillWidthAnim,
                left: pillLeftAnim,
                height: pillHeight,
                // Center the pill vertically if needed
                top: 6,
              },
            ]}
          />
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const label =
              options.tabBarLabel !== undefined
                ? options.tabBarLabel
                : options.title !== undefined
                ? options.title
                : route.name;
            const isFocused = state.index === index;
            const iconName = TAB_ICONS[index]?.icon || 'help-outline';
            // Animation for icon bounce
            const scale = useRef(new Animated.Value(isFocused ? 1.18 : 1)).current;
            React.useEffect(() => {
              Animated.spring(scale, {
                toValue: isFocused ? 1.18 : 1,
                useNativeDriver: true,
                friction: 5,
                tension: 80,
              }).start();
            }, [isFocused]);
            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarTestID}
                onPress={() => {
                  if (!isFocused) {
                    Haptics.selectionAsync();
                    setAnimatingIndex(index);
                  }
                }}
                style={styles.tabBtn}
                activeOpacity={0.8}
                onLayout={e => {
                  const { x, width } = e.nativeEvent.layout;
                  setTabLayouts(prev => {
                    const next = [...prev];
                    next[index] = { x, width };
                    return next;
                  });
                }}
              >
                <Animated.View
                  style={[
                    styles.iconWrap,
                    isFocused && styles.iconWrapFocused,
                    { transform: [{ scale }] },
                  ]}
                >
                  <MaterialIcons
                    name={iconName}
                    size={28}
                    color={isFocused ? '#00853F' : '#888'}
                    accessibilityLabel={label}
                    accessibilityRole="image"
                  />
                </Animated.View>
                <Animated.Text
                  style={[
                    styles.label,
                    { color: isFocused ? '#00853F' : '#888' },
                    isFocused && styles.labelFocused,
                  ]}
                  accessibilityLabel={label}
                >
                  {label}
                </Animated.Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 28,
    marginHorizontal: 18,
    marginBottom: 0,
    marginTop: 0,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 16,
    minHeight: 64,
    zIndex: 100,
    overflow: 'hidden',
  },
  pill: {
    position: 'absolute',
    top: 10,
    backgroundColor: 'rgba(0,133,63,0.12)',
    borderRadius: 26,
    zIndex: 1,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
    paddingVertical: 6,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    width: 32,
  },
  iconWrapFocused: {
    // Optionally add a background or effect
  },
  underline: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#00853F',
    marginTop: 2,
    width: 22,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    marginTop: 2,
  },
  labelFocused: {
    fontWeight: '700',
  },
});
