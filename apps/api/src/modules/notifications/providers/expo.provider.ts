import type { PushMessage, PushProvider, PushResult } from './push-provider';
import { channelFor } from './push-provider';

const ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/**
 * Expo Push Service (relays to FCM/APNs). Requires the app to be built with valid FCM/APNs
 * credentials configured in EAS. Tickets with status "ok" mean Expo accepted the message.
 */
export class ExpoPushProvider implements PushProvider {
  readonly name = 'EXPO' as const;

  constructor(
    private readonly accessToken?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(m: PushMessage): Promise<PushResult> {
    const urgent = m.priority !== 'NORMAL';
    const body = {
      to: m.token,
      title: m.title,
      body: m.body,
      data: m.data,
      sound: 'default',
      priority: urgent ? 'high' : 'default',
      channelId: channelFor(m.priority),
      // iOS: time-sensitive may break through Focus if the user allows it. "critical" requires an
      // Apple entitlement that must be applied for separately — never assumed here.
      interruptionLevel: urgent ? 'time-sensitive' : 'active',
      ttl: urgent ? 3600 : 86_400,
    };
    let res: Response;
    try {
      res = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      return { ok: false, kind: 'transient', error: `network: ${(err as Error).message}` };
    }
    if (res.status === 429 || res.status >= 500) return { ok: false, kind: 'transient', error: `HTTP ${res.status}` };
    const json = (await res.json().catch(() => ({}))) as {
      data?: { status: string; id?: string; message?: string; details?: { error?: string } };
      errors?: { message: string }[];
    };
    if (!res.ok || !json.data) {
      return { ok: false, kind: 'permanent', error: json.errors?.[0]?.message ?? `HTTP ${res.status}` };
    }
    const ticket = json.data;
    if (ticket.status === 'ok') return { ok: true, providerMessageId: ticket.id };
    const code = ticket.details?.error;
    if (code === 'DeviceNotRegistered') return { ok: false, kind: 'invalid_token', error: code };
    if (code === 'MessageRateExceeded') return { ok: false, kind: 'transient', error: code };
    return { ok: false, kind: 'permanent', error: code ?? ticket.message ?? 'unknown' };
  }
}
