import { createSign } from 'crypto';
import type { PushMessage, PushProvider, PushResult } from './push-provider';
import { channelFor } from './push-provider';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/**
 * Firebase Cloud Messaging HTTP v1 for native Android FCM tokens (and iOS tokens registered via
 * the Firebase SDK). Authenticates with a service account; credentials come from the environment
 * / secret manager only.
 */
export class FcmPushProvider implements PushProvider {
  readonly name = 'FCM' as const;
  private accessToken?: { value: string; expiresAt: number };
  private readonly sa: ServiceAccount;

  constructor(
    private readonly projectId: string,
    serviceAccountJson: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.sa = JSON.parse(serviceAccountJson) as ServiceAccount;
  }

  async send(m: PushMessage): Promise<PushResult> {
    let token: string;
    try {
      token = await this.getAccessToken();
    } catch (err) {
      return { ok: false, kind: 'transient', error: `oauth: ${(err as Error).message}` };
    }
    const urgent = m.priority !== 'NORMAL';
    const data = Object.fromEntries(Object.entries(m.data).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    const message = {
      token: m.token,
      notification: { title: m.title, body: m.body },
      data,
      android: {
        priority: urgent ? 'HIGH' : 'NORMAL',
        ttl: urgent ? '3600s' : '86400s',
        notification: { channel_id: channelFor(m.priority), sound: 'default', default_vibrate_timings: true },
      },
      apns: {
        headers: { 'apns-priority': urgent ? '10' : '5', 'apns-push-type': 'alert' },
        payload: { aps: { sound: 'default', 'interruption-level': urgent ? 'time-sensitive' : 'active' } },
      },
    };
    let res: Response;
    try {
      res = await this.fetchImpl(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      return { ok: false, kind: 'transient', error: `network: ${(err as Error).message}` };
    }
    if (res.ok) {
      const json = (await res.json()) as { name?: string };
      return { ok: true, providerMessageId: json.name };
    }
    const err = (await res.json().catch(() => ({}))) as {
      error?: { status?: string; message?: string; details?: { errorCode?: string }[] };
    };
    const errorCode = err.error?.details?.find((d) => d.errorCode)?.errorCode ?? err.error?.status ?? `HTTP ${res.status}`;
    if (res.status === 404 || errorCode === 'UNREGISTERED') return { ok: false, kind: 'invalid_token', error: errorCode };
    if (res.status === 400 && errorCode === 'INVALID_ARGUMENT') return { ok: false, kind: 'invalid_token', error: errorCode };
    if (res.status === 401) this.accessToken = undefined;
    if (res.status === 429 || res.status >= 500 || res.status === 401) return { ok: false, kind: 'transient', error: errorCode };
    return { ok: false, kind: 'permanent', error: errorCode };
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const now = Math.floor(Date.now() / 1000);
    const tokenUri = this.sa.token_uri ?? 'https://oauth2.googleapis.com/token';
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
      iss: this.sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(this.sa.private_key).toString('base64url');
    const res = await this.fetchImpl(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`token endpoint HTTP ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }
}
