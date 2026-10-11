import { router } from 'expo-router';
import { api } from './api';
import { useSession } from './session-store';

/** Emergencies already presented full-screen in this app session (realtime and push can both fire). */
const presented = new Set<string>();

/**
 * Opens the Incoming Emergency Alert for an ACTIVE emergency in ANY of the user's communities,
 * unless the user raised it themselves or it was already shown.
 */
export async function presentIncoming(communityId: string, emergencyId: string): Promise<void> {
  if (presented.has(emergencyId)) return;
  try {
    const e = await api.emergencies.get(communityId, emergencyId);
    if (e.status !== 'ACTIVE' || e.myAcknowledgedAt) return;
    if (e.reporter?.id && e.reporter.id === useSession.getState().user?.id) return;
    presented.add(emergencyId);
    router.push(`/c/${communityId}/incoming/${emergencyId}`);
  } catch {
    // Not visible to this user (e.g. membership just changed) — ignore.
  }
}

export function markPresented(emergencyId: string): void {
  presented.add(emergencyId);
}

export function resetPresented(): void {
  presented.clear();
}
