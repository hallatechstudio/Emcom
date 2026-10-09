import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApiClient } from '../index';

function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift()!;
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  };
  return { impl: impl as unknown as typeof fetch, calls };
}

test('refreshes once on 401 and retries with the new token', async () => {
  let token = 'old';
  let refreshes = 0;
  const { impl, calls } = fakeFetch([{ status: 401, body: { error: { code: 'INVALID_TOKEN', message: 'x' } } }, { status: 200, body: { id: 'u1' } }]);
  const api = createApiClient({
    baseUrl: 'http://api',
    fetchImpl: impl,
    getAccessToken: () => token,
    refresh: async () => {
      refreshes++;
      token = 'new';
      return token;
    },
  });
  const me = await api.me.get();
  assert.deepEqual(me, { id: 'u1' });
  assert.equal(refreshes, 1);
  assert.equal((calls[1]!.init.headers as Record<string, string>).authorization, 'Bearer new');
});

test('maps error envelopes to ApiError and sends idempotency keys', async () => {
  const { impl, calls } = fakeFetch([{ status: 429, body: { error: { code: 'RATE_LIMITED', message: 'slow down', requestId: 'r1' } } }]);
  const api = createApiClient({ baseUrl: 'http://api', fetchImpl: impl, getAccessToken: () => 't', refresh: async () => null });
  await assert.rejects(api.emergencies.triggerCritical('c1', 'key-12345678'), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 429);
    assert.equal(e.code, 'RATE_LIMITED');
    assert.equal(e.requestId, 'r1');
    return true;
  });
  assert.equal((calls[0]!.init.headers as Record<string, string>)['idempotency-key'], 'key-12345678');
  assert.equal(calls[0]!.url, 'http://api/v1/communities/c1/critical-alerts');
});

test('network failures surface as status 0', async () => {
  const api = createApiClient({
    baseUrl: 'http://api',
    fetchImpl: (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch,
    getAccessToken: () => null,
    refresh: async () => null,
  });
  await assert.rejects(api.communities.mine(), (e: unknown) => e instanceof ApiError && e.isNetworkError);
});

test('serialises list queries', async () => {
  const { impl, calls } = fakeFetch([{ status: 200, body: { items: [], nextCursor: null } }]);
  const api = createApiClient({ baseUrl: 'http://api', fetchImpl: impl, getAccessToken: () => 't', refresh: async () => null });
  await api.emergencies.list('c1', { status: ['ACTIVE', 'RESOLVED'], mine: undefined });
  assert.equal(calls[0]!.url, 'http://api/v1/communities/c1/emergencies?status=ACTIVE%2CRESOLVED');
});
