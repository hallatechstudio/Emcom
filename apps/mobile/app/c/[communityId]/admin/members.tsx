import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { canModerate, type MemberListItemDto, type MembershipStatus } from '@emcom/shared-types';
import { Body, Button, Card, Empty, ErrorView, Field, Loading } from '@/components/ui';
import { useCommunity } from '@/hooks/queries';
import { api, messageOf } from '@/lib/api';
import { colors, radius, space } from '@/lib/theme';

type Action = 'approve' | 'reject' | 'suspend' | 'reinstate' | 'remove';
const TABS: { key: MembershipStatus; label: string }[] = [
  { key: 'PENDING', label: 'Requests' },
  { key: 'APPROVED', label: 'Members' },
  { key: 'SUSPENDED', label: 'Suspended' },
];

/** Member Management + Membership Approval + Administrator Management (screens 31, 32, 34). */
export default function Members() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const { membership, community, isOwner } = useCommunity(communityId);
  const qc = useQueryClient();
  const [tab, setTab] = useState<MembershipStatus>('PENDING');
  const [search, setSearch] = useState('');
  const list = useInfiniteQuery({
    queryKey: ['c', communityId, 'members', tab, search],
    queryFn: ({ pageParam }) => api.members.list(communityId, { status: tab, q: search || undefined, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const act = useMutation({
    mutationFn: ({ m, action }: { m: MemberListItemDto; action: Action | 'make-admin' | 'remove-admin' }) =>
      action === 'make-admin' ? api.members.setRole(communityId, m.id, 'ADMIN') : action === 'remove-admin' ? api.members.setRole(communityId, m.id, 'MEMBER') : api.members.act(communityId, m.id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['c', communityId] }),
    onError: (e) => Alert.alert('Action failed', messageOf(e)),
  });
  const confirmAct = (m: MemberListItemDto, action: Action | 'make-admin' | 'remove-admin', label: string) =>
    Alert.alert(`${label}?`, `${m.user.fullName}${m.identificationValue ? ` (${m.identificationValue})` : ''}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: action === 'approve' || action === 'reinstate' || action === 'make-admin' ? 'default' : 'destructive', onPress: () => act.mutate({ m, action }) },
    ]);

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const role = membership?.role;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', margin: space(4), backgroundColor: '#E5E7EB', borderRadius: radius.md, padding: 4 }}>
        {TABS.map((t) => (
          <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} onPress={() => setTab(t.key)} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: tab === t.key ? colors.surface : 'transparent' }}>
            <Text style={{ fontWeight: '800', color: tab === t.key ? colors.ink : colors.inkMuted }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ paddingHorizontal: space(4) }}>
        <Field label="Search" placeholder="Name, email, phone or identification" value={search} onChangeText={setSearch} />
      </View>
      {list.isLoading ? <Loading /> : list.error ? (
        <ErrorView message={messageOf(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space(4), gap: space(3) }}
          onRefresh={() => void list.refetch()}
          refreshing={list.isRefetching}
          onEndReached={() => list.hasNextPage && void list.fetchNextPage()}
          ListEmptyComponent={<Empty title="Nobody here" />}
          renderItem={({ item: m }) => {
            const canMod = !!role && canModerate(role, m.role);
            return (
              <Card>
                <Text style={{ fontWeight: '900', fontSize: 16, color: colors.ink }}>
                  {m.user.fullName} {m.role !== 'MEMBER' ? `· ${m.role}` : ''}
                </Text>
                <Body muted>
                  {community?.identificationField?.label ?? 'ID'}: {m.identificationValue ?? '—'} · {m.user.phone}
                </Body>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
                  {m.status === 'PENDING' ? (
                    <>
                      <Button title="APPROVE" variant="safe" onPress={() => confirmAct(m, 'approve', 'Approve')} />
                      <Button title="REJECT" variant="outline" onPress={() => confirmAct(m, 'reject', 'Reject')} />
                    </>
                  ) : null}
                  {m.status === 'APPROVED' && canMod ? (
                    <>
                      <Button title="Suspend" variant="outline" onPress={() => confirmAct(m, 'suspend', 'Suspend')} />
                      <Button title="Remove" variant="outline" onPress={() => confirmAct(m, 'remove', 'Remove')} />
                    </>
                  ) : null}
                  {m.status === 'SUSPENDED' && canMod ? <Button title="Reinstate" onPress={() => confirmAct(m, 'reinstate', 'Reinstate')} /> : null}
                  {isOwner && m.status === 'APPROVED' && m.role !== 'OWNER' ? (
                    m.role === 'ADMIN' ? (
                      <Button title="Remove admin" variant="outline" onPress={() => confirmAct(m, 'remove-admin', 'Remove admin')} />
                    ) : (
                      <Button title="Make admin" variant="outline" onPress={() => confirmAct(m, 'make-admin', 'Make admin')} />
                    )
                  ) : null}
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
