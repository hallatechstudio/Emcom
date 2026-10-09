'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import type { EmergencyStatus } from '@emcom/shared-types';
import { EmergencyRow } from '@/components/console/emergency-bits';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const TABS: { key: EmergencyStatus; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'DISMISSED', label: 'Dismissed' },
];

function EmergenciesInner() {
  const { communityId } = useParams<{ communityId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const tab = (search.get('tab') as EmergencyStatus) || 'PENDING';
  const q = useInfiniteQuery({
    queryKey: ['community', communityId, 'emergencies', 'list', tab],
    queryFn: ({ pageParam }) => api.emergencies.list(communityId, { status: [tab], cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-bold">Emergencies</h1>
      <div role="tablist" aria-label="Emergency status" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => router.replace(`?tab=${t.key}`)}
            className={cn('min-h-10 flex-1 rounded-md px-4 text-sm font-semibold', tab === t.key ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="grid gap-2">
        {q.isLoading ? <LoadingBlock /> : null}
        {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
        {!q.isLoading && items.length === 0 ? <EmptyState title={`No ${tab.toLowerCase()} emergencies`} /> : null}
        {items.map((e) => (
          <EmergencyRow key={e.id} e={e} communityId={communityId} />
        ))}
        {q.hasNextPage ? (
          <Button variant="outline" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function EmergenciesPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <EmergenciesInner />
    </Suspense>
  );
}
