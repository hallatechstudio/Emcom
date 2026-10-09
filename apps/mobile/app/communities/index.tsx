import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { CommunityTypeLabel, type MyCommunityDto } from '@emcom/shared-types';
import { Body, Button, Card, Empty, ErrorView, Loading } from '@/components/ui';
import { useMine } from '@/hooks/queries';
import { api, messageOf } from '@/lib/api';
import { colors, space } from '@/lib/theme';

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  PENDING: { text: 'PENDING ADMIN APPROVAL', color: colors.caution },
  REJECTED: { text: 'REQUEST NOT APPROVED', color: colors.inkMuted },
  SUSPENDED: { text: 'MEMBERSHIP SUSPENDED', color: colors.emergency },
};

/** Screen 6 — My Communities: switch between every community the user belongs to. */
export default function MyCommunities() {
  const mine = useMine();
  const unread = useQuery({ queryKey: ['inbox', 'unread'], queryFn: () => api.notifications.unreadCount(), refetchInterval: 30_000 });

  const open = (m: MyCommunityDto) => {
    if (m.membership.status === 'APPROVED') router.push(`/c/${m.community.id}`);
    else router.push(`/communities/pending/${m.community.id}`);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unread.data?.count ?? 0} unread`} onPress={() => router.push('/notifications')} style={{ padding: 8, minWidth: 48, minHeight: 48, justifyContent: 'center' }}>
              <Ionicons name="notifications-outline" size={26} color={colors.ink} />
              {unread.data?.count ? (
                <View style={{ position: 'absolute', top: 6, right: 4, backgroundColor: colors.emergency, borderRadius: 9, minWidth: 18, paddingHorizontal: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', textAlign: 'center' }}>{unread.data.count}</Text>
                </View>
              ) : null}
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: space(5), gap: space(3) }} refreshControl={<RefreshControl refreshing={mine.isRefetching} onRefresh={() => void mine.refetch()} />}>
        {mine.isLoading ? <Loading /> : null}
        {mine.error ? <ErrorView message={messageOf(mine.error)} onRetry={() => void mine.refetch()} /> : null}
        {mine.data?.length === 0 ? <Empty title="No communities yet" body="Create a community for your estate, church, school or workplace — or join one with its code." /> : null}
        {mine.data?.map((m) => {
          const s = STATUS_LABEL[m.membership.status];
          const alert = m.activeEmergencyCount > 0;
          return (
            <Pressable key={m.community.id} accessibilityRole="button" accessibilityLabel={`${m.community.name}${alert ? ', active emergency' : ''}${s ? `, ${s.text}` : ''}`} onPress={() => open(m)}>
              <Card tone={alert ? 'danger' : undefined}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 19, fontWeight: '800', color: colors.ink, flex: 1 }}>{m.community.name}</Text>
                  <Ionicons name="chevron-forward" size={22} color={colors.inkMuted} />
                </View>
                <Body muted>
                  {CommunityTypeLabel[m.community.type]} · {m.community.location}
                  {m.membership.status === 'APPROVED' && m.membership.role !== 'MEMBER' ? ` · ${m.membership.role === 'OWNER' ? 'Owner' : 'Admin'}` : ''}
                </Body>
                {s ? <Text style={{ color: s.color, fontWeight: '800' }}>{s.text}</Text> : null}
                {m.membership.status === 'APPROVED' ? (
                  <Text style={{ color: alert ? colors.emergency : colors.safe, fontWeight: '800' }}>{alert ? `ACTIVE EMERGENCY (${m.activeEmergencyCount})` : 'COMMUNITY NORMAL'}</Text>
                ) : null}
              </Card>
            </Pressable>
          );
        })}
        <View style={{ gap: space(3), marginTop: space(2) }}>
          <Button title="JOIN A COMMUNITY" icon="enter-outline" onPress={() => router.push('/communities/join')} />
          <Button title="CREATE A COMMUNITY" variant="outline" icon="add-circle-outline" onPress={() => router.push('/communities/create')} />
        </View>
      </ScrollView>
    </>
  );
}
