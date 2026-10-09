import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { newIdempotencyKey } from '@emcom/api-client';
import { Limits } from '@emcom/shared-types';
import { Body, Button, Card, ErrorView, Field, InlineError, Loading } from '@/components/ui';
import { useEmergency } from '@/hooks/queries';
import { api, messageOf } from '@/lib/api';
import { dateTime, time, titleOf } from '@/lib/format';
import { colors, space } from '@/lib/theme';

/** Emergency Details / Confirm & Broadcast / Active Emergency Management / Send Update / Acknowledgment View / Resolve (screens 25–30). */
export default function AdminEmergency() {
  const { communityId, emergencyId } = useLocalSearchParams<{ communityId: string; emergencyId: string }>();
  const qc = useQueryClient();
  const q = useEmergency(communityId, emergencyId);
  const acks = useQuery({
    queryKey: ['c', communityId, 'emergency', emergencyId, 'acks'],
    queryFn: () => api.emergencies.ackSummary(communityId, emergencyId),
    enabled: !!q.data?.alert,
    refetchInterval: q.data?.status === 'ACTIVE' ? 15_000 : false,
  });
  const notAcked = useQuery({
    queryKey: ['c', communityId, 'emergency', emergencyId, 'not-acked'],
    queryFn: () => api.emergencies.ackRecipients(communityId, emergencyId, { filter: 'not_acknowledged', limit: 50 }),
    enabled: !!q.data?.alert,
  });
  const [instructions, setInstructions] = useState('');
  const [reason, setReason] = useState('');
  const [update, setUpdate] = useState('');
  const [resolution, setResolution] = useState('');
  const updateKey = useRef(newIdempotencyKey());
  const done = () => qc.invalidateQueries({ queryKey: ['c', communityId] });

  const confirm = useMutation({ mutationFn: () => api.emergencies.confirm(communityId, emergencyId, instructions.trim()), onSuccess: done });
  const dismiss = useMutation({ mutationFn: () => api.emergencies.dismiss(communityId, emergencyId, reason.trim()), onSuccess: done });
  const send = useMutation({
    mutationFn: () => api.emergencies.postUpdate(communityId, emergencyId, update.trim(), updateKey.current),
    onSuccess: () => {
      setUpdate('');
      updateKey.current = newIdempotencyKey();
      void done();
    },
  });
  const resolve = useMutation({ mutationFn: () => api.emergencies.resolve(communityId, emergencyId, resolution.trim()), onSuccess: done });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView message={messageOf(q.error)} onRetry={() => void q.refetch()} />;
  const e = q.data!;
  const ask = (title: string, body: string, cta: string, fn: () => void) =>
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: cta, style: 'destructive', onPress: fn },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: space(5), gap: space(4) }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Card tone={e.status === 'ACTIVE' ? 'danger' : e.status === 'PENDING' ? 'caution' : e.status === 'RESOLVED' ? 'safe' : undefined}>
        <Text style={{ fontWeight: '900', fontSize: 20, color: colors.ink }}>{titleOf(e)}</Text>
        <Text style={{ fontWeight: '900', color: colors.inkMuted }}>{e.status}</Text>
        <Body>{e.location ?? 'Location not provided'}</Body>
        {e.description ? <Body>{e.description}</Body> : null}
        <Body muted>
          Reported {dateTime(e.reportedAt)}
          {e.reporter ? ` by ${e.reporter.fullName}` : ''}
        </Body>
        {e.media.length ? <Body muted>{e.media.length} attachment(s) — open in the admin web console to view.</Body> : null}
        {e.additionalTriggerCount ? <Body style={{ color: colors.emergency, fontWeight: '800' }}>Triggered {e.additionalTriggerCount + 1} times by members</Body> : null}
      </Card>

      {e.status === 'PENDING' ? (
        <Card>
          <Field label="Instructions for members (optional)" multiline value={instructions} onChangeText={setInstructions} maxLength={500} placeholder="Avoid the area and follow community instructions." />
          <InlineError message={confirm.error ? messageOf(confirm.error) : null} />
          <Button title="CONFIRM & BROADCAST" variant="emergency" large loading={confirm.isPending} onPress={() => ask('Confirm & broadcast?', 'All approved members will be alerted immediately.', 'Broadcast', () => confirm.mutate())} />
          <Field label="Dismissal reason (admins only)" value={reason} onChangeText={setReason} maxLength={Limits.dismissalReason.max} />
          <InlineError message={dismiss.error ? messageOf(dismiss.error) : null} />
          <Button title="DISMISS" variant="outline" loading={dismiss.isPending} onPress={() => ask('Dismiss report?', 'Members will not be alerted. The report stays in admin history.', 'Dismiss', () => dismiss.mutate())} />
        </Card>
      ) : null}

      {acks.data ? (
        <Card>
          <Text accessibilityRole="header" style={{ fontWeight: '900', fontSize: 26, color: colors.ink }}>
            {acks.data.acknowledgedCount} / {acks.data.recipientCount} ACKNOWLEDGED
          </Text>
          <Body muted>Acknowledged ≠ safe. Push acceptance ≠ seen on the device.</Body>
          {notAcked.data?.items.length ? (
            <View style={{ gap: 4 }}>
              <Text style={{ fontWeight: '800', color: colors.caution }}>Not acknowledged ({acks.data.notAcknowledgedCount})</Text>
              {notAcked.data.items.slice(0, 15).map((r) => (
                <Body key={r.userId}>
                  • {r.fullName}
                  {r.identificationValue ? ` — ${r.identificationValue}` : ''}
                </Body>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {e.status === 'ACTIVE' ? (
        <Card>
          <Field label="Send update" multiline value={update} onChangeText={setUpdate} maxLength={Limits.updateMessage.max} placeholder="Security personnel have arrived at Gate 2. Please remain indoors." />
          <InlineError message={send.error ? messageOf(send.error) : null} />
          <Button title="SEND UPDATE" icon="send" loading={send.isPending} disabled={update.trim().length < Limits.updateMessage.min} onPress={() => send.mutate()} />
          {e.latestUpdate ? <Body muted>Last update {time(e.latestUpdate.createdAt)}: {e.latestUpdate.message}</Body> : null}
          <Field label="Resolution message (required to resolve)" multiline value={resolution} onChangeText={setResolution} maxLength={Limits.resolutionMessage.max} placeholder="Security personnel responded and the situation has been resolved." />
          <InlineError message={resolve.error ? messageOf(resolve.error) : null} />
          <Button
            title="RESOLVE EMERGENCY"
            variant="safe"
            loading={resolve.isPending}
            disabled={resolution.trim().length < Limits.resolutionMessage.min}
            onPress={() => ask('Confirm resolution?', 'Members are notified and the incident moves to history.', 'Confirm resolution', () => resolve.mutate())}
          />
        </Card>
      ) : null}

      {e.status === 'RESOLVED' ? (
        <Card tone="safe">
          <Body style={{ fontWeight: '800' }}>Resolved {dateTime(e.resolvedAt)}</Body>
          <Body>{e.resolutionMessage}</Body>
        </Card>
      ) : null}
      {e.status === 'DISMISSED' ? (
        <Card>
          <Body style={{ fontWeight: '800' }}>Dismissed {dateTime(e.dismissedAt)}</Body>
          <Body>{e.dismissalReason ?? 'No reason recorded.'}</Body>
        </Card>
      ) : null}
    </ScrollView>
  );
}
