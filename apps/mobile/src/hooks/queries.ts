import { useQuery } from '@tanstack/react-query';
import { isAdminRole } from '@emcom/shared-types';
import { api } from '@/lib/api';

export const useMine = () => useQuery({ queryKey: ['mine'], queryFn: () => api.communities.mine() });

/** The caller's membership + community info for a community route. */
export function useCommunity(communityId: string) {
  const mine = useMine();
  const entry = mine.data?.find((m) => m.community.id === communityId);
  return {
    ...mine,
    entry,
    community: entry?.community,
    membership: entry?.membership,
    isAdmin: !!entry && entry.membership.status === 'APPROVED' && isAdminRole(entry.membership.role),
    isOwner: entry?.membership.role === 'OWNER' && entry.membership.status === 'APPROVED',
  };
}

export const useEmergency = (communityId: string, emergencyId: string) =>
  useQuery({ queryKey: ['c', communityId, 'emergency', emergencyId], queryFn: () => api.emergencies.get(communityId, emergencyId) });

export const useActiveEmergencies = (communityId: string) =>
  useQuery({ queryKey: ['c', communityId, 'emergencies', 'ACTIVE'], queryFn: () => api.emergencies.list(communityId, { status: ['ACTIVE'], limit: 20 }) });
