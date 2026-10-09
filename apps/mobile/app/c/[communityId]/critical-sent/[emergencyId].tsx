import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WhatsAppButton } from '@/components/emergency';
import { Button } from '@/components/ui';
import { useCommunity } from '@/hooks/queries';
import { colors, space } from '@/lib/theme';

/**
 * Screen 15 — Critical Alert Sent (PRD §14). States honestly what happened: the alert is recorded
 * and delivery has started; EMCOM cannot know that every phone displayed it.
 */
export default function CriticalSent() {
  const { communityId, emergencyId, coalesced } = useLocalSearchParams<{ communityId: string; emergencyId: string; coalesced?: string }>();
  const { community } = useCommunity(communityId);
  const merged = coalesced === '1';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.emergency }}>
      <ScrollView contentContainerStyle={{ padding: space(5), gap: space(4), flexGrow: 1, justifyContent: 'space-between' }}>
        <View style={{ alignItems: 'center', gap: space(3), marginTop: space(8) }}>
          <Ionicons name="warning" size={80} color="#fff" />
          <Text accessibilityRole="header" style={{ color: '#fff', fontSize: 40, fontWeight: '900' }}>
            EMERGENCY!
          </Text>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{community?.name}</Text>
          <Text accessibilityLiveRegion="assertive" style={{ color: '#fff', fontSize: 19, fontWeight: '700', textAlign: 'center' }}>
            {merged ? 'A critical alert is already active for your community. Your alert was added to it.' : 'A critical alert has been sent to your community.'}
          </Text>
          <Text style={{ color: '#fff', fontSize: 14, textAlign: 'center', opacity: 0.95 }}>
            EMCOM is notifying every approved member now. Some phones may be offline or silenced — if lives are at risk, also call emergency services.
          </Text>
        </View>
        <View style={{ gap: space(3) }}>
          <WhatsAppButton url={community?.whatsappUrl} />
          <Button title="VIEW ALERT" variant="outline" onPress={() => router.replace(`/c/${communityId}/emergency/${emergencyId}`)} />
          <Button title="BACK TO HOME" variant="ghost" onPress={() => router.replace(`/c/${communityId}`)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
