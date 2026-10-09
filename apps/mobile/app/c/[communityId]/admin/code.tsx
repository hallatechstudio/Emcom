import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Body, Button, Card, ErrorView, Loading, Screen } from '@/components/ui';
import { useCommunity } from '@/hooks/queries';
import { api, messageOf } from '@/lib/api';
import { colors } from '@/lib/theme';

/** Screen 35 — Community Code / QR: copy, share, display QR; owner can regenerate (PRD §8). */
export default function CommunityCode() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const { isOwner } = useCommunity(communityId);
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const q = useQuery({ queryKey: ['c', communityId, 'details'], queryFn: () => api.communities.get(communityId) });
  const rotate = useMutation({
    mutationFn: () => api.communities.rotateCode(communityId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['c', communityId] }),
    onError: (e) => Alert.alert('Could not regenerate', messageOf(e)),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView message={messageOf(q.error)} onRetry={() => void q.refetch()} />;
  const c = q.data!;
  const code = c.inviteCode ?? '';
  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: 16 }}>
        <Text style={{ fontWeight: '900', fontSize: 18, color: colors.ink }}>{c.name}</Text>
        <View accessible accessibilityLabel={`QR code for community code ${code}`} style={{ backgroundColor: '#fff', padding: 12 }}>
          {code ? <QRCode value={`emcom://communities/join?code=${code}`} size={200} /> : null}
        </View>
        <Text selectable accessibilityLabel={`Community code ${code.split('').join(' ')}`} style={{ fontSize: 34, fontWeight: '900', letterSpacing: 4, color: colors.ink }}>
          {code}
        </Text>
        <Body muted style={{ textAlign: 'center' }}>Members join with this code and wait for approval.</Body>
      </Card>
      <Button
        title={copied ? 'COPIED' : 'COPY CODE'}
        icon="copy-outline"
        onPress={async () => {
          await Clipboard.setStringAsync(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      />
      <Button title="SHARE" variant="outline" icon="share-social-outline" onPress={() => void Share.share({ message: `Join ${c.name} on EMCOM for emergency alerts. Community code: ${code}` })} />
      {isOwner ? (
        <Button
          title="REGENERATE CODE"
          variant="outline"
          icon="refresh"
          loading={rotate.isPending}
          onPress={() =>
            Alert.alert('Regenerate code?', `${code} will stop working. Existing members are not affected.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Regenerate', style: 'destructive', onPress: () => rotate.mutate() },
            ])
          }
        />
      ) : (
        <Body muted>Only the owner can regenerate the code.</Body>
      )}
    </Screen>
  );
}
