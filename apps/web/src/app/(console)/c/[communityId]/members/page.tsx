'use client';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { canModerate, type MemberListItemDto, type MembershipStatus } from '@emcom/shared-types';
import { useCommunityRole } from '@/components/console/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, InlineError, LoadingBlock } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';

const TABS: { key: MembershipStatus; label: string }[] = [
  { key: 'PENDING', label: 'Requests' },
  { key: 'APPROVED', label: 'Members' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'REMOVED', label: 'Removed' },
];

type Action = 'approve' | 'reject' | 'suspend' | 'reinstate' | 'remove' | 'make-admin' | 'remove-admin';

const COPY: Record<Action, { title: string; body: string; cta: string; destructive?: boolean }> = {
  approve: { title: 'Approve request?', body: 'They will receive this community’s emergency alerts.', cta: 'Approve' },
  reject: { title: 'Reject request?', body: 'They will not be able to see incidents or receive alerts.', cta: 'Reject', destructive: true },
  suspend: { title: 'Suspend member?', body: 'They immediately stop receiving alerts and lose access until reinstated.', cta: 'Suspend', destructive: true },
  reinstate: { title: 'Reinstate member?', body: 'They will receive alerts again.', cta: 'Reinstate' },
  remove: { title: 'Remove member?', body: 'They lose access immediately. They can only return by requesting to join again.', cta: 'Remove', destructive: true },
  'make-admin': { title: 'Make administrator?', body: 'They will be able to review reports, broadcast, resolve and manage members.', cta: 'Make admin' },
  'remove-admin': { title: 'Remove administrator role?', body: 'They remain a member but lose admin access.', cta: 'Remove admin', destructive: true },
};

function MembersInner() {
  const { communityId } = useParams<{ communityId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const tab = (search.get('tab') as MembershipStatus) || 'APPROVED';
  const [q, setQ] = useState('');
  const { role, isOwner } = useCommunityRole(communityId);
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ action: Action; member: MemberListItemDto } | null>(null);

  const list = useInfiniteQuery({
    queryKey: ['community', communityId, 'members', tab, q],
    queryFn: ({ pageParam }) => api.members.list(communityId, { status: tab, q: q || undefined, cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const act = useMutation({
    mutationFn: ({ action, member }: { action: Action; member: MemberListItemDto }) =>
      action === 'make-admin'
        ? api.members.setRole(communityId, member.id, 'ADMIN')
        : action === 'remove-admin'
          ? api.members.setRole(communityId, member.id, 'MEMBER')
          : api.members.act(communityId, member.id, action),
    onSuccess: () => {
      setPending(null);
      void qc.invalidateQueries({ queryKey: ['community', communityId] });
    },
  });

  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const actionsFor = (m: MemberListItemDto): Action[] => {
    if (!role || m.role === 'OWNER') return [];
    const out: Action[] = [];
    if (m.status === 'PENDING') out.push('approve', 'reject');
    const canMod = canModerate(role, m.role);
    if (m.status === 'APPROVED' && canMod) out.push('suspend', 'remove');
    if (m.status === 'SUSPENDED' && canMod) out.push('reinstate', 'remove');
    if (isOwner && m.status === 'APPROVED') out.push(m.role === 'ADMIN' ? 'remove-admin' : 'make-admin');
    return out;
  };

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-bold">Member management</h1>
      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => router.replace(`?tab=${t.key}`)} className={cn('min-h-10 flex-1 whitespace-nowrap rounded-md px-4 text-sm font-semibold', tab === t.key ? 'bg-background shadow' : 'text-muted-foreground')}>
            {t.label}
          </button>
        ))}
      </div>
      <Input aria-label="Search members" placeholder="Search name, email, phone or identification" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
      {list.isLoading ? <LoadingBlock /> : null}
      {list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
      {!list.isLoading && rows.length === 0 ? <EmptyState title="Nobody here" /> : null}
      {rows.length ? (
        <div className="rounded-lg border bg-card">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Identification</TH>
                <TH>Contact</TH>
                <TH>Role</TH>
                <TH>{tab === 'PENDING' ? 'Requested' : 'Updated'}</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((m) => (
                <TR key={m.id}>
                  <TD className="font-medium">{m.user.fullName}</TD>
                  <TD>{m.identificationValue ?? '—'}</TD>
                  <TD className="text-xs text-muted-foreground">
                    {m.user.email}
                    <br />
                    {m.user.phone}
                  </TD>
                  <TD>
                    <Badge variant={m.role === 'MEMBER' ? 'default' : 'outline'}>{m.role}</Badge>
                  </TD>
                  <TD className="text-xs">{formatDateTime(tab === 'PENDING' ? m.requestedAt : m.updatedAt)}</TD>
                  <TD className="text-right">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {actionsFor(m).map((a) => (
                        <Button key={a} size="sm" variant={COPY[a].destructive ? 'outline' : 'default'} onClick={() => setPending({ action: a, member: m })}>
                          {COPY[a].cta}
                        </Button>
                      ))}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : null}
      {list.hasNextPage ? (
        <Button variant="outline" onClick={() => void list.fetchNextPage()}>
          Load more
        </Button>
      ) : null}

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        {pending ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{COPY[pending.action].title}</DialogTitle>
              <DialogDescription>
                <strong>{pending.member.user.fullName}</strong>
                {pending.member.identificationValue ? ` (${pending.member.identificationValue})` : ''}. {COPY[pending.action].body}
              </DialogDescription>
            </DialogHeader>
            <InlineError error={act.error} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button variant={COPY[pending.action].destructive ? 'destructive' : 'default'} disabled={act.isPending} onClick={() => act.mutate(pending)}>
                {act.isPending ? 'Working…' : COPY[pending.action].cta}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

export default function MembersPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <MembersInner />
    </Suspense>
  );
}
