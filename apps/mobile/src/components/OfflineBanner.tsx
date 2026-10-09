import { useNetInfo } from '@react-native-community/netinfo';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';

/** Persistent offline notice. Emergency actions also show their own failure state. */
export function OfflineBanner() {
  const net = useNetInfo();
  const insets = useSafeAreaInsets();
  if (net.isConnected !== false) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: colors.caution, paddingTop: insets.top + 4, paddingBottom: 6, paddingHorizontal: 16 }}>
      <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>
        You are offline. Alerts cannot be sent or received until you reconnect. In danger? Call emergency services.
      </Text>
    </View>
  );
}
