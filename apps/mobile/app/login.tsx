import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Field, InlineError, Screen } from '@/components/ui';
import { api, messageOf } from '@/lib/api';
import { completeSignIn } from '@/lib/after-login';

/** Screen 4 — Login. */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await completeSignIn(await api.auth.login({ email: email.trim(), password }));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
      <InlineError message={error} />
      <Button title="LOG IN" large loading={busy} disabled={!email || !password} onPress={submit} />
      <Button title="Forgot password?" variant="ghost" onPress={() => router.push('/forgot-password')} />
    </Screen>
  );
}
