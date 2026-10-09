'use client';
import { useQuery } from '@tanstack/react-query';
import { isAdminRole, type MyCommunityDto } from '@emcom/shared-types';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

export function useMyCommunities() {
  const { status } = useSession();
  return useQuery({ queryKey: ['mine'], queryFn: () => api.communities.mine(), enabled: status === 'authenticated' });
}

export function useAdminCommunities() {
  const q = useMyCommunities();
  const admin = (q.data ?? []).filter((m: MyCommunityDto) => m.membership.status === 'APPROVED' && isAdminRole(m.membership.role));
  return { ...q, admin };
}

/** The caller's role in the community currently being viewed (UI hint only; the API enforces). */
export function useCommunityRole(communityId: string) {
  const { admin } = useAdminCommunities();
  const entry = admin.find((m) => m.community.id === communityId);
  return { entry, role: entry?.membership.role, isOwner: entry?.membership.role === 'OWNER' };
}
