import type { NotificationType } from './enums';

/** Data payload attached to every push. Contains identifiers only — never incident text. */
export interface PushData {
  notificationId: string;
  type: NotificationType;
  communityId?: string;
  emergencyId?: string;
}

/**
 * Maps a push/inbox payload to an in-app route. Shared by mobile deep-link handling and tests.
 * The app must still verify membership via the API before rendering incident data.
 */
export function routeForNotification(data: Partial<PushData>): string {
  const { type, communityId, emergencyId } = data;
  if (communityId && emergencyId) {
    if (type === 'EMERGENCY_REPORT_RECEIVED') {
      return `/c/${communityId}/admin/emergency/${emergencyId}`;
    }
    if (type === 'CRITICAL_ALERT' || type === 'EMERGENCY_BROADCAST') {
      return `/c/${communityId}/incoming/${emergencyId}`;
    }
    return `/c/${communityId}/emergency/${emergencyId}`;
  }
  if (communityId && type === 'JOIN_REQUEST') return `/c/${communityId}/admin/members`;
  if (communityId && type === 'MEMBERSHIP_APPROVED') return `/c/${communityId}`;
  return '/notifications';
}
