import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Body, Screen } from '@/components/ui';
import { useCommunity } from '@/hooks/queries';
import { colors } from '@/lib/theme';

/** Screen 13 — Critical Alert. One action, no category. Pressing it only opens the confirmation. */
export default function CriticalAlert() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const { community } = useCommunity(communityId);
  return (
    <Screen>
      <Body style={{ textAlign: 'center' }}>
        Use when you see a fire, security threat, explosion or serious medical situation and everyone in {community?.name ?? 'the community'} must know now.
      </Body>
      <View style={{ alignItems: 'center', marginVertical: 24 }}>
        <Pressable
          testID="critical-big-button"
          accessibilityRole="button"
          accessibilityLabel={`Critical alert for ${community?.name ?? 'this community'}`}
          accessibilityHint="Opens a confirmation screen. Nothing is sent yet."
          onPress={() => router.replace(`/c/${communityId}/critical-confirm`)}
          style={({ pressed }) => ({ width: 240, height: 240, borderRadius: 120, backgroundColor: colors.emergency, alignItems: 'center', justifyContent: 'center', borderWidth: 8, borderColor: colors.emergencyDark, opacity: pressed ? 0.85 : 1 })}
        >
          <Ionicons name="alert-circle" size={64} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center' }}>CRITICAL{'\n'}ALERT</Text>
        </Pressable>
      </View>
      <Body muted style={{ textAlign: 'center' }}>No admin approval is needed. Misuse is logged and can lead to suspension.</Body>
    </Screen>
  );
}
