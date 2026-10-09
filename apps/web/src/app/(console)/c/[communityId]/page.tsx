'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCommunityRole } from '@/components/console/hooks';
import { EmergencyRow } from '@/components/console/emergency-bits';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { startOfLocalDayIso } from '@/lib/utils';

export default function OverviewPage() {
  const { communityId } = useParams<{ communityId: string }>();
  const { entry } = useCommunityRole(communityId);
  const overview = useQuery({
    queryKey: ['community', communityId, 'overview'],
    queryFn: () => api.admin.overview(communityId, startOfLocalDayIso()),
  });
  const pending = useQuery({
    queryKey: ['community', communityId, 'emergencies', 'PENDING'],
    queryFn: () => api.emergencies.list(communityId, { status: ['PENDING'], limit: 10 }),
  });
  const active = useQuery({
    queryKey: ['community', communityId, 'emergencies', 'ACTIVE'],
    queryFn: () => api.emergencies.list(communityId, { status: ['ACTIVE'], limit: 10 }),
  });

  if (overview.error) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;
  const o = overview.data;
  const stats = [
    { label: 'Members', value: o?.memberCount, href: `/c/${communityId}/members` },
    { label: 'Pending requests', value: o?.pendingRequestCount, href: `/c/${communityId}/members?tab=PENDING`, warn: (o?.pendingRequestCount ?? 0) > 0 },
    { label: 'Active emergencies', value: o?.activeEmergencyCount, href: `/c/${communityId}/emergencies?tab=ACTIVE`, danger: (o?.activeEmergencyCount ?? 0) > 0 },
    { label: 'Alerts today', value: o?.alertsToday, href: `/c/${communityId}/emergencies` },
  ];

  return (
    <div className="grid gap-6">
      <header>
        <p className="text-sm text-muted-foreground">Overview</p>
        <h1 className="text-2xl font-bold">{entry?.community.name ?? 'Community'}</h1>
        <p className="text-sm font-semibold" aria-live="polite">
          {o ? (o.activeEmergencyCount > 0 ? <span className="text-emergency">ACTIVE EMERGENCY IN PROGRESS</span> : <span className="text-safe">COMMUNITY NORMAL</span>) : null}
        </p>
      </header>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key figures">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className={s.danger ? 'border-emergency bg-emergency-soft' : s.warn ? 'border-caution bg-caution-soft' : ''}>
              <CardContent className="p-5">
                <p className="text-3xl font-bold tabular-nums">{s.value ?? '—'}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Reports awaiting review ({o?.pendingReportCount ?? 0})</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href={`/c/${communityId}/emergencies?tab=PENDING`}>View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {pending.isLoading ? <LoadingBlock /> : null}
            {pending.error ? <ErrorState error={pending.error} /> : null}
            {pending.data?.items.length === 0 ? <EmptyState title="No pending reports" /> : null}
            {pending.data?.items.map((e) => <EmergencyRow key={e.id} e={e} communityId={communityId} />)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Active emergencies</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href={`/c/${communityId}/emergencies?tab=ACTIVE`}>View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {active.isLoading ? <LoadingBlock /> : null}
            {active.error ? <ErrorState error={active.error} /> : null}
            {active.data?.items.length === 0 ? <EmptyState title="No active emergencies" description="The community is currently normal." /> : null}
            {active.data?.items.map((e) => <EmergencyRow key={e.id} e={e} communityId={communityId} />)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
