import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Body, Button, Card, ErrorView, H1, Loading, Screen } from '@/components/ui';
import { useCommunity } from '@/hooks/queries';
import { api, messageOf } from '@/lib/api';
import { colors } from '@/lib/theme';

/** Screen 9 — Join Request Pending. Polls until an admin decides; no incident data is shown. */
export default function JoinPending() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const qc = useQueryClient();
  const { community } = useCommunity(communityId);
  const m = useQuery({ queryKey: ['membership', communityId], queryFn: () => api.communities.myMembership(communityId), refetchInterval: 15_000 });
  const withdraw = useMutation({
    mutationFn: () => api.communities.leave(communityId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['mine'] });
      router.replace('/communities');
    },
  });

  useEffect(() => {
    if (m.data?.status === 'APPROVED') {
      void qc.invalidateQueries({ queryKey: ['mine'] });
      router.replace(`/c/${communityId}`);
    }
  }, [m.data?.status, communityId, qc]);

  if (m.isLoading) return <Loading />;
  if (m.error) return <ErrorView message={messageOf(m.error)} onRetry={() => void m.refetch()} />;
  const status = m.data!.status;
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 12, marginTop: 24 }}>
        <Ionicons name={status === 'PENDING' ? 'hourglass-outline' : 'close-circle-outline'} size={64} color={status === 'PENDING' ? colors.caution : colors.inkMuted} />
        <H1 style={{ textAlign: 'center' }}>{community?.name ?? 'Community'}</H1>
      </View>
      {status === 'PENDING' ? (
        <Card tone="caution">
          <Body style={{ fontWeight: '900', color: colors.caution }}>PENDING ADMIN APPROVAL</Body>
          <Body>An administrator has been notified. You will receive this community&apos;s emergency alerts once approved.</Body>
        </Card>
      ) : (
        <Card>
          <Body style={{ fontWeight: '800' }}>{status === 'REJECTED' ? 'Your request was not approved.' : status === 'SUSPENDED' ? 'Your membership is suspended.' : 'You are not an active member.'}</Body>
          <Body muted>Contact the community administrator if you think this is a mistake.</Body>
        </Card>
      )}
      {status === 'PENDING' ? <Button title="Withdraw request" variant="outline" loading={withdraw.isPending} onPress={() => withdraw.mutate()} /> : null}
      {status === 'REJECTED' ? <Button title="Request again with a code" onPress={() => router.replace('/communities/join')} /> : null}
      <Button title="Back to my communities" variant="ghost" onPress={() => router.replace('/communities')} />
    </Screen>
  );
}
