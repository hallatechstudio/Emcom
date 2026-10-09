import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Limits } from '@emcom/shared-types';
import { Body, Button, Field, InlineError, Screen } from '@/components/ui';
import { api, messageOf } from '@/lib/api';
import { completeSignIn } from '@/lib/after-login';
import { useState } from 'react';

const schema = z.object({
  fullName: z.string().trim().min(Limits.fullName.min, 'Enter your full name').max(Limits.fullName.max),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().regex(/^\+?[0-9\s()-]{7,20}$/, 'Enter a valid phone number'),
  password: z
    .string()
    .min(Limits.password.min, `At least ${Limits.password.min} characters`)
    .regex(/(?=.*[A-Za-z])(?=.*[0-9])/, 'Use letters and numbers'),
});
type Form = z.infer<typeof schema>;

/** Screen 3 — Create Account (PRD §5). */
export default function Register() {
  const { control, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { fullName: '', email: '', phone: '', password: '' } });
  const [error, setError] = useState<string | null>(null);
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await completeSignIn(await api.auth.register(v));
    } catch (e) {
      setError(messageOf(e));
    }
  });
  return (
    <Screen>
      <Body muted>Create your EMCOM account. You can then create or join communities.</Body>
      {(['fullName', 'email', 'phone', 'password'] as const).map((name) => (
        <Controller
          key={name}
          control={control}
          name={name}
          render={({ field, fieldState }) => (
            <Field
              label={{ fullName: 'Full name', email: 'Email', phone: 'Phone number', password: 'Password' }[name]}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoCapitalize={name === 'fullName' ? 'words' : 'none'}
              keyboardType={name === 'email' ? 'email-address' : name === 'phone' ? 'phone-pad' : 'default'}
              secureTextEntry={name === 'password'}
              autoComplete={({ fullName: 'name', email: 'email', phone: 'tel', password: 'new-password' } as const)[name]}
              hint={name === 'password' ? `At least ${Limits.password.min} characters with letters and numbers` : undefined}
            />
          )}
        />
      ))}
      <InlineError message={error} />
      <Button title="CREATE ACCOUNT" variant="emergency" large loading={formState.isSubmitting} onPress={onSubmit} />
    </Screen>
  );
}
