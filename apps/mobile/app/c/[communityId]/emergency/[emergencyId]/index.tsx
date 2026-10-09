import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { AcknowledgeButton, WhatsAppButton } from '@/components/emergency';
import { Body, Button, Card, ErrorView, Loading } from '@/components/ui';
import { useCommunity, useEmergency } from '@/hooks/queries';
import { messageOf } from '@/lib/api';
import { dateTime, time, titleOf } from '@/lib/format';
import { colors, space } from '@/lib/theme';

/** Screens 17 (Active Emergency) and 20 (Resolved Emergency), plus the reporter's own pending/dismissed view. */
export default function EmergencyScreen() {
  const { communityId, emergencyId } = useLocalSearchParams<{ communityId: string; emergencyId: string }>();
  const { community, isAdmin } = useCommunity(communityId);
  const q = useEmergency(communityId, emergencyId);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView message={`${messageOf(q.error)}`} onRetry={() => void q.refetch()} />;
  const e = q.data!;
  const banner = {
    ACTIVE: { text: 'ACTIVE EMERGENCY', bg: colors.emergency, icon: 'warning' as const },
    RESOLVED: { text: 'RESOLVED', bg: colors.safe, icon: 'checkmark-circle' as const },
    PENDING: { text: 'AWAITING ADMIN REVIEW', bg: colors.caution, icon: 'hourglass' as const },
    DISMISSED: { text: 'REVIEWED — NOT BROADCAST', bg: colors.inkMuted, icon: 'close-circle' as const },
  }[e.status];

  return (
    <ScrollView contentContainerStyle={{ padding: space(5), gap: space(4) }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <View accessibilityRole="header" style={{ backgroundColor: banner.bg, borderRadius: 18, padding: space(4), alignItems: 'center', gap: 4 }}>
        <Ionicons name={banner.icon} size={36} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22, letterSpacing: 1 }}>{banner.text}</Text>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{titleOf(e)}</Text>
      </View>
      <Card>
        <Row label="Location" value={e.location ?? 'Not provided'} />
        <Row label="Status" value={e.status} />
        <Row label="Reported" value={dateTime(e.reportedAt)} />
        {e.status === 'RESOLVED' ? <Row label="Resolved" value={dateTime(e.resolvedAt)} /> : null}
        {e.description ? <Body>{e.description}</Body> : null}
      </Card>
      {e.status === 'RESOLVED' && e.resolutionMessage ? (
        <Card tone="safe">
          <Text style={{ fontWeight: '900', color: colors.safe }}>Resolution</Text>
          <Body>{e.resolutionMessage}</Body>
        </Card>
      ) : null}
      {e.instructions ? (
        <Card tone="caution">
          <Text style={{ fontWeight: '900', color: colors.caution }}>Instructions</Text>
          <Body>{e.instructions}</Body>
        </Card>
      ) : null}
      {e.latestUpdate ? (
        <Card>
          <Text style={{ fontWeight: '900', color: colors.ink }}>LATEST UPDATE — {time(e.latestUpdate.createdAt)}</Text>
          <Body>{e.latestUpdate.message}</Body>
        </Card>
      ) : null}
      {e.status === 'PENDING' ? <Body muted>Thanks — an administrator is reviewing your report. Members are alerted only if it is confirmed.</Body> : null}
      <AcknowledgeButton e={e} />
      {e.alert ? (
        <View style={{ flexDirection: 'row', gap: space(2) }}>
          <View style={{ flex: 1 }}>
            <Button title="VIEW TIMELINE" variant="outline" onPress={() => router.push(`/c/${communityId}/emergency/${emergencyId}/timeline`)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="UPDATES" variant="outline" onPress={() => router.push(`/c/${communityId}/emergency/${emergencyId}/updates`)} />
          </View>
        </View>
      ) : (
        <Button title="VIEW TIMELINE" variant="outline" onPress={() => router.push(`/c/${communityId}/emergency/${emergencyId}/timeline`)} />
      )}
      {e.status === 'ACTIVE' ? <WhatsAppButton url={community?.whatsappUrl} /> : null}
      {isAdmin ? <Button title="MANAGE AS ADMIN" icon="shield-half-outline" onPress={() => router.push(`/c/${communityId}/admin/emergency/${emergencyId}`)} /> : null}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ color: colors.inkMuted, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 15, flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}
