import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { EmergencyListItem } from '@/components/emergency';
import { Body, Button, ErrorView, Loading } from '@/components/ui';
import { api, messageOf } from '@/lib/api';
import { colors, radius, space } from '@/lib/theme';

/** Admin Dashboard (PRD §22) — mobile. Every action is enforced again by the API. */
export default function AdminDashboard() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const o = useQuery({ queryKey: ['c', communityId, 'overview'], queryFn: () => api.admin.overview(communityId, since.toISOString()) });
  const pending = useQuery({ queryKey: ['c', communityId, 'emergencies', 'PENDING'], queryFn: () => api.emergencies.list(communityId, { status: ['PENDING'], limit: 20 }) });
  const active = useQuery({ queryKey: ['c', communityId, 'emergencies', 'ACTIVE'], queryFn: () => api.emergencies.list(communityId, { status: ['ACTIVE'], limit: 20 }) });
  if (o.isLoading) return <Loading />;
  if (o.error) return <ErrorView message={messageOf(o.error)} onRetry={() => void o.refetch()} />;
  const d = o.data!;
  const tiles = [
    { label: 'Members', value: d.memberCount, onPress: () => router.push(`/c/${communityId}/admin/members`) },
    { label: 'Pending requests', value: d.pendingRequestCount, warn: d.pendingRequestCount > 0, onPress: () => router.push(`/c/${communityId}/admin/members`) },
    { label: 'Active emergency', value: d.activeEmergencyCount, danger: d.activeEmergencyCount > 0 },
    { label: 'Alerts today', value: d.alertsToday },
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: space(5), gap: space(4) }} refreshControl={<RefreshControl refreshing={o.isRefetching} onRefresh={() => void Promise.all([o.refetch(), pending.refetch(), active.refetch()])} />}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
        {tiles.map((t) => (
          <Pressable key={t.label} accessibilityRole={t.onPress ? 'button' : 'text'} accessibilityLabel={`${t.value} ${t.label}`} onPress={t.onPress} style={{ width: '47%', backgroundColor: t.danger ? colors.emergencySoft : t.warn ? colors.cautionSoft : colors.surface, borderColor: t.danger ? colors.emergency : t.warn ? colors.caution : colors.line, borderWidth: 1, borderRadius: radius.lg, padding: space(4) }}>
            <Text style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{t.value}</Text>
            <Text style={{ color: colors.inkMuted, fontWeight: '700' }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text accessibilityRole="header" style={{ fontWeight: '900', fontSize: 18, color: colors.ink }}>Emergency reports ({pending.data?.items.length ?? 0})</Text>
      {pending.data?.items.length === 0 ? <Body muted>No reports awaiting review.</Body> : null}
      {pending.data?.items.map((e) => <EmergencyListItem key={e.id} e={e} onPress={() => router.push(`/c/${communityId}/admin/emergency/${e.id}`)} />)}
      <Text accessibilityRole="header" style={{ fontWeight: '900', fontSize: 18, color: colors.ink }}>Active emergencies</Text>
      {active.data?.items.length === 0 ? <Body muted>None.</Body> : null}
      {active.data?.items.map((e) => <EmergencyListItem key={e.id} e={e} onPress={() => router.push(`/c/${communityId}/admin/emergency/${e.id}`)} />)}
      <Button title="MEMBER MANAGEMENT" icon="people-outline" onPress={() => router.push(`/c/${communityId}/admin/members`)} />
      <Button title="COMMUNITY CODE / QR" variant="outline" icon="qr-code-outline" onPress={() => router.push(`/c/${communityId}/admin/code`)} />
      <Body muted style={{ fontSize: 13 }}>Settings, administrator management and the audit log are also available in the EMCOM admin web console.</Body>
    </ScrollView>
  );
}
