import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSession } from '@/lib/session-store';
import { colors } from '@/lib/theme';

/** Screen 1 — Splash. Decides where to go once the stored session has been restored. */
export default function Splash() {
  const { ready, user, pendingRoute, setPendingRoute } = useSession();
  // Capture the deep link once, then clear it outside render.
  const target = useRef<string | null>(null);
  if (ready && user?.emailVerified && pendingRoute && !target.current) target.current = pendingRoute;
  useEffect(() => {
    if (target.current) setPendingRoute(null);
  }, [ready, setPendingRoute]);
  if (ready) {
    if (!user) return <Redirect href="/welcome" />;
    if (!user.emailVerified) return <Redirect href="/otp" />;
    if (target.current) return <Redirect href={target.current as never} />;
    return <Redirect href="/communities" />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.emergency, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Ionicons name="shield-checkmark" size={72} color="#fff" accessibilityLabel="EMCOM" />
      <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: 2 }}>EMCOM</Text>
      <Text style={{ color: '#fff', fontSize: 16 }}>Your Community&apos;s Emergency Network.</Text>
      <ActivityIndicator color="#fff" style={{ marginTop: 24 }} />
    </View>
  );
}
