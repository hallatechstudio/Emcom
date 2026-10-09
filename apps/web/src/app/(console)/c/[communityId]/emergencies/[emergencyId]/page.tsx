'use client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Image as ImageIcon, MapPin, Megaphone, Send, Video } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { newIdempotencyKey } from '@emcom/api-client';
import { EmergencyEventLabel, Limits, type EmergencyDto } from '@emcom/shared-types';
import { PathwayBadge, StatusBadge } from '@/components/console/emergency-bits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, InlineError, LoadingBlock } from '@/components/ui/feedback';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn, emergencyTitle, formatDateTime, formatTime } from '@/lib/utils';

export default function EmergencyDetailPage() {
  const { communityId, emergencyId } = useParams<{ communityId: string; emergencyId: string }>();
  const key = ['community', communityId, 'emergency', emergencyId];
  const q = useQuery({ queryKey: key, queryFn: () => api.emergencies.get(communityId, emergencyId) });

  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const e = q.data!;

  return (
    <div className="grid gap-6">
      <Link href={`/c/${communityId}/emergencies?tab=${e.status}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to emergencies
      </Link>
      <Summary e={e} communityId={communityId} />
      {e.status === 'PENDING' ? <PendingActions e={e} communityId={communityId} /> : null}
      {e.status === 'ACTIVE' ? <ActiveActions e={e} communityId={communityId} /> : null}
      {e.alert ? <Acknowledgments e={e} communityId={communityId} /> : null}
      <Timeline communityId={communityId} emergencyId={emergencyId} />
    </div>
  );
}

function Summary({ e, communityId }: { e: EmergencyDto; communityId: string }) {
  return (
    <Card className={cn(e.status === 'ACTIVE' && 'border-emergency')}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={e.status} />
          <PathwayBadge e={e} />
          {e.additionalTriggerCount > 0 ? <Badge variant="danger">Triggered {e.additionalTriggerCount + 1}× by members</Badge> : null}
        </div>
        <h1 className="text-2xl font-bold">{emergencyTitle(e)}</h1>
        <p className="flex items-center gap-1 text-muted-foreground">
          <MapPin className="h-4 w-4" aria-hidden /> {e.location ?? 'Location not provided'}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {e.description ? <p className="whitespace-pre-wrap">{e.description}</p> : null}
        {e.instructions ? (
          <div className="rounded-md bg-caution-soft p-3 text-sm">
            <p className="font-semibold text-caution">Instructions to members</p>
            <p>{e.instructions}</p>
          </div>
        ) : null}
        {e.status === 'RESOLVED' ? (
          <div className="rounded-md bg-safe-soft p-3 text-sm">
            <p className="font-semibold text-safe">Resolution — {formatDateTime(e.resolvedAt)}</p>
            <p>{e.resolutionMessage}</p>
          </div>
        ) : null}
        {e.status === 'DISMISSED' ? (
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-semibold">Dismissed {formatDateTime(e.dismissedAt)}</p>
            <p>{e.dismissalReason ?? 'No reason recorded.'} This report was not broadcast to members.</p>
          </div>
        ) : null}
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Reported</dt>
            <dd className="font-medium">{formatDateTime(e.reportedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reported by</dt>
            <dd className="font-medium">{e.reporter?.fullName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Community alerted</dt>
            <dd className="font-medium">{e.alert ? `${formatDateTime(e.alert.broadcastAt)} · ${e.alert.recipientCount} members` : 'Not broadcast'}</dd>
          </div>
        </dl>
        {e.media.length ? <MediaList e={e} communityId={communityId} /> : null}
        {e.latestUpdate ? (
          <div className="rounded-md border p-3 text-sm">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Latest update — {formatTime(e.latestUpdate.createdAt)}</p>
            <p>{e.latestUpdate.message}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MediaList({ e, communityId }: { e: EmergencyDto; communityId: string }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  async function open(mediaId: string) {
    try {
      const { url } = await api.media.downloadUrl(communityId, mediaId);
      setUrls((u) => ({ ...u, [mediaId]: url }));
    } catch (err) {
      setError(err);
    }
  }
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold">Attachments</p>
      <div className="flex flex-wrap gap-3">
        {e.media.map((m) =>
          urls[m.id] ? (
            m.kind === 'VIDEO' ? (
              <video key={m.id} src={urls[m.id]} controls className="h-48 rounded-md border" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m.id} src={urls[m.id]} alt="Attachment from the emergency report" className="h-48 rounded-md border object-cover" />
            )
          ) : (
            <Button key={m.id} variant="outline" onClick={() => void open(m.id)}>
              {m.kind === 'VIDEO' ? <Video className="h-4 w-4" aria-hidden /> : <ImageIcon className="h-4 w-4" aria-hidden />}
              View {m.kind === 'VIDEO' ? 'video' : 'photo'} ({Math.ceil(m.sizeBytes / 1024)} KB)
            </Button>
          ),
        )}
      </div>
      <InlineError error={error} />
    </div>
  );
}

function useInvalidate(communityId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['community', communityId] });
}

function PendingActions({ e, communityId }: { e: EmergencyDto; communityId: string }) {
  const invalidate = useInvalidate(communityId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [reason, setReason] = useState('');
  const overview = useQuery({ queryKey: ['community', communityId, 'overview'], queryFn: () => api.admin.overview(communityId) });
  const confirm = useMutation({
    mutationFn: () => api.emergencies.confirm(communityId, e.id, instructions.trim() || undefined),
    onSuccess: () => {
      setConfirmOpen(false);
      void invalidate();
    },
  });
  const dismiss = useMutation({
    mutationFn: () => api.emergencies.dismiss(communityId, e.id, reason.trim() || undefined),
    onSuccess: () => {
      setDismissOpen(false);
      void invalidate();
    },
  });

  return (
    <Card className="border-caution">
      <CardHeader>
        <CardTitle>Review this report</CardTitle>
        <CardDescription>Confirm to alert every approved member of this community, or dismiss to keep it in admin history only.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        <Button variant="destructive" size="lg" onClick={() => setConfirmOpen(true)}>
          <Megaphone className="h-5 w-5" aria-hidden /> CONFIRM &amp; BROADCAST
        </Button>
        <Button variant="outline" size="lg" onClick={() => setDismissOpen(true)}>
          DISMISS
        </Button>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm &amp; broadcast this emergency?</DialogTitle>
            <DialogDescription>
              This immediately alerts all {overview.data?.memberCount ?? 'approved'} approved members with a high-priority notification. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="instructions">Instructions for members (optional)</Label>
            <Textarea id="instructions" maxLength={500} placeholder="e.g. Avoid the area and follow community instructions." value={instructions} onChange={(ev) => setInstructions(ev.target.value)} />
          </div>
          <InlineError error={confirm.error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
              {confirm.isPending ? 'Broadcasting…' : 'Yes, broadcast now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss this report?</DialogTitle>
            <DialogDescription>Members will not be alerted. The report stays in admin history.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="reason">Reason (admins only)</Label>
            <Textarea id="reason" maxLength={Limits.dismissalReason.max} value={reason} onChange={(ev) => setReason(ev.target.value)} />
          </div>
          <InlineError error={dismiss.error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissOpen(false)}>
              Cancel
            </Button>
            <Button disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
              {dismiss.isPending ? 'Dismissing…' : 'Dismiss report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ActiveActions({ e, communityId }: { e: EmergencyDto; communityId: string }) {
  const invalidate = useInvalidate(communityId);
  const [message, setMessage] = useState('');
  const keyRef = useRef(newIdempotencyKey());
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState('');
  const update = useMutation({
    mutationFn: () => api.emergencies.postUpdate(communityId, e.id, message.trim(), keyRef.current),
    onSuccess: () => {
      setMessage('');
      keyRef.current = newIdempotencyKey();
      void invalidate();
    },
  });
  const resolve = useMutation({
    mutationFn: () => api.emergencies.resolve(communityId, e.id, resolution.trim()),
    onSuccess: () => {
      setResolveOpen(false);
      void invalidate();
    },
  });
  const tooShortUpdate = message.trim().length < Limits.updateMessage.min;
  const tooShortResolution = resolution.trim().length < Limits.resolutionMessage.min;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage active emergency</CardTitle>
        <CardDescription>Updates are timestamped, shown to members and sent as notifications.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="grid gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!tooShortUpdate) update.mutate();
          }}
        >
          <Label htmlFor="update">Send update</Label>
          <Textarea id="update" maxLength={Limits.updateMessage.max} placeholder="Security personnel have arrived at Gate 2. Please remain indoors." value={message} onChange={(ev) => setMessage(ev.target.value)} />
          <InlineError error={update.error} />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button type="submit" disabled={update.isPending || tooShortUpdate}>
              <Send className="h-4 w-4" aria-hidden /> {update.isPending ? 'Sending…' : 'Send update'}
            </Button>
            <Button type="button" variant="success" onClick={() => setResolveOpen(true)}>
              RESOLVE EMERGENCY
            </Button>
          </div>
        </form>
      </CardContent>
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve emergency</DialogTitle>
            <DialogDescription>All members are notified and the incident moves to history. This cannot be reopened.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="resolution">Resolution message (required)</Label>
            <Textarea id="resolution" maxLength={Limits.resolutionMessage.max} placeholder="Security personnel responded and the situation has been resolved." value={resolution} onChange={(ev) => setResolution(ev.target.value)} />
          </div>
          <InlineError error={resolve.error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>
              Cancel
            </Button>
            <Button variant="success" disabled={resolve.isPending || tooShortResolution} onClick={() => resolve.mutate()}>
              {resolve.isPending ? 'Resolving…' : 'CONFIRM RESOLUTION'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const PUSH_LABEL: Record<string, string> = {
  PROVIDER_ACCEPTED: 'Accepted by push service',
  QUEUED: 'Queued',
  FAILED: 'Push failed',
  INVALID_TOKEN: 'Device unregistered',
  SKIPPED: 'Skipped',
  NO_DEVICE: 'No registered device',
};

function Acknowledgments({ e, communityId }: { e: EmergencyDto; communityId: string }) {
  const [filter, setFilter] = useState<'all' | 'acknowledged' | 'not_acknowledged'>('all');
  const [search, setSearch] = useState('');
  const summary = useQuery({
    queryKey: ['community', communityId, 'emergency', e.id, 'acks'],
    queryFn: () => api.emergencies.ackSummary(communityId, e.id),
    refetchInterval: e.status === 'ACTIVE' ? 15_000 : false,
  });
  const recipients = useInfiniteQuery({
    queryKey: ['community', communityId, 'emergency', e.id, 'recipients', filter, search],
    queryFn: ({ pageParam }) =>
      api.emergencies.ackRecipients(communityId, e.id, { filter: filter === 'all' ? undefined : filter, q: search || undefined, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const s = summary.data;
  const rows = recipients.data?.pages.flatMap((p) => p.items) ?? [];
  const delivery = s ? Object.entries(s.delivery) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Acknowledgments</CardTitle>
        <CardDescription>
          Acknowledged means the member opened the alert and tapped &quot;Acknowledge&quot;. It does not confirm their safety, and push acceptance
          does not prove the device displayed the alert.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {summary.error ? <ErrorState error={summary.error} /> : null}
        {s ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <p className="text-4xl font-bold tabular-nums" aria-live="polite">
              {s.acknowledgedCount} / {s.recipientCount} <span className="text-base font-semibold text-muted-foreground">ACKNOWLEDGED</span>
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="success">Acknowledged {s.acknowledgedCount}</Badge>
              <Badge variant="warning">Not acknowledged {s.notAcknowledgedCount}</Badge>
              {delivery.map(([k, v]) => (
                <Badge key={k} variant="outline">
                  {PUSH_LABEL[k] ?? k}: {v}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        {s ? (
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full bg-safe" style={{ width: `${s.recipientCount ? (s.acknowledgedCount / s.recipientCount) * 100 : 0}%` }} />
          </div>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Filter recipients">
            {(['all', 'not_acknowledged', 'acknowledged'] as const).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn('min-h-9 rounded-md px-3 text-sm', filter === f ? 'bg-background font-semibold shadow' : 'text-muted-foreground')}>
                {f === 'all' ? 'All' : f === 'acknowledged' ? 'Acknowledged' : 'Not acknowledged'}
              </button>
            ))}
          </div>
          <Input aria-label="Search recipients" placeholder="Search name or identification…" value={search} onChange={(ev) => setSearch(ev.target.value)} className="sm:max-w-xs" />
        </div>
        {recipients.isLoading ? <LoadingBlock /> : null}
        {recipients.error ? <ErrorState error={recipients.error} /> : null}
        {rows.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Identification</TH>
                <TH>Acknowledged</TH>
                <TH>Push status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.userId}>
                  <TD className="font-medium">
                    {r.fullName}
                    {r.addedAfterBroadcast ? <span className="ml-2 text-xs text-muted-foreground">(joined after alert)</span> : null}
                    {r.membershipStatus !== 'APPROVED' ? <Badge className="ml-2">{r.membershipStatus.toLowerCase()}</Badge> : null}
                  </TD>
                  <TD>{r.identificationValue ?? '—'}</TD>
                  <TD>{r.acknowledgedAt ? <span className="text-safe">✓ {formatTime(r.acknowledgedAt)}</span> : <span className="text-caution">Not yet</span>}</TD>
                  <TD className="text-muted-foreground">{PUSH_LABEL[r.pushState ?? 'NO_DEVICE']}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : !recipients.isLoading ? (
          <EmptyState title="No recipients match" />
        ) : null}
        {recipients.hasNextPage ? (
          <Button variant="outline" onClick={() => void recipients.fetchNextPage()}>
            Load more
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Timeline({ communityId, emergencyId }: { communityId: string; emergencyId: string }) {
  const q = useQuery({
    queryKey: ['community', communityId, 'emergency', emergencyId, 'timeline'],
    queryFn: () => api.emergencies.timeline(communityId, emergencyId),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Emergency timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? <LoadingBlock /> : null}
        {q.error ? <ErrorState error={q.error} /> : null}
        <ol className="relative grid gap-4 border-l pl-6">
          {q.data?.map((ev) => (
            <li key={ev.id} className="relative">
              <span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" aria-hidden />
              <p className="text-xs font-semibold tabular-nums text-muted-foreground">{formatDateTime(ev.createdAt)}</p>
              <p className="font-medium">{EmergencyEventLabel[ev.type]}</p>
              {ev.actor ? <p className="text-xs text-muted-foreground">by {ev.actor.fullName}</p> : null}
              {ev.message ? <p className="text-sm">{ev.message}</p> : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
