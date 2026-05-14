import { View, Text, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function SleekHeaderBar({ title, icon, description }) {
  // Height: add 5% more to previous value: 96 * 1.05 ≈ 101 (iOS), 53 * 1.05 ≈ 56 (Android)
  const height = Platform.OS === 'ios' ? 101 : 56;
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height,
        backgroundColor: '#00994C',
        zIndex: 100,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 18,
        paddingBottom: 12,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        {icon ? (
          <MaterialIcons name={icon} size={28} color="#fff" style={{ marginRight: 10, marginBottom: 2 }} />
        ) : null}
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 22, letterSpacing: 1, textAlignVertical: 'bottom' }}>
          {title}
        </Text>
      </View>
      {description ? (
        <Text style={{ color: '#fff', fontSize: 13, opacity: 0.85, textAlign: 'right', maxWidth: 160 }} numberOfLines={1} ellipsizeMode="tail">
          {description}
        </Text>
      ) : null}
    </View>
  );
}
