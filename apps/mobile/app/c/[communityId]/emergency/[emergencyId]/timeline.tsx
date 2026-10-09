import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { EmergencyEventLabel } from '@emcom/shared-types';
import { ErrorView, Loading } from '@/components/ui';
import { api, messageOf } from '@/lib/api';
import { time } from '@/lib/format';
import { colors, space } from '@/lib/theme';

/** Screen 19 — Emergency Timeline (PRD §20): permanent, ordered record of the incident. */
export default function Timeline() {
  const { communityId, emergencyId } = useLocalSearchParams<{ communityId: string; emergencyId: string }>();
  const q = useQuery({ queryKey: ['c', communityId, 'emergency', emergencyId, 'timeline'], queryFn: () => api.emergencies.timeline(communityId, emergencyId) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView message={messageOf(q.error)} onRetry={() => void q.refetch()} />;
  return (
    <ScrollView contentContainerStyle={{ padding: space(5) }}>
      {q.data?.map((ev, i) => (
        <View key={ev.id} accessible accessibilityLabel={`${time(ev.createdAt)}, ${EmergencyEventLabel[ev.type]}${ev.message ? `: ${ev.message}` : ''}`} style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: ev.type === 'RESOLVED' ? colors.safe : ev.type === 'DISMISSED' ? colors.inkMuted : colors.emergency, marginTop: 4 }} />
            {i < (q.data?.length ?? 0) - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: colors.line }} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: space(5) }}>
            <Text style={{ fontWeight: '900', color: colors.ink, fontVariant: ['tabular-nums'] }}>{time(ev.createdAt)}</Text>
            <Text style={{ fontSize: 16, color: colors.ink }}>{EmergencyEventLabel[ev.type]}</Text>
            {ev.actor ? <Text style={{ color: colors.inkMuted, fontSize: 13 }}>{ev.actor.fullName}</Text> : null}
            {ev.message ? <Text style={{ color: colors.ink, marginTop: 2 }}>{ev.message}</Text> : null}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
