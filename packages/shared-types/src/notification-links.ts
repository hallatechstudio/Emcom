import type { NotificationType } from './enums';

/** Map link for a GPS fix (opens Google Maps in a browser or the installed maps app). */
export function mapsUrl(c: { latitude: number; longitude: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`;
}

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
    if (type === 'CRITICAL_ALERT' || type === 'EMERGENCY_BROADCAST' || type === 'EMERGENCY_REMINDER') {
      return `/c/${communityId}/incoming/${emergencyId}`;
    }
    return `/c/${communityId}/emergency/${emergencyId}`;
  }
  if (communityId && type === 'JOIN_REQUEST') return `/c/${communityId}/admin/members`;
  if (communityId && type === 'MEMBERSHIP_APPROVED') return `/c/${communityId}`;
  return '/notifications';
}
