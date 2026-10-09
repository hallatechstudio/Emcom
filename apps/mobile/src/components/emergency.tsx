import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Linking, Pressable, Text, View } from 'react-native';
import { isValidWhatsAppGroupUrl, type EmergencyDto } from '@emcom/shared-types';
import { api, messageOf } from '@/lib/api';
import { dateTime, titleOf } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';
import { Button, InlineError } from './ui';

/** Opens the community's official WhatsApp group. Only https://chat.whatsapp.com links are ever opened. */
export function WhatsAppButton({ url }: { url: string | null | undefined }) {
  if (!url || !isValidWhatsAppGroupUrl(url)) return null;
  return <Button title="OPEN COMMUNITY WHATSAPP" variant="whatsapp" icon="logo-whatsapp" accessibilityHint="Opens WhatsApp for discussion. Alerts stay in EMCOM." onPress={() => void Linking.openURL(url)} />;
}

export function AcknowledgeButton({ e }: { e: EmergencyDto }) {
  const qc = useQueryClient();
  const ack = useMutation({
    mutationFn: () => api.emergencies.acknowledge(e.communityId, e.id),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void qc.invalidateQueries({ queryKey: ['c', e.communityId] });
    },
  });
  if (!e.alert) return null;
  if (e.myAcknowledgedAt || ack.data) {
    return (
      <View accessibilityRole="text" accessibilityLabel="Alert acknowledged" style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.safeSoft, borderRadius: radius.md, minHeight: 56 }}>
        <Ionicons name="checkmark-circle" size={26} color={colors.safe} />
        <Text style={{ color: colors.safe, fontWeight: '900', fontSize: 17 }}>ALERT ACKNOWLEDGED</Text>
      </View>
    );
  }
  if (e.status !== 'ACTIVE') return null;
  return (
    <View style={{ gap: 6 }}>
      <Button title="ACKNOWLEDGE ALERT" variant="safe" large icon="checkmark-circle-outline" accessibilityHint="Tells admins you have seen this alert. It does not report that you are safe." loading={ack.isPending} onPress={() => ack.mutate()} />
      <InlineError message={ack.error ? messageOf(ack.error) : null} />
    </View>
  );
}

export function EmergencyListItem({ e, onPress }: { e: EmergencyDto; onPress?: () => void }) {
  const active = e.status === 'ACTIVE';
  const color = active ? colors.emergency : e.status === 'RESOLVED' ? colors.safe : e.status === 'PENDING' ? colors.caution : colors.inkMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titleOf(e)}, ${e.status.toLowerCase()}, ${e.location ?? 'no location'}, reported ${dateTime(e.reportedAt)}`}
      onPress={onPress ?? (() => router.push(`/c/${e.communityId}/emergency/${e.id}`))}
      style={{ backgroundColor: active ? colors.emergencySoft : colors.surface, borderRadius: radius.lg, padding: space(4), borderWidth: 1, borderColor: active ? colors.emergency : colors.line, gap: 4 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontWeight: '900', fontSize: 16, color: colors.ink, flex: 1 }}>{titleOf(e)}</Text>
        <Text style={{ fontWeight: '900', color, fontSize: 12 }}>{e.status === 'PENDING' ? 'AWAITING REVIEW' : e.status}</Text>
      </View>
      <Text style={{ color: colors.inkMuted }}>{e.location ?? 'Location not provided'}</Text>
      <Text style={{ color: colors.inkMuted, fontSize: 12 }}>{dateTime(e.reportedAt)}</Text>
    </Pressable>
  );
}
