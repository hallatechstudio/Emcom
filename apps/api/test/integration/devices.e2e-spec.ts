import { auth, flushRedis, Harness, TestUser } from './harness';

/** E2E 13: device registration, multiple devices, ownership transfer, invalid token cleanup. */
describe('Device tokens and push deliveries', () => {
  let h: Harness;
  let owner: TestUser, member: TestUser, other: TestUser;
  let community: { id: string };

  beforeAll(async () => {
    h = await Harness.start();
    owner = await h.user();
    member = await h.user();
    other = await h.user();
    community = await h.community(owner);
    await h.membership(community.id, member, 'MEMBER');
  });
  afterAll(() => h.stop());
  beforeEach(async () => {
    await flushRedis();
    await h.prisma.$executeRaw`UPDATE emergencies SET status = 'RESOLVED', "resolvedAt" = now(), "resolutionMessage" = 'test reset' WHERE status = 'ACTIVE'`;
  });

  it('a user with several devices gets one delivery per device; invalid tokens are cleaned up', async () => {
    const phone = await h.device(member, 'mock-member-phone');
    const tablet = await h.device(member, 'mock-member-tablet');
    const dead = await h.device(member, 'mock-invalid-old-phone');
    const list = await h.http().get('/v1/devices').set(auth(member)).expect(200);
    expect(list.body).toHaveLength(3);

    const res = await h.critical(owner, community.id).expect(201);
    await h.drain();
    const deliveries = await h.prisma.notificationDelivery.findMany({
      where: { notification: { emergencyId: res.body.emergency.id, userId: member.id } },
      include: { deviceToken: true },
    });
    const byToken = Object.fromEntries(deliveries.map((d) => [d.deviceToken.token, d.status]));
    expect(byToken).toEqual({ [phone]: 'PROVIDER_ACCEPTED', [tablet]: 'PROVIDER_ACCEPTED', [dead]: 'INVALID_TOKEN' });
    const deadRow = await h.prisma.deviceToken.findUniqueOrThrow({ where: { token: dead } });
    expect(deadRow.invalidatedAt).not.toBeNull();
    expect((await h.http().get('/v1/devices').set(auth(member)).expect(200)).body).toHaveLength(2);

    // Invalidated tokens are skipped next time; the inbox still records the alert.
    await h.prisma.$executeRaw`UPDATE emergencies SET status = 'RESOLVED', "resolvedAt" = now(), "resolutionMessage" = 'reset' WHERE status = 'ACTIVE'`;
    const res2 = await h.critical(owner, community.id).expect(201);
    await h.drain();
    expect(await h.prisma.notificationDelivery.count({ where: { deviceTokenId: deadRow.id, notification: { emergencyId: res2.body.emergency.id } } })).toBe(0);
    expect(await h.prisma.notification.count({ where: { userId: member.id, emergencyId: res2.body.emergency.id } })).toBe(1);

    // Token refresh: re-registering revives it.
    await h.http().post('/v1/devices').set(auth(member)).send({ token: dead, platform: 'ANDROID', provider: 'MOCK' }).expect(201);
    expect((await h.prisma.deviceToken.findUniqueOrThrow({ where: { token: dead } })).invalidatedAt).toBeNull();
  });

  it('a token moves to the account that registers it last (shared device sign-in)', async () => {
    const token = await h.device(member, 'mock-shared-device');
    await h.http().post('/v1/devices').set(auth(other)).send({ token, platform: 'IOS', provider: 'MOCK' }).expect(201);
    const row = await h.prisma.deviceToken.findUniqueOrThrow({ where: { token } });
    expect(row.userId).toBe(other.id);
    // `other` is not a member, so a broadcast in this community must not reach that device.
    const res = await h.critical(owner, community.id).expect(201);
    await h.drain();
    expect(await h.prisma.notificationDelivery.count({ where: { deviceTokenId: row.id, notification: { emergencyId: res.body.emergency.id } } })).toBe(0);
  });

  it('unregister removes only the caller’s own token', async () => {
    const token = await h.device(member, 'mock-unregister-me');
    await h.http().post('/v1/devices/unregister').set(auth(other)).send({ token }).expect(204);
    expect(await h.prisma.deviceToken.count({ where: { token } })).toBe(1);
    await h.http().post('/v1/devices/unregister').set(auth(member)).send({ token }).expect(204);
    expect(await h.prisma.deviceToken.count({ where: { token } })).toBe(0);
  });

  it('push payloads carry identifiers only, and the dev log shows mock deliveries', async () => {
    await h.device(member, 'mock-payload-check');
    const seen: any[] = [];
    h.registry.register({ name: 'MOCK', send: async (m) => (seen.push(m), { ok: true, providerMessageId: 'x' }) });
    const r = await h.report(member, community.id, { description: 'SENSITIVE DETAIL: unit 4 code 1234' });
    await h.http().post(`/v1/communities/${community.id}/emergencies/${r.id}/confirm`).set(auth(owner)).send({}).expect(200);
    await h.drain();
    const msg = seen.find((m) => m.data.type === 'EMERGENCY_BROADCAST');
    expect(Object.keys(msg.data).sort()).toEqual(['communityId', 'emergencyId', 'notificationId', 'type']);
    expect(JSON.stringify(msg)).not.toContain('SENSITIVE DETAIL');
    const log = await h.http().get('/v1/dev/mock-pushes').set(auth(member)).expect(200);
    expect(log.body.length).toBeGreaterThan(0);
    expect(log.body[0].device.tokenSuffix).toHaveLength(6);
  });

  it('rejects malformed registrations', async () => {
    await h.http().post('/v1/devices').set(auth(member)).send({ token: 'x', platform: 'ANDROID', provider: 'MOCK' }).expect(400);
    await h.http().post('/v1/devices').set(auth(member)).send({ token: 'abcdefghijk', platform: 'WINDOWS', provider: 'MOCK' }).expect(400);
  });
});
