import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { colors } from '@/lib/theme';

/** Screen 2 — Welcome. */
export default function Welcome() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface, padding: 24, justifyContent: 'space-between' }}>
      <View style={{ marginTop: 48, gap: 16, alignItems: 'center' }}>
        <View style={{ backgroundColor: colors.emergency, borderRadius: 999, padding: 22 }}>
          <Ionicons name="shield-checkmark" size={56} color="#fff" />
        </View>
        <Text accessibilityRole="header" style={{ fontSize: 34, fontWeight: '900', color: colors.ink }}>
          EMCOM
        </Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink, textAlign: 'center' }}>Your Community&apos;s Emergency Network.</Text>
        <Text style={{ fontSize: 16, color: colors.inkMuted, textAlign: 'center', lineHeight: 23 }}>
          Report emergencies, alert your whole community in seconds, and follow updates until everything is resolved.
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        <Button title="CREATE ACCOUNT" variant="emergency" large onPress={() => router.push('/register')} />
        <Button title="LOG IN" variant="outline" large onPress={() => router.push('/login')} />
        <Text style={{ fontSize: 12, color: colors.inkMuted, textAlign: 'center' }}>
          EMCOM is not a replacement for police, fire, ambulance or other emergency services.
        </Text>
      </View>
    </SafeAreaView>
  );
}
