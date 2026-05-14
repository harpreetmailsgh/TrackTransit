/**
 * Web placeholder — react-native-maps is not supported on web.
 * Metro loads this file instead of HomeMap.native.jsx for the "web" platform.
 */

import { StyleSheet, Text, View } from 'react-native';

const GO_GREEN = '#00853F';

/** Same name as the native module so `import HomeMap from './HomeMap'` works everywhere. */
export default function HomeMap() {
  return (
    <View style={styles.root}>
      <Text style={styles.message}>Map available on mobile app</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GO_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  message: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});
