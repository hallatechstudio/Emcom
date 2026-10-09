import Link from 'next/link';
import { AlertOctagon, CheckCircle2, Clock, MapPin, XCircle } from 'lucide-react';
import type { EmergencyDto, EmergencyStatus } from '@emcom/shared-types';
import { Badge } from '@/components/ui/badge';
import { emergencyTitle, formatDateTime } from '@/lib/utils';

export function StatusBadge({ status }: { status: EmergencyStatus }) {
  switch (status) {
    case 'ACTIVE':
      return (
        <Badge variant="emergency">
          <AlertOctagon className="mr-1 h-3 w-3" aria-hidden /> ACTIVE
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge variant="warning">
          <Clock className="mr-1 h-3 w-3" aria-hidden /> PENDING REVIEW
        </Badge>
      );
    case 'RESOLVED':
      return (
        <Badge variant="success">
          <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden /> RESOLVED
        </Badge>
      );
    case 'DISMISSED':
      return (
        <Badge>
          <XCircle className="mr-1 h-3 w-3" aria-hidden /> DISMISSED
        </Badge>
      );
  }
}

export function PathwayBadge({ e }: { e: Pick<EmergencyDto, 'pathway'> }) {
  return e.pathway === 'CRITICAL' ? <Badge variant="danger">CRITICAL ALERT</Badge> : <Badge variant="outline">Reported</Badge>;
}

export function EmergencyRow({ e, communityId }: { e: EmergencyDto; communityId: string }) {
  return (
    <Link
      href={`/c/${communityId}/emergencies/${e.id}`}
      className="flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{emergencyTitle(e)}</p>
          <StatusBadge status={e.status} />
          <PathwayBadge e={e} />
          {e.additionalTriggerCount > 0 ? <Badge variant="danger">+{e.additionalTriggerCount} more triggers</Badge> : null}
        </div>
        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" aria-hidden /> {e.location ?? 'Location not provided'}
        </p>
        {e.description ? <p className="mt-1 line-clamp-1 text-sm">{e.description}</p> : null}
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <p>Reported {formatDateTime(e.reportedAt)}</p>
        {e.reporter ? <p>by {e.reporter.fullName}</p> : null}
      </div>
    </Link>
  );
}
