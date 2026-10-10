import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Linking, View } from 'react-native';
import { Body, Button, Card, H1, Screen } from '@/components/ui';
import { getPermission } from '@/lib/notifications';
import { useSession } from '@/lib/session-store';
import { confirmSignOut } from '@/lib/sign-out';
import { colors } from '@/lib/theme';

/** Account screen reachable from My Communities — works even before joining any community. */
export default function Account() {
  const user = useSession((s) => s.user);
  const qc = useQueryClient();
  const perm = useQuery({ queryKey: ['notif-permission'], queryFn: getPermission });
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Ionicons name="person-circle" size={72} color={colors.primary} />
        <H1 style={{ textAlign: 'center' }}>{user?.fullName}</H1>
        <Body muted>{user?.email}</Body>
        <Body muted>{user?.phone}</Body>
      </View>
      <Card tone={perm.data === 'granted' ? 'safe' : 'caution'}>
        <Body style={{ fontWeight: '800' }}>Emergency notifications: {perm.data === 'granted' ? 'ON' : 'OFF'}</Body>
        <Button title="Open notification settings" variant="outline" icon="settings-outline" onPress={() => void Linking.openSettings()} />
      </Card>
      <Body muted>To edit your name or phone, open any of your communities and go to the Profile tab.</Body>
      <Button testID="sign-out" title="SIGN OUT" variant="outline" icon="log-out-outline" onPress={() => confirmSignOut(qc)} />
    </Screen>
  );
}
