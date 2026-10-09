import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { newIdempotencyKey } from '@emcom/api-client';
import { ALLOWED_MEDIA_TYPES, EmergencyCategory, EmergencyCategoryLabel, Limits } from '@emcom/shared-types';
import { Body, Button, Field, InlineError, Screen, styles } from '@/components/ui';
import { useCommunity } from '@/hooks/queries';
import { api, messageOf } from '@/lib/api';
import { colors, radius, space } from '@/lib/theme';

const ICONS: Record<EmergencyCategory, keyof typeof Ionicons.glyphMap> = {
  FIRE: 'flame',
  SECURITY_THREAT: 'shield',
  MEDICAL_EMERGENCY: 'medkit',
  ELECTRICAL_EMERGENCY: 'flash',
  GAS_LEAK: 'cloud',
  FLOOD: 'water',
  OTHER: 'help-circle',
};

interface Attachment {
  uri: string;
  mimeType: string;
  size: number;
  kind: 'PHOTO' | 'VIDEO';
}

/** Screen 11 — Report Emergency (PRD §11). */
export default function ReportEmergency() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const { community } = useCommunity(communityId);
  const [category, setCategory] = useState<EmergencyCategory | null>(null);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One key per report attempt: retries after a network failure cannot create duplicates.
  const idem = useRef(newIdempotencyKey());

  async function pick(camera: boolean) {
    setError(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError('Permission is needed to attach media. You can still send the report without it.');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images', 'videos'], quality: 0.7, videoMaxDuration: 60 };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled) return;
    const a = res.assets[0]!;
    const mimeType = a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const kind = ALLOWED_MEDIA_TYPES[mimeType as keyof typeof ALLOWED_MEDIA_TYPES];
    if (!kind) return setError('That file type is not supported.');
    const size = a.fileSize ?? 0;
    const max = kind === 'PHOTO' ? Limits.maxPhotoBytes : Limits.maxVideoBytes;
    if (size > max) return setError(`File is too large (max ${max / 1024 / 1024} MB).`);
    setAttachments((x) => [...x, { uri: a.uri, mimeType, size, kind }].slice(0, Limits.maxMediaPerReport));
  }

  async function upload(a: Attachment): Promise<string | null> {
    const blob = await (await fetch(a.uri)).blob();
    const presigned = await api.media.createUpload(communityId, a.mimeType, blob.size || a.size);
    const put = await fetch(presigned.uploadUrl, { method: 'PUT', headers: presigned.headers, body: blob });
    return put.ok ? presigned.mediaId : null;
  }

  async function submit() {
    if (!category) return;
    setError(null);
    try {
      const mediaIds: string[] = [];
      for (const [i, a] of attachments.entries()) {
        setBusy(`Uploading attachment ${i + 1} of ${attachments.length}…`);
        // A failed upload never blocks the report.
        const id = await upload(a).catch(() => null);
        if (id) mediaIds.push(id);
      }
      setBusy('Sending report…');
      const e = await api.emergencies.report(communityId, { category, location: location.trim(), description: description.trim(), mediaIds }, idem.current);
      router.replace({ pathname: '/c/[communityId]/report-submitted', params: { communityId, emergencyId: e.id, media: String(attachments.length - mediaIds.length) } });
    } catch (e) {
      setError(`${messageOf(e)} Your report was not sent — tap Submit to retry.`);
    } finally {
      setBusy(null);
    }
  }

  const valid = !!category && location.trim().length >= 2 && description.trim().length >= Limits.emergencyDescription.min;
  return (
    <Screen>
      <Body muted>Reporting to {community?.name}. Admins review reports before alerting everyone. For immediate danger use Critical Alert.</Body>
      <Text style={styles.label}>Emergency type</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
        {Object.values(EmergencyCategory).map((c) => {
          const selected = category === c;
          return (
            <Pressable
              key={c}
              testID={`category-${c}`}
              accessibilityRole="radio"
              accessibilityLabel={EmergencyCategoryLabel[c]}
              accessibilityState={{ selected }}
              onPress={() => setCategory(c)}
              style={{ width: '48%', minHeight: 64, borderRadius: radius.md, borderWidth: 2, borderColor: selected ? colors.emergency : colors.line, backgroundColor: selected ? colors.emergencySoft : colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 }}
            >
              <Ionicons name={ICONS[c]} size={24} color={selected ? colors.emergency : colors.ink} />
              <Text style={{ fontWeight: '800', color: colors.ink, flexShrink: 1 }}>{EmergencyCategoryLabel[c]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field label="Location" placeholder="e.g. Block B, near the generator house" value={location} onChangeText={setLocation} maxLength={160} />
      <Field label="Description" placeholder="What is happening?" multiline value={description} onChangeText={setDescription} maxLength={Limits.emergencyDescription.max} />
      <Text style={styles.label}>Photo or video (optional)</Text>
      <View style={{ flexDirection: 'row', gap: space(2) }}>
        <View style={{ flex: 1 }}>
          <Button title="Camera" variant="outline" icon="camera-outline" onPress={() => void pick(true)} disabled={attachments.length >= Limits.maxMediaPerReport} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Gallery" variant="outline" icon="images-outline" onPress={() => void pick(false)} disabled={attachments.length >= Limits.maxMediaPerReport} />
        </View>
      </View>
      {attachments.map((a, i) => (
        <View key={a.uri} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Body>
            {a.kind === 'VIDEO' ? 'Video' : 'Photo'} {i + 1} ({Math.ceil(a.size / 1024)} KB)
          </Body>
          <Button title="Remove" variant="ghost" onPress={() => setAttachments((x) => x.filter((_, j) => j !== i))} />
        </View>
      ))}
      <InlineError message={error} />
      {busy ? <Body muted>{busy}</Body> : null}
      <Button testID="submit-report" title="SUBMIT REPORT" variant="emergency" large loading={!!busy} disabled={!valid} onPress={submit} />
    </Screen>
  );
}
