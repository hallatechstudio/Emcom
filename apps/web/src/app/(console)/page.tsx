'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAdminCommunities } from '@/components/console/hooks';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { useSession } from '@/lib/session';

export default function ConsoleHome() {
  const { admin, isLoading, error, refetch } = useAdminCommunities();
  const { logout } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (admin.length > 0) router.replace(`/c/${admin[0]!.community.id}`);
  }, [admin, router]);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (admin.length === 0)
    return (
      <EmptyState
        title="You are not an administrator of any community"
        description="This console is for community owners and admins. Create or join communities and receive alerts in the EMCOM mobile app."
        action={
          <Button variant="outline" onClick={() => void logout()}>
            Sign out
          </Button>
        }
      />
    );
  return <LoadingBlock label="Opening your community…" />;
}
