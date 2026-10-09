import { generateKeyPairSync } from 'crypto';
import { ExpoPushProvider } from '../../src/modules/notifications/providers/expo.provider';
import { FcmPushProvider } from '../../src/modules/notifications/providers/fcm.provider';
import { MockPushProvider } from '../../src/modules/notifications/providers/mock.provider';
import type { PushMessage } from '../../src/modules/notifications/providers/push-provider';

const msg: PushMessage = {
  token: 'ExponentPushToken[abc]',
  title: 'EMERGENCY! Jacob Mews',
  body: 'A critical alert has been triggered for your community.',
  priority: 'CRITICAL',
  data: { notificationId: 'n1', type: 'CRITICAL_ALERT', communityId: 'c1', emergencyId: 'e1' },
};

const respond = (status: number, body: unknown) =>
  jest.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('ExpoPushProvider', () => {
  it('sends high priority on the emergency channel and maps ok tickets', async () => {
    const f = respond(200, { data: { status: 'ok', id: 'ticket-1' } });
    const r = await new ExpoPushProvider('tok', f as unknown as typeof fetch).send(msg);
    expect(r).toEqual({ ok: true, providerMessageId: 'ticket-1' });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ priority: 'high', channelId: 'emergency-alerts', sound: 'default', interruptionLevel: 'time-sensitive' });
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('classifies DeviceNotRegistered as invalid token, 5xx/429 as transient', async () => {
    const invalid = await new ExpoPushProvider(undefined, respond(200, { data: { status: 'error', details: { error: 'DeviceNotRegistered' } } }) as never).send(msg);
    expect(invalid).toMatchObject({ ok: false, kind: 'invalid_token' });
    expect(await new ExpoPushProvider(undefined, respond(503, {}) as never).send(msg)).toMatchObject({ ok: false, kind: 'transient' });
    expect(await new ExpoPushProvider(undefined, respond(429, {}) as never).send(msg)).toMatchObject({ ok: false, kind: 'transient' });
    const net = jest.fn(async () => {
      throw new Error('ECONNRESET');
    });
    expect(await new ExpoPushProvider(undefined, net as never).send(msg)).toMatchObject({ ok: false, kind: 'transient' });
  });

  it('uses the general channel for normal priority', async () => {
    const f = respond(200, { data: { status: 'ok', id: 't' } });
    await new ExpoPushProvider(undefined, f as never).send({ ...msg, priority: 'NORMAL' });
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ channelId: 'general', priority: 'default' });
  });
});

describe('FcmPushProvider', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = JSON.stringify({ client_email: 'svc@proj.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });

  function fakeFetch(sendStatus: number, sendBody: unknown) {
    return jest.fn(async (url: string) => {
      if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify(sendBody), { status: sendStatus });
    });
  }

  it('exchanges a signed JWT for an access token and sends an Android HIGH priority message', async () => {
    const f = fakeFetch(200, { name: 'projects/p/messages/1' });
    const r = await new FcmPushProvider('p', sa, f as never).send(msg);
    expect(r).toEqual({ ok: true, providerMessageId: 'projects/p/messages/1' });
    const tokenCall = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(tokenCall[1].body)).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
    const send = JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(send.message.android).toMatchObject({ priority: 'HIGH', notification: { channel_id: 'emergency-alerts' } });
    expect(send.message.data).toEqual({ notificationId: 'n1', type: 'CRITICAL_ALERT', communityId: 'c1', emergencyId: 'e1' });
  });

  it('maps UNREGISTERED to invalid token and 503 to transient', async () => {
    const unreg = await new FcmPushProvider('p', sa, fakeFetch(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }) as never).send(msg);
    expect(unreg).toMatchObject({ ok: false, kind: 'invalid_token', error: 'UNREGISTERED' });
    const down = await new FcmPushProvider('p', sa, fakeFetch(503, { error: { status: 'UNAVAILABLE' } }) as never).send(msg);
    expect(down).toMatchObject({ ok: false, kind: 'transient' });
  });
});

describe('MockPushProvider', () => {
  it('simulates success, invalid tokens and outages', async () => {
    const m = new MockPushProvider();
    expect((await m.send({ ...msg, token: 'mock-ok' })).ok).toBe(true);
    expect(await m.send({ ...msg, token: 'mock-invalid-1' })).toMatchObject({ kind: 'invalid_token' });
    expect(await m.send({ ...msg, token: 'mock-fail-1' })).toMatchObject({ kind: 'transient' });
  });
});
