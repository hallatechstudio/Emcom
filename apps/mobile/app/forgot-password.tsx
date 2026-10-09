import { router } from 'expo-router';
import { useState } from 'react';
import { Body, Button, Field, InlineError, Screen } from '@/components/ui';
import { api, messageOf } from '@/lib/api';

export default function ForgotPassword() {
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  if (step === 'email')
    return (
      <Screen>
        <Body>We will email you a reset code if an account exists for this address.</Body>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <InlineError message={error} />
        <Button title="SEND CODE" large loading={busy} disabled={!email} onPress={() => run(async () => (await api.auth.forgotPassword(email.trim()), setStep('reset')))} />
      </Screen>
    );
  return (
    <Screen>
      <Field label="Reset code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
      <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <InlineError message={error} />
      <Button
        title="RESET PASSWORD"
        large
        loading={busy}
        onPress={() =>
          run(async () => {
            await api.auth.resetPassword({ email: email.trim(), code, newPassword: password });
            router.replace('/login');
          })
        }
      />
    </Screen>
  );
}
