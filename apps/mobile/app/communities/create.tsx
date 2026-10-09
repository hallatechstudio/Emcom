import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, Switch, Text, View } from 'react-native';
import { z } from 'zod';
import { CommunityType, CommunityTypeLabel, isValidWhatsAppGroupUrl, Limits } from '@emcom/shared-types';
import { Body, Button, Field, InlineError, Screen, styles } from '@/components/ui';
import { api, messageOf } from '@/lib/api';
import { colors, radius, space } from '@/lib/theme';

const schema = z.object({
  name: z.string().trim().min(Limits.communityName.min, 'Enter a name').max(Limits.communityName.max),
  type: z.nativeEnum(CommunityType),
  location: z.string().trim().min(Limits.location.min, 'Enter a location').max(Limits.location.max),
  description: z.string().trim().max(Limits.description.max),
  idLabel: z.string().trim().max(Limits.identificationLabel.max),
  idRequired: z.boolean(),
  whatsappUrl: z.string().trim().refine((v) => v === '' || isValidWhatsAppGroupUrl(v), 'Use a https://chat.whatsapp.com/… group link'),
});
type Form = z.infer<typeof schema>;

const ID_SUGGESTIONS: Partial<Record<CommunityType, string>> = {
  ESTATE: 'Block / Apartment',
  APARTMENT_COMPLEX: 'Block / Apartment',
  CHURCH: 'Branch / Cell',
  WORKPLACE: 'Department',
  SCHOOL: 'Hostel / Room',
  HOTEL: 'Room',
};

/** Screen 7 — Create Community (PRD §6–7). The creator becomes Owner + Admin. */
export default function CreateCommunity() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, watch, setValue, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', type: 'ESTATE', location: '', description: '', idLabel: 'Block / Apartment', idRequired: true, whatsappUrl: '' },
  });
  const type = watch('type');
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      const res = await api.communities.create({
        name: v.name,
        type: v.type,
        location: v.location,
        description: v.description || undefined,
        identificationField: v.idLabel.length >= 2 ? { label: v.idLabel, required: v.idRequired } : undefined,
        whatsappUrl: v.whatsappUrl || undefined,
      });
      await qc.invalidateQueries({ queryKey: ['mine'] });
      router.replace(`/c/${res.community.id}/admin/code`);
    } catch (e) {
      setError(messageOf(e));
    }
  });

  return (
    <Screen>
      <Controller control={control} name="name" render={({ field, fieldState }) => <Field label="Community name" placeholder="Jacob Mews" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
      <Text style={styles.label}>Community type</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }} accessibilityRole="radiogroup">
        {Object.values(CommunityType).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="radio"
            accessibilityState={{ selected: type === t }}
            onPress={() => {
              setValue('type', t);
              const s = ID_SUGGESTIONS[t];
              if (s) setValue('idLabel', s);
            }}
            style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1.5, borderColor: type === t ? colors.primary : colors.line, backgroundColor: type === t ? colors.primary : colors.surface }}
          >
            <Text style={{ color: type === t ? '#fff' : colors.ink, fontWeight: '700' }}>{CommunityTypeLabel[t]}</Text>
          </Pressable>
        ))}
      </View>
      <Controller control={control} name="location" render={({ field, fieldState }) => <Field label="Location" placeholder="Lagos, Nigeria" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
      <Controller control={control} name="description" render={({ field }) => <Field label="Description" multiline value={field.value} onChangeText={field.onChange} />} />
      <Body style={{ fontWeight: '800', marginTop: space(2) }}>Member identification</Body>
      <Body muted>What members enter when they join, so admins know who and where they are.</Body>
      <Controller control={control} name="idLabel" render={({ field }) => <Field label="Field name" value={field.value} onChangeText={field.onChange} hint="Leave empty for no identification field" />} />
      <Controller
        control={control}
        name="idRequired"
        render={({ field }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
            <Text style={styles.label}>Required when joining</Text>
            <Switch accessibilityLabel="Identification required" value={field.value} onValueChange={field.onChange} />
          </View>
        )}
      />
      <Controller
        control={control}
        name="whatsappUrl"
        render={({ field, fieldState }) => (
          <Field label="Official WhatsApp group link (optional)" placeholder="https://chat.whatsapp.com/…" autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} hint="For discussion only. EMCOM handles the emergency alerts." />
        )}
      />
      <InlineError message={error} />
      <Button title="CREATE COMMUNITY" large loading={formState.isSubmitting} onPress={submit} />
    </Screen>
  );
}
