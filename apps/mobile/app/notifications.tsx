import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { routeForNotification, type NotificationDto } from '@emcom/shared-types';
import { Button, Empty, ErrorView, Loading } from '@/components/ui';
import { api, messageOf } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { colors, space } from '@/lib/theme';

/** Persistent in-app inbox — the record of every alert, even if a push was missed. */
export default function Inbox() {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['inbox', 'list'],
    queryFn: ({ pageParam }) => api.notifications.list({ cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const readAll = useMutation({ mutationFn: () => api.notifications.markAllRead(), onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }) });
  const open = async (n: NotificationDto) => {
    if (!n.readAt) void api.notifications.markRead(n.id).then(() => qc.invalidateQueries({ queryKey: ['inbox'] }));
    router.push(routeForNotification({ type: n.type, communityId: n.communityId ?? undefined, emergencyId: n.emergencyId ?? undefined }) as never);
  };
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView message={messageOf(q.error)} onRetry={() => void q.refetch()} />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <FlatList
      data={items}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ padding: space(4), gap: space(2) }}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
      onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
      ListHeaderComponent={items.some((n) => !n.readAt) ? <Button title="Mark all as read" variant="ghost" onPress={() => readAll.mutate()} /> : null}
      ListEmptyComponent={<Empty title="No notifications" />}
      renderItem={({ item: n }) => {
        const urgent = n.priority !== 'NORMAL';
        return (
          <Pressable accessibilityRole="button" accessibilityLabel={`${n.readAt ? '' : 'Unread. '}${n.title}. ${n.body}`} onPress={() => void open(n)}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderLeftWidth: 5, borderLeftColor: urgent ? colors.emergency : colors.line, opacity: n.readAt ? 0.75 : 1 }}>
              <Text style={{ fontWeight: n.readAt ? '600' : '900', fontSize: 16, color: colors.ink }}>{n.title}</Text>
              <Text style={{ color: colors.ink, marginTop: 2 }}>{n.body}</Text>
              <Text style={{ color: colors.inkMuted, fontSize: 12, marginTop: 4 }}>{dateTime(n.createdAt)}</Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}
