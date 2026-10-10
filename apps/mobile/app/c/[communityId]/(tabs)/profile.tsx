import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { Body, Button, Card, Field, H1, InlineError, Screen } from '@/components/ui';
import { useCommunity } from '@/hooks/queries';
import { api, messageOf } from '@/lib/api';
import { getPermission, registerDevice, requestPermission } from '@/lib/notifications';
import { useSession } from '@/lib/session-store';
import { confirmSignOut } from '@/lib/sign-out';

/** Screen 22 — Profile: account, notification status/guidance, membership, sign out. */
export default function Profile() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const { membership, community } = useCommunity(communityId);
  const user = useSession((s) => s.user);
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const perm = useQuery({ queryKey: ['notif-permission'], queryFn: getPermission });
  useEffect(() => {
    setFullName(user?.fullName ?? '');
    setPhone(user?.phone ?? '');
  }, [user]);

  const save = useMutation({ mutationFn: () => api.me.update({ fullName: fullName.trim(), phone: phone.trim() }), onSuccess: (u) => useSession.getState().setUser(u) });
  const leave = useMutation({
    mutationFn: () => api.communities.leave(communityId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['mine'] });
      router.replace('/communities');
    },
  });

  return (
    <Screen>
      <H1>{user?.fullName}</H1>
      <Body muted>{user?.email}</Body>
      <Card>
        <Field label="Full name" value={fullName} onChangeText={setFullName} />
        <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <InlineError message={save.error ? messageOf(save.error) : null} />
        <Button title={save.isSuccess ? 'Saved' : 'Save profile'} variant="outline" loading={save.isPending} onPress={() => save.mutate()} />
      </Card>

      <Card tone={perm.data === 'granted' ? 'safe' : 'caution'}>
        <Body style={{ fontWeight: '800' }}>Emergency notifications: {perm.data === 'granted' ? 'ON' : 'OFF'}</Body>
        {perm.data === 'granted' ? (
          <Body muted>Tip: allow EMCOM in Focus / Do Not Disturb settings so emergency alerts can reach you. EMCOM cannot override these settings itself.</Body>
        ) : (
          <Body>You will only see alerts while the app is open.</Body>
        )}
        {perm.data === 'undetermined' ? (
          <Button title="Turn on notifications" onPress={async () => (await requestPermission()) === 'granted' && (await registerDevice(), perm.refetch())} />
        ) : (
          <Button title="Open notification settings" variant="outline" icon="settings-outline" onPress={() => void Linking.openSettings()} />
        )}
      </Card>

      {community && membership ? (
        <Card>
          <Body style={{ fontWeight: '800' }}>{community.name}</Body>
          <Body muted>
            Role: {membership.role.toLowerCase()}
            {membership.identificationValue ? ` · ${community.identificationField?.label ?? 'ID'}: ${membership.identificationValue}` : ''}
          </Body>
          {membership.role !== 'OWNER' ? (
            <Button
              title="Leave community"
              variant="outline"
              loading={leave.isPending}
              onPress={() =>
                Alert.alert('Leave community?', `You will stop receiving emergency alerts from ${community.name}.`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Leave', style: 'destructive', onPress: () => leave.mutate() },
                ])
              }
            />
          ) : null}
        </Card>
      ) : null}
      <Button title="My communities" variant="outline" onPress={() => router.navigate('/communities')} />
      <Button testID="sign-out" title="SIGN OUT" variant="outline" icon="log-out-outline" onPress={() => confirmSignOut(qc)} />
      <Body muted style={{ fontSize: 12, textAlign: 'center' }}>
        EMCOM is not a replacement for police, fire, ambulance or other emergency services.
      </Body>
    </Screen>
  );
}
