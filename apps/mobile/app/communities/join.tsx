import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { CommunityTypeLabel, normalizeCommunityCode, type CommunityPreviewDto } from '@emcom/shared-types';
import { Body, Button, Card, Field, H1, InlineError, Screen } from '@/components/ui';
import { api, messageOf } from '@/lib/api';

/** Screen 8 — Join Community (PRD §9): code → preview → identification → submit. */
export default function JoinCommunity() {
  const params = useLocalSearchParams<{ code?: string }>();
  const qc = useQueryClient();
  const [code, setCode] = useState(params.code ?? '');
  const [preview, setPreview] = useState<CommunityPreviewDto | null>(null);
  const [idValue, setIdValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup() {
    setBusy(true);
    setError(null);
    try {
      setPreview(await api.communities.preview(normalizeCommunityCode(code)));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const m = await api.communities.join({ code: normalizeCommunityCode(code), identificationValue: idValue.trim() || undefined });
      await qc.invalidateQueries({ queryKey: ['mine'] });
      router.replace(`/communities/pending/${m.communityId}`);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  if (!preview)
    return (
      <Screen>
        <Body>Step 1 of 3 — Enter the community code your administrator shared.</Body>
        <Field label="Community code" placeholder="JACOB4821" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} />
        <InlineError message={error} />
        <Button title="CONTINUE" large loading={busy} disabled={normalizeCommunityCode(code).length < 4} onPress={lookup} />
      </Screen>
    );

  const field = preview.identificationField;
  const missing = !!field?.required && !idValue.trim();
  return (
    <Screen>
      <Body muted>Step 2 of 3 — Is this the right community?</Body>
      <Card>
        <H1>{preview.name}</H1>
        <Body>{CommunityTypeLabel[preview.type]}</Body>
        <Body muted>{preview.location}</Body>
        {preview.description ? <Body>{preview.description}</Body> : null}
      </Card>
      {field ? (
        <>
          <Body muted>Step 3 of 3 — {field.required ? 'Required' : 'Optional'} identification</Body>
          <Field label={field.label} placeholder="e.g. B12" value={idValue} onChangeText={setIdValue} />
        </>
      ) : null}
      <InlineError message={error} />
      <Button title="SUBMIT REQUEST" large loading={busy} disabled={missing} onPress={submit} />
      <Button title="Use a different code" variant="ghost" onPress={() => setPreview(null)} />
    </Screen>
  );
}
