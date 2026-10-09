'use client';
import { Bell, ClipboardList, LayoutDashboard, LogOut, Radio, Settings, ShieldAlert, Siren, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAdminCommunities } from '@/components/console/hooks';
import { Button } from '@/components/ui/button';
import { LoadingBlock } from '@/components/ui/feedback';
import { Select } from '@/components/ui/input';
import { useCommunityRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { status, user, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ communityId?: string }>();
  const { admin, isLoading } = useAdminCommunities();
  const communityId = params.communityId;
  const live = useCommunityRealtime(communityId);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated' || isLoading) return <LoadingBlock label="Loading console…" />;

  const nav = communityId
    ? [
        { href: `/c/${communityId}`, label: 'Overview', icon: LayoutDashboard, exact: true },
        { href: `/c/${communityId}/emergencies`, label: 'Emergencies', icon: Siren },
        { href: `/c/${communityId}/members`, label: 'Members', icon: Users },
        { href: `/c/${communityId}/settings`, label: 'Settings & code', icon: Settings },
        { href: `/c/${communityId}/audit`, label: 'Audit log', icon: ClipboardList },
      ]
    : [];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b bg-primary text-primary-foreground md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-5 py-4">
          <ShieldAlert className="h-6 w-6 text-red-400" aria-hidden />
          <div>
            <p className="font-bold tracking-wide">EMCOM</p>
            <p className="text-xs opacity-70">Administrator console</p>
          </div>
        </div>
        <div className="px-4 pb-3">
          <label htmlFor="community-switcher" className="mb-1 block text-xs uppercase tracking-wide opacity-70">
            Community
          </label>
          <Select
            id="community-switcher"
            className="bg-white text-foreground"
            value={communityId ?? ''}
            onChange={(e) => e.target.value && router.push(`/c/${e.target.value}`)}
          >
            <option value="" disabled>
              Select a community
            </option>
            {admin.map((m) => (
              <option key={m.community.id} value={m.community.id}>
                {m.community.name} ({m.membership.role === 'OWNER' ? 'Owner' : 'Admin'})
              </option>
            ))}
          </Select>
          {communityId ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs opacity-80" aria-live="polite">
              <Radio className={cn('h-3 w-3', live ? 'text-green-400' : 'text-yellow-300')} aria-hidden />
              {live ? 'Live updates connected' : 'Live updates reconnecting — data refreshes on focus'}
            </p>
          ) : null}
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-4" aria-label="Console">
          {nav.map((n) => {
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn('flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm', active ? 'bg-white/15 font-semibold' : 'hover:bg-white/10')}
                aria-current={active ? 'page' : undefined}
              >
                <n.icon className="h-4 w-4" aria-hidden /> {n.label}
              </Link>
            );
          })}
          {process.env.NODE_ENV !== 'production' ? (
            <Link href="/dev/push-log" className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-white/10">
              <Bell className="h-4 w-4" aria-hidden /> Dev push log
            </Link>
          ) : null}
        </nav>
        <div className="hidden px-5 py-4 text-xs md:block">
          <p className="truncate opacity-80">{user?.fullName}</p>
          <p className="truncate opacity-60">{user?.email}</p>
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 bg-muted/30 p-4 md:p-8">{children}</main>
    </div>
  );
}
