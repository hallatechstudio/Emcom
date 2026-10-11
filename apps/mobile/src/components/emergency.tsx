import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { isValidWhatsAppGroupUrl, mapsUrl, type EmergencyDto } from '@emcom/shared-types';
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

/** Opens the reporter's GPS fix in the maps app (only shown when coordinates were shared). */
export function MapLinkButton({ e }: { e: EmergencyDto }) {
  if (!e.coordinates) return null;
  const acc = e.coordinates.accuracyM != null ? ` (±${Math.round(e.coordinates.accuracyM)} m)` : '';
  return (
    <Button
      title={`OPEN GPS LOCATION${acc}`}
      variant="outline"
      icon="map-outline"
      accessibilityHint="Opens the reporter's shared GPS position in your maps app"
      onPress={() => void Linking.openURL(mapsUrl(e.coordinates!))}
    />
  );
}

/**
 * Attachments: each photo is fetched through the authorized API as a short-lived link only when
 * the user taps it (saves data, and access is re-checked every time). Videos open in the system player.
 */
export function MediaGallery({ e }: { e: EmergencyDto }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!e.media.length) return null;
  async function open(mediaId: string, kind: 'PHOTO' | 'VIDEO') {
    setError(null);
    setLoading(mediaId);
    try {
      const { url } = await api.media.downloadUrl(e.communityId, mediaId);
      if (kind === 'VIDEO') await Linking.openURL(url);
      else setUrls((u) => ({ ...u, [mediaId]: url }));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(null);
    }
  }
  return (
    <View style={{ gap: space(2) }}>
      <Text style={{ fontWeight: '900', color: colors.ink }}>Attachments ({e.media.length})</Text>
      {e.media.map((m, i) =>
        urls[m.id] ? (
          <Image key={m.id} source={{ uri: urls[m.id] }} accessibilityLabel={`Photo ${i + 1} attached to the report`} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.line }} resizeMode="cover" />
        ) : (
          <Button
            key={m.id}
            title={`${m.kind === 'VIDEO' ? 'Play video' : 'View photo'} ${i + 1} (${Math.ceil(m.sizeBytes / 1024)} KB)`}
            variant="outline"
            icon={m.kind === 'VIDEO' ? 'play-circle-outline' : 'image-outline'}
            loading={loading === m.id}
            onPress={() => void open(m.id, m.kind)}
          />
        ),
      )}
      <InlineError message={error} />
    </View>
  );
}
