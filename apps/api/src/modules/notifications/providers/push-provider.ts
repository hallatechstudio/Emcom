import type { NotificationPriority, PushProviderName } from '@prisma/client';
import type { PushData } from '@emcom/shared-types';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data: PushData;
  priority: NotificationPriority;
}

export type PushResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; kind: 'invalid_token' | 'transient' | 'permanent'; error: string };

/**
 * A push transport. "ok" means the provider ACCEPTED the message — it is not evidence that the
 * device displayed it. Implementations must never log message bodies.
 */
export interface PushProvider {
  readonly name: PushProviderName;
  send(message: PushMessage): Promise<PushResult>;
}

/** Android channel ids registered by the mobile app (apps/mobile/src/lib/notifications.ts). */
export const ANDROID_CHANNEL = { EMERGENCY: 'emergency-alerts', GENERAL: 'general' } as const;

export function channelFor(priority: NotificationPriority): string {
  return priority === 'NORMAL' ? ANDROID_CHANNEL.GENERAL : ANDROID_CHANNEL.EMERGENCY;
}
