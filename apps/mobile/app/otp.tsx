import { router } from 'expo-router';
import { useState } from 'react';
import { Body, Button, Field, InlineError, Screen } from '@/components/ui';
import { api, messageOf } from '@/lib/api';
import { continueAfterVerified } from '@/lib/after-login';
import { useSession } from '@/lib/session-store';

/** Screen 5 — OTP (email verification code). */
export default function Otp() {
  const user = useSession((s) => s.user);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const u = await api.auth.verifyEmail(code);
      useSession.getState().setUser(u);
      await continueAfterVerified();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setError(null);
    try {
      await api.auth.resendVerification();
      setInfo('A new code has been sent.');
    } catch (e) {
      setError(messageOf(e));
    }
  }
  return (
    <Screen>
      <Body>Enter the 6-digit code we emailed to {user?.email ?? 'you'}.</Body>
      <Field label="Verification code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} />
      <InlineError message={error} />
      {info ? <Body muted>{info}</Body> : null}
      <Button title="VERIFY" large loading={busy} disabled={code.length !== 6} onPress={verify} />
      <Button title="Resend code" variant="outline" onPress={resend} />
      <Button
        title="Use a different account"
        variant="ghost"
        onPress={async () => {
          await useSession.getState().clear();
          router.replace('/welcome');
        }}
      />
    </Screen>
  );
}
