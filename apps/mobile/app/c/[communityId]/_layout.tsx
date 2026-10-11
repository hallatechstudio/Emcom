import { Stack, useLocalSearchParams } from 'expo-router';
import { useCommunity } from '@/hooks/queries';
import { colors } from '@/lib/theme';

/** Community scope. Realtime for all communities is handled app-wide by RealtimeProvider. */
export default function CommunityLayout() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const { community } = useCommunity(communityId);

  return (
    <Stack screenOptions={{ headerTintColor: colors.ink, headerTitleStyle: { fontWeight: '800' }, headerBackTitle: 'Back', contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="report" options={{ title: 'Report emergency' }} />
      <Stack.Screen name="report-submitted" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="critical" options={{ title: 'Critical Alert' }} />
      <Stack.Screen name="critical-confirm" options={{ title: 'Critical Alert', presentation: 'fullScreenModal', headerShown: false }} />
      <Stack.Screen name="critical-sent/[emergencyId]" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="incoming/[emergencyId]" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="emergency/[emergencyId]/index" options={{ title: community?.name ?? 'Emergency' }} />
      <Stack.Screen name="emergency/[emergencyId]/updates" options={{ title: 'Emergency updates' }} />
      <Stack.Screen name="emergency/[emergencyId]/timeline" options={{ title: 'Emergency timeline' }} />
      <Stack.Screen name="admin/index" options={{ title: 'Admin dashboard' }} />
      <Stack.Screen name="admin/emergency/[emergencyId]" options={{ title: 'Emergency details' }} />
      <Stack.Screen name="admin/members" options={{ title: 'Members' }} />
      <Stack.Screen name="admin/code" options={{ title: 'Community code' }} />
    </Stack>
  );
}
