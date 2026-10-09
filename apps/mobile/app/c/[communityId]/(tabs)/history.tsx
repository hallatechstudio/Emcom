import { useInfiniteQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { EmergencyStatus } from '@emcom/shared-types';
import { EmergencyListItem } from '@/components/emergency';
import { Empty, ErrorView, Loading } from '@/components/ui';
import { useCommunity } from '@/hooks/queries';
import { api, messageOf } from '@/lib/api';
import { colors, radius, space } from '@/lib/theme';

type Tab = 'ACTIVE' | 'RESOLVED' | 'DISMISSED' | 'MINE';

/** Screen 21 — Emergency History. Members: active + resolved (+ own reports). Admins also: dismissed. */
export default function History() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const { isAdmin } = useCommunity(communityId);
  const [tab, setTab] = useState<Tab>('RESOLVED');
  const tabs: Tab[] = isAdmin ? ['ACTIVE', 'RESOLVED', 'DISMISSED', 'MINE'] : ['ACTIVE', 'RESOLVED', 'MINE'];
  const q = useInfiniteQuery({
    queryKey: ['c', communityId, 'history', tab],
    queryFn: ({ pageParam }) =>
      api.emergencies.list(communityId, tab === 'MINE' ? { mine: true, cursor: pageParam } : { status: [tab as EmergencyStatus], cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <View style={{ flex: 1 }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', margin: space(4), backgroundColor: '#E5E7EB', borderRadius: radius.md, padding: 4 }}>
        {tabs.map((t) => (
          <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: tab === t ? colors.surface : 'transparent' }}>
            <Text style={{ fontWeight: '800', color: tab === t ? colors.ink : colors.inkMuted, fontSize: 13 }}>{t === 'MINE' ? 'My reports' : t[0] + t.slice(1).toLowerCase()}</Text>
          </Pressable>
        ))}
      </View>
      {q.isLoading ? <Loading /> : q.error ? (
        <ErrorView message={messageOf(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingHorizontal: space(4), paddingBottom: space(8), gap: space(2) }}
          onRefresh={() => void q.refetch()}
          refreshing={q.isRefetching}
          onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
          ListEmptyComponent={<Empty title="Nothing here" />}
          renderItem={({ item }) => (
            <EmergencyListItem e={item} onPress={() => router.push(isAdmin && (item.status === 'PENDING' || item.status === 'DISMISSED') ? `/c/${communityId}/admin/emergency/${item.id}` : `/c/${communityId}/emergency/${item.id}`)} />
          )}
        />
      )}
    </View>
  );
}
