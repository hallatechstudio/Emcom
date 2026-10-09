import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { Empty, ErrorView, Loading } from '@/components/ui';
import { api, messageOf } from '@/lib/api';
import { dateTime, time } from '@/lib/format';
import { colors, space } from '@/lib/theme';

/** Screen 18 — Emergency Updates: timestamped admin updates and instructions. */
export default function Updates() {
  const { communityId, emergencyId } = useLocalSearchParams<{ communityId: string; emergencyId: string }>();
  const q = useQuery({ queryKey: ['c', communityId, 'emergency', emergencyId, 'updates'], queryFn: () => api.emergencies.updates(communityId, emergencyId) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView message={messageOf(q.error)} onRetry={() => void q.refetch()} />;
  return (
    <FlatList
      data={[...(q.data ?? [])].reverse()}
      keyExtractor={(u) => u.id}
      contentContainerStyle={{ padding: space(4), gap: space(3) }}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
      ListEmptyComponent={<Empty title="No updates yet" body="Admins will post updates here as the situation develops." />}
      renderItem={({ item }) => (
        <View accessible accessibilityLabel={`Update at ${time(item.createdAt)}: ${item.message}`} style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderLeftWidth: 5, borderLeftColor: colors.primary }}>
          <Text style={{ fontWeight: '900', color: colors.ink }}>UPDATE — {time(item.createdAt)}</Text>
          <Text style={{ fontSize: 16, color: colors.ink, marginTop: 4 }}>{item.message}</Text>
          <Text style={{ fontSize: 12, color: colors.inkMuted, marginTop: 6 }}>
            {item.author.fullName} · {dateTime(item.createdAt)}
          </Text>
        </View>
      )}
    />
  );
}
