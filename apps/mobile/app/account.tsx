import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Limits } from '@emcom/shared-types';
import { Body, Button, Card, Field, H1, InlineError, Screen } from '@/components/ui';
import { api, messageOf } from '@/lib/api';
import { getPermission } from '@/lib/notifications';
import { useSession } from '@/lib/session-store';
import { confirmSignOut } from '@/lib/sign-out';
import { colors } from '@/lib/theme';

/** Account screen reachable from My Communities — works even before joining any community. */
export default function Account() {
  const user = useSession((s) => s.user);
  const qc = useQueryClient();
  const perm = useQuery({ queryKey: ['notif-permission'], queryFn: getPermission });
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const weak = next.length > 0 && (next.length < Limits.password.min || !/[A-Za-z]/.test(next) || !/[0-9]/.test(next));
  const mismatch = confirm.length > 0 && confirm !== next;
  const change = useMutation({
    mutationFn: () => api.me.changePassword({ currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setConfirm('');
    },
  });
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
      <Card>
        <Body style={{ fontWeight: '800' }}>Change password</Body>
        <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
        <Field
          label="New password"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoComplete="new-password"
          error={weak ? `At least ${Limits.password.min} characters with letters and numbers` : undefined}
        />
        <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" error={mismatch ? 'Passwords do not match' : undefined} />
        <InlineError message={change.error ? messageOf(change.error) : null} />
        {change.isSuccess ? <Body style={{ color: colors.safe, fontWeight: '700' }}>Password changed. Other devices have been signed out.</Body> : null}
        <Button
          title="CHANGE PASSWORD"
          variant="outline"
          loading={change.isPending}
          disabled={!current || !next || weak || mismatch || confirm !== next}
          onPress={() => change.mutate()}
        />
      </Card>
      <Body muted>To edit your name or phone, open any of your communities and go to the Profile tab.</Body>
      <Button testID="sign-out" title="SIGN OUT" variant="outline" icon="log-out-outline" onPress={() => confirmSignOut(qc)} />
    </Screen>
  );
}
