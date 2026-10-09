import { useInfiniteQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, Text } from 'react-native';
import { routeForNotification } from '@emcom/shared-types';
import { EmergencyListItem } from '@/components/emergency';
import { Body, Button, Card, Loading } from '@/components/ui';
import { useActiveEmergencies } from '@/hooks/queries';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { colors, space } from '@/lib/theme';

/** Alerts tab: active emergencies + this community's notification inbox. */
export default function Alerts() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const active = useActiveEmergencies(communityId);
  const inbox = useInfiniteQuery({
    queryKey: ['inbox', 'community', communityId],
    queryFn: ({ pageParam }) => api.notifications.list({ communityId, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const items = inbox.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <ScrollView contentContainerStyle={{ padding: space(5), gap: space(3) }} refreshControl={<RefreshControl refreshing={active.isRefetching || inbox.isRefetching} onRefresh={() => void Promise.all([active.refetch(), inbox.refetch()])} />}>
      <Text accessibilityRole="header" style={{ fontWeight: '900', fontSize: 18, color: colors.ink }}>Active emergencies</Text>
      {active.isLoading ? <Loading /> : null}
      {active.data?.items.length === 0 ? <Body muted>None right now. Community normal.</Body> : null}
      {active.data?.items.map((e) => <EmergencyListItem key={e.id} e={e} />)}
      <Button title="Critical Alert" variant="emergency" icon="alert-circle-outline" onPress={() => router.push(`/c/${communityId}/critical`)} />
      <Text accessibilityRole="header" style={{ fontWeight: '900', fontSize: 18, color: colors.ink, marginTop: space(3) }}>Notifications</Text>
      {items.length === 0 && !inbox.isLoading ? <Body muted>No notifications for this community yet.</Body> : null}
      {items.map((n) => (
        <Card key={n.id} tone={n.priority === 'NORMAL' ? undefined : 'danger'}>
          <Text onPress={() => router.push(routeForNotification({ type: n.type, communityId: n.communityId ?? undefined, emergencyId: n.emergencyId ?? undefined }) as never)} accessibilityRole="link" style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>
            {n.title}
          </Text>
          <Body>{n.body}</Body>
          <Body muted style={{ fontSize: 12 }}>{dateTime(n.createdAt)}</Body>
        </Card>
      ))}
      {inbox.hasNextPage ? <Button title="Load more" variant="outline" onPress={() => void inbox.fetchNextPage()} /> : null}
    </ScrollView>
  );
}
