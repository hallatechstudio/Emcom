'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Printer, RefreshCw, Share2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { CommunityType, CommunityTypeLabel, isValidWhatsAppGroupUrl, type CommunityDto } from '@emcom/shared-types';
import { useCommunityRole } from '@/components/console/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState, InlineError, LoadingBlock } from '@/components/ui/feedback';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

export default function SettingsPage() {
  const { communityId } = useParams<{ communityId: string }>();
  const q = useQuery({ queryKey: ['community', communityId, 'details'], queryFn: () => api.communities.get(communityId) });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Community settings</h1>
      <CodeCard c={q.data!} />
      <DetailsCard c={q.data!} />
      <IdentificationCard c={q.data!} />
    </div>
  );
}

function useSave(communityId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['community', communityId] });
    void qc.invalidateQueries({ queryKey: ['mine'] });
  };
}

function CodeCard({ c }: { c: CommunityDto }) {
  const { isOwner } = useCommunityRole(c.id);
  const saved = useSave(c.id);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const rotate = useMutation({ mutationFn: () => api.communities.rotateCode(c.id), onSuccess: () => (setConfirm(false), saved()) });
  const code = c.inviteCode ?? '';
  const shareText = `Join ${c.name} on EMCOM (emergency alerts). Community code: ${code}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Community code &amp; QR</CardTitle>
        <CardDescription>Members join with this code and wait for approval. Regenerating it never removes existing members.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="rounded-lg border bg-white p-4" aria-label={`QR code for community code ${code}`}>
          <QRCodeSVG value={`emcom://join?code=${code}`} size={168} level="M" />
        </div>
        <div className="grid gap-3">
          <p className="font-mono text-4xl font-bold tracking-widest" aria-label={`Community code ${code.split('').join(' ')}`}>
            {code}
          </p>
          <p className="text-xs text-muted-foreground">Last regenerated {formatDateTime(c.inviteCodeRotatedAt)}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Copy className="h-4 w-4" aria-hidden /> {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              variant="outline"
              onClick={() => (navigator.share ? navigator.share({ text: shareText }).catch(() => undefined) : navigator.clipboard.writeText(shareText))}
            >
              <Share2 className="h-4 w-4" aria-hidden /> Share
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> Print
            </Button>
            {isOwner ? (
              <Button variant="destructive" onClick={() => setConfirm(true)}>
                <RefreshCw className="h-4 w-4" aria-hidden /> Regenerate
              </Button>
            ) : null}
          </div>
          {!isOwner ? <p className="text-xs text-muted-foreground">Only the community owner can regenerate the code.</p> : null}
        </div>
      </CardContent>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate community code?</DialogTitle>
            <DialogDescription>The current code {code} stops working immediately. Existing members are not affected.</DialogDescription>
          </DialogHeader>
          <InlineError error={rotate.error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={rotate.isPending} onClick={() => rotate.mutate()}>
              Regenerate code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DetailsCard({ c }: { c: CommunityDto }) {
  const { isOwner } = useCommunityRole(c.id);
  const saved = useSave(c.id);
  const [form, setForm] = useState({ name: c.name, type: c.type, location: c.location, description: c.description, whatsappUrl: c.whatsappUrl ?? '' });
  useEffect(() => setForm({ name: c.name, type: c.type, location: c.location, description: c.description, whatsappUrl: c.whatsappUrl ?? '' }), [c]);
  const whatsappInvalid = form.whatsappUrl.trim() !== '' && !isValidWhatsAppGroupUrl(form.whatsappUrl.trim());
  const save = useMutation({
    mutationFn: () =>
      api.communities.update(c.id, {
        ...(isOwner ? { name: form.name.trim(), type: form.type, location: form.location.trim() } : {}),
        description: form.description.trim(),
        whatsappUrl: form.whatsappUrl.trim() || null,
      }),
    onSuccess: saved,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Community details</CardTitle>
        <CardDescription>{isOwner ? 'You are the owner.' : 'Name, type and location can only be changed by the owner.'}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!whatsappInvalid) save.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="name">Community name</Label>
            <Input id="name" value={form.name} disabled={!isOwner} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={80} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="type">Type</Label>
            <Select id="type" value={form.type} disabled={!isOwner} onChange={(e) => setForm({ ...form, type: e.target.value as CommunityType })}>
              {Object.values(CommunityType).map((t) => (
                <option key={t} value={t}>
                  {CommunityTypeLabel[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="location">Location</Label>
            <Input id="location" value={form.location} disabled={!isOwner} onChange={(e) => setForm({ ...form, location: e.target.value })} required minLength={2} maxLength={160} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="wa">Official WhatsApp group link (optional)</Label>
            <Input id="wa" placeholder="https://chat.whatsapp.com/…" value={form.whatsappUrl} onChange={(e) => setForm({ ...form, whatsappUrl: e.target.value })} aria-invalid={whatsappInvalid} />
            {whatsappInvalid ? <p className="text-xs text-emergency">Use a WhatsApp group invite link starting with https://chat.whatsapp.com/</p> : <p className="text-xs text-muted-foreground">Shown to members as “Open community WhatsApp”. EMCOM never posts to WhatsApp.</p>}
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={save.isPending || whatsappInvalid}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </Button>
            {save.isSuccess ? <span className="text-sm text-safe">Saved</span> : null}
            <InlineError error={save.error} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function IdentificationCard({ c }: { c: CommunityDto }) {
  const { isOwner } = useCommunityRole(c.id);
  const saved = useSave(c.id);
  const [label, setLabel] = useState(c.identificationField?.label ?? '');
  const [required, setRequired] = useState(c.identificationField?.required ?? false);
  const save = useMutation({
    mutationFn: () => api.communities.setIdentificationField(c.id, label.trim() ? { label: label.trim(), required } : null),
    onSuccess: saved,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Member identification field</CardTitle>
        <CardDescription>What members enter when joining — e.g. Block / Apartment, Branch / Cell, Department, Hostel / Room.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="idlabel">Field name</Label>
            <Input id="idlabel" placeholder="Block / Apartment" maxLength={40} value={label} disabled={!isOwner} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={required} disabled={!isOwner || !label.trim()} onChange={(e) => setRequired(e.target.checked)} />
            Required
          </label>
          {isOwner ? (
            <Button type="submit" disabled={save.isPending}>
              {label.trim() ? 'Save field' : 'Remove field'}
            </Button>
          ) : null}
        </form>
        {!isOwner ? <p className="mt-2 text-xs text-muted-foreground">Only the community owner can change the identification field.</p> : null}
        <InlineError error={save.error} />
        {save.isSuccess ? <p className="mt-2 text-sm text-safe">Saved</p> : null}
      </CardContent>
    </Card>
  );
}
