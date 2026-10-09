import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AcknowledgeButton, WhatsAppButton } from '@/components/emergency';
import { Button, ErrorView, Loading } from '@/components/ui';
import { useCommunity, useEmergency } from '@/hooks/queries';
import { messageOf } from '@/lib/api';
import { titleOf } from '@/lib/format';
import { colors, space } from '@/lib/theme';

/**
 * Screen 16 — Incoming Emergency Alert (PRD §15). Must answer at a glance:
 * something is happening · where · what to do · have I acknowledged it.
 */
export default function IncomingAlert() {
  const { communityId, emergencyId } = useLocalSearchParams<{ communityId: string; emergencyId: string }>();
  const { community } = useCommunity(communityId);
  const q = useEmergency(communityId, emergencyId);
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);
  const status = q.data?.status;
  useEffect(() => {
    // Already resolved (or not broadcast) by the time it was opened: show the regular incident view.
    if (status && status !== 'ACTIVE') router.replace(`/c/${communityId}/emergency/${emergencyId}`);
  }, [status, communityId, emergencyId]);

  if (q.isLoading) return <Loading label="Opening alert…" />;
  if (q.error) return <ErrorView message={`${messageOf(q.error)} You may no longer have access to this community.`} onRetry={() => void q.refetch()} />;
  const e = q.data!;
  if (e.status !== 'ACTIVE') return <Loading label="Opening alert…" />;
  const critical = e.pathway === 'CRITICAL';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.emergency }}>
      <ScrollView contentContainerStyle={{ padding: space(5), gap: space(4), flexGrow: 1, justifyContent: 'space-between' }}>
        <View accessible accessibilityRole="alert" style={{ alignItems: 'center', gap: space(2), marginTop: space(6) }}>
          <Ionicons name="warning" size={72} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 40, fontWeight: '900' }}>{critical ? 'EMERGENCY!' : 'ACTIVE EMERGENCY'}</Text>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{community?.name ?? e.communityName}</Text>
          {critical ? (
            <Text style={{ color: '#fff', fontSize: 19, fontWeight: '700', textAlign: 'center' }}>A critical alert has been triggered for your community.</Text>
          ) : (
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{titleOf(e)}</Text>
          )}
          {e.location ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="location" size={22} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{e.location}</Text>
            </View>
          ) : null}
          {e.instructions || e.description ? (
            <Text style={{ color: '#fff', fontSize: 17, textAlign: 'center' }}>{e.instructions ?? e.description}</Text>
          ) : null}
        </View>
        <View style={{ gap: space(3), backgroundColor: '#ffffff', borderRadius: 18, padding: space(4) }}>
          <AcknowledgeButton e={e} />
          <Button title="VIEW ALERT" onPress={() => router.replace(`/c/${communityId}/emergency/${emergencyId}`)} />
          <WhatsAppButton url={community?.whatsappUrl} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
