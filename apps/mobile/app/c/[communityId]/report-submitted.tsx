import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Body, Button, H1, Screen } from '@/components/ui';
import { colors } from '@/lib/theme';

/** Screen 12 — Report Submitted. */
export default function ReportSubmitted() {
  const { communityId, emergencyId, media } = useLocalSearchParams<{ communityId: string; emergencyId: string; media?: string }>();
  const failedMedia = Number(media ?? 0);
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 16, marginTop: 64 }}>
        <Ionicons name="checkmark-circle" size={88} color={colors.safe} />
        <H1 style={{ textAlign: 'center' }}>REPORT SUBMITTED</H1>
        <Body style={{ textAlign: 'center' }}>Your report has been sent to the community administrator.</Body>
        <Body muted style={{ textAlign: 'center' }}>You will be notified when it is reviewed. If anyone is in immediate danger, call emergency services.</Body>
        {failedMedia > 0 ? <Body style={{ color: colors.caution, textAlign: 'center' }}>{failedMedia} attachment(s) could not be uploaded. The report itself was sent.</Body> : null}
      </View>
      <Button title="VIEW MY REPORT" onPress={() => router.replace(`/c/${communityId}/emergency/${emergencyId}`)} />
      <Button title="BACK TO HOME" variant="outline" onPress={() => router.replace(`/c/${communityId}`)} />
    </Screen>
  );
}
