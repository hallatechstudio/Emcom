import { randomUUID } from 'crypto';
import type { PushMessage, PushProvider, PushResult } from './push-provider';

/**
 * Development/test transport. Every "send" is recorded as a NotificationDelivery row with provider
 * MOCK, visible at GET /v1/dev/mock-pushes and in the admin web "Dev push log".
 * Token conventions for exercising failure paths:
 *   contains "invalid" → provider reports the token unregistered
 *   contains "fail"    → transient provider error (retried with backoff)
 */
export class MockPushProvider implements PushProvider {
  readonly name = 'MOCK' as const;

  async send(message: PushMessage): Promise<PushResult> {
    if (message.token.includes('invalid')) return { ok: false, kind: 'invalid_token', error: 'DeviceNotRegistered (mock)' };
    if (message.token.includes('fail')) return { ok: false, kind: 'transient', error: 'Simulated provider outage (mock)' };
    return { ok: true, providerMessageId: `mock-${randomUUID()}` };
  }
}
