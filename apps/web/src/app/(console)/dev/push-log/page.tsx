'use client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

/** Development only: what the MOCK push transport "sent" to your own registered devices. */
export default function PushLogPage() {
  const q = useQuery({ queryKey: ['dev-push-log'], queryFn: () => api.dev.mockPushes(), refetchInterval: 3000 });
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold">Dev push log (mock transport)</h1>
        <p className="text-sm text-muted-foreground">
          Local development uses a mock push provider. Each row is a delivery the provider accepted for one of your devices. Real devices need Expo/FCM
          credentials — see docs/notification-strategy.md.
        </p>
      </div>
      {q.isLoading ? <LoadingBlock /> : null}
      {q.error ? <ErrorState error={q.error} /> : null}
      {q.data?.length === 0 ? <EmptyState title="No mock pushes yet" description="Sign in on the mobile app (dev) to register a mock device, then trigger an alert." /> : null}
      {q.data?.length ? (
        <div className="rounded-lg border bg-card">
          <Table>
            <THead>
              <TR>
                <TH>Queued</TH>
                <TH>Notification</TH>
                <TH>Device</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {q.data.map((d) => (
                <TR key={d.deliveryId}>
                  <TD className="whitespace-nowrap text-xs">{formatDateTime(d.queuedAt)}</TD>
                  <TD>
                    <p className="font-semibold">{d.notification.title}</p>
                    <p className="text-xs text-muted-foreground">{d.notification.body}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {d.notification.type} · {d.notification.priority}
                    </p>
                  </TD>
                  <TD className="text-xs">
                    {d.device.platform} …{d.device.tokenSuffix}
                  </TD>
                  <TD>
                    <Badge variant={d.status === 'PROVIDER_ACCEPTED' ? 'success' : d.status === 'QUEUED' ? 'warning' : 'danger'}>{d.status}</Badge>
                    {d.lastError ? <p className="text-xs text-emergency">{d.lastError}</p> : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
