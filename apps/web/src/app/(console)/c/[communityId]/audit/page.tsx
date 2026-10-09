'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

const ACTIONS = [
  'critical_alert.triggered',
  'critical_alert.coalesced',
  'critical_alert.rate_limited',
  'emergency.reported',
  'emergency.confirmed',
  'emergency.dismissed',
  'emergency.broadcast_queued',
  'emergency.update_sent',
  'emergency.resolved',
  'membership.requested',
  'membership.approved',
  'membership.rejected',
  'membership.suspended',
  'membership.reinstated',
  'membership.removed',
  'membership.role_changed',
  'community.updated',
  'community.identification_field_updated',
  'community.invite_code_rotated',
  'media.accessed',
];

export default function AuditPage() {
  const { communityId } = useParams<{ communityId: string }>();
  const [action, setAction] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['community', communityId, 'audit', action],
    queryFn: ({ pageParam }) => api.admin.auditLogs(communityId, { action: action || undefined, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-muted-foreground">Immutable record of membership decisions, role changes, code rotation, alerts and incident actions.</p>
      </div>
      <Select aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} className="max-w-sm">
        <option value="">All actions</option>
        {ACTIONS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </Select>
      {q.isLoading ? <LoadingBlock /> : null}
      {q.error ? <ErrorState error={q.error} /> : null}
      {!q.isLoading && rows.length === 0 ? <EmptyState title="No audit entries" /> : null}
      {rows.length ? (
        <div className="rounded-lg border bg-card">
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Action</TH>
                <TH>Actor</TH>
                <TH>Target</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</TD>
                  <TD className="font-mono text-xs">{r.action}</TD>
                  <TD>{r.actor?.fullName ?? 'System'}</TD>
                  <TD className="font-mono text-xs text-muted-foreground">
                    {r.entityType}
                    {r.entityId ? `:${r.entityId.slice(0, 8)}` : ''}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : null}
      {q.hasNextPage ? (
        <Button variant="outline" onClick={() => void q.fetchNextPage()}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}
