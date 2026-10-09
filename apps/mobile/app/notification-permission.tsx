import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Body, Button, Card, H1, Screen } from '@/components/ui';
import { registerDevice, requestPermission } from '@/lib/notifications';
import { colors } from '@/lib/theme';

/** Permission education shown before the OS prompt. Honest about what notifications can and cannot do. */
export default function NotificationPermission() {
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const next = () => router.replace('/communities');
  async function allow() {
    setBusy(true);
    const state = await requestPermission().catch(() => 'denied' as const);
    setBusy(false);
    if (state === 'granted') {
      await registerDevice().catch(() => undefined);
      next();
    } else setDenied(true);
  }
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <Ionicons name="notifications" size={56} color={colors.emergency} />
        <H1 style={{ textAlign: 'center' }}>Turn on emergency alerts</H1>
      </View>
      <Body>EMCOM sends a high-priority notification when an emergency is confirmed or a Critical Alert is raised in your communities.</Body>
      <Card tone="caution">
        <Body style={{ fontWeight: '700' }}>Please know:</Body>
        <Body>• Silent mode, Focus or Do Not Disturb may still hide or silence alerts. You can allow EMCOM in those settings.</Body>
        <Body>• Phones that are off, offline or in battery saver can receive alerts late or not at all.</Body>
        <Body>• In danger? Always call your local emergency services.</Body>
      </Card>
      {denied ? (
        <Card tone="danger">
          <Body>Notifications are off. You will only see alerts while EMCOM is open. You can turn them on in Settings.</Body>
          <Button title="OPEN SETTINGS" variant="outline" icon="settings-outline" onPress={() => void Linking.openSettings()} />
        </Card>
      ) : null}
      <Button title="ALLOW NOTIFICATIONS" variant="emergency" large loading={busy} onPress={allow} />
      <Button title={denied ? 'Continue' : 'Not now'} variant="ghost" onPress={next} />
    </Screen>
  );
}
