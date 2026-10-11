import { auth, flushRedis, Harness, TestUser } from './harness';

describe('GPS coordinates and acknowledgment reminders', () => {
  let h: Harness;
  let owner: TestUser, admin: TestUser, a: TestUser, b: TestUser, c: TestUser, outsider: TestUser;
  let community: { id: string };
  const base = () => `/v1/communities/${community.id}`;

  beforeAll(async () => {
    h = await Harness.start();
    [owner, admin, a, b, c, outsider] = await Promise.all(Array.from({ length: 6 }, () => h.user()));
    community = await h.community(owner, { name: 'Jacob Mews' });
    await h.membership(community.id, admin, 'ADMIN');
    for (const u of [a, b, c]) await h.membership(community.id, u, 'MEMBER');
    const other = await h.community(outsider, { name: 'Elsewhere' });
    void other;
  });
  afterAll(() => h.stop());
  beforeEach(async () => {
    await flushRedis();
    await h.prisma.$executeRaw`UPDATE emergencies SET status = 'RESOLVED', "resolvedAt" = now(), "resolutionMessage" = 'test reset' WHERE status = 'ACTIVE'`;
  });

  it('stores an optional GPS fix on reports and critical alerts and returns it', async () => {
    const r = await h.report(a, community.id, { coordinates: { latitude: 6.5244, longitude: 3.3792, accuracyM: 14.5 } });
    const got = await h.http().get(`${base()}/emergencies/${r.id}`).set(auth(admin)).expect(200);
    expect(got.body.coordinates).toEqual({ latitude: 6.5244, longitude: 3.3792, accuracyM: 14.5 });

    const crit = await h.http().post(`${base()}/critical-alerts`).set(auth(b)).set('Idempotency-Key', 'gps-crit-0001').send({ coordinates: { latitude: -1.5, longitude: 36.8 } }).expect(201);
    expect(crit.body.emergency.coordinates).toEqual({ latitude: -1.5, longitude: 36.8, accuracyM: null });

    const plain = await h.report(a, community.id);
    expect((await h.http().get(`${base()}/emergencies/${plain.id}`).set(auth(admin))).body.coordinates).toBeNull();
  });

  it('rejects invalid coordinates', async () => {
    for (const coordinates of [{ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }, { latitude: 'x', longitude: 2 }, { latitude: 1 }]) {
      await h.http().post(`${base()}/emergencies`).set(auth(a)).send({ category: 'FIRE', location: 'Block A', description: 'fire here', coordinates }).expect(400);
    }
    await expect(h.prisma.$executeRaw`UPDATE emergencies SET latitude = 10 WHERE longitude IS NULL`).rejects.toThrow();
  });

  it('reminds only approved recipients who have not acknowledged, then enforces a cooldown', async () => {
    for (const u of [a, b, c]) await h.device(u);
    const r = await h.report(a, community.id);
    await h.http().post(`${base()}/emergencies/${r.id}/confirm`).set(auth(admin)).send({}).expect(200);
    await h.http().post(`${base()}/emergencies/${r.id}/acknowledge`).set(auth(a)).expect(200);
    // c gets suspended after the broadcast: must not be reminded.
    const cm = await h.prisma.communityMembership.findFirstOrThrow({ where: { communityId: community.id, userId: c.id } });
    await h.http().post(`${base()}/members/${cm.id}/suspend`).set(auth(admin)).expect(200);
    await h.drain();

    await h.http().post(`${base()}/emergencies/${r.id}/remind`).set(auth(b)).expect(403);
    const res = await h.http().post(`${base()}/emergencies/${r.id}/remind`).set(auth(admin)).expect(200);
    // Not acknowledged & approved: owner, admin, b (a acknowledged, c suspended).
    expect(res.body.remindedCount).toBe(3);
    expect(new Date(res.body.nextAllowedAt).getTime()).toBeGreaterThan(Date.now());
    await h.drain();

    const reminded = await h.prisma.notification.findMany({ where: { emergencyId: r.id, type: 'EMERGENCY_REMINDER' }, select: { userId: true } });
    const ids = reminded.map((n) => n.userId).sort();
    expect(ids).toEqual([owner.id, admin.id, b.id].sort());
    const bInbox = await h.http().get('/v1/notifications').set(auth(b)).expect(200);
    expect(bInbox.body.items[0]).toMatchObject({ type: 'EMERGENCY_REMINDER', priority: 'CRITICAL' });

    const again = await h.http().post(`${base()}/emergencies/${r.id}/remind`).set(auth(owner)).expect(429);
    expect(again.body.error.code).toBe('RATE_LIMITED');
    const tl = await h.http().get(`${base()}/emergencies/${r.id}/timeline`).set(auth(admin)).expect(200);
    expect(tl.body.at(-1)).toMatchObject({ type: 'REMINDER_SENT', message: '3 members reminded' });
    expect(await h.prisma.auditLog.count({ where: { action: 'emergency.reminder_sent', entityId: r.id } })).toBe(1);
    await h.http().post(`${base()}/members/${cm.id}/reinstate`).set(auth(admin)).expect(200);
  });

  it('refuses reminders when the emergency is not active, everyone acknowledged, or from another community', async () => {
    const pending = await h.report(a, community.id);
    const notActive = await h.http().post(`${base()}/emergencies/${pending.id}/remind`).set(auth(admin)).expect(409);
    expect(notActive.body.error.code).toBe('EMERGENCY_NOT_ACTIVE');

    const solo = await h.user();
    const own = await h.community(solo, { name: 'Solo' });
    const crit = await h.critical(solo, own.id).expect(201);
    // Only member is the sender; acknowledge, then nothing is left to remind.
    await h.http().post(`/v1/communities/${own.id}/emergencies/${crit.body.emergency.id}/acknowledge`).set(auth(solo)).expect(200);
    const none = await h.http().post(`/v1/communities/${own.id}/emergencies/${crit.body.emergency.id}/remind`).set(auth(solo)).expect(409);
    expect(none.body.error.code).toBe('NOTHING_TO_REMIND');

    await h.http().post(`${base()}/emergencies/${crit.body.emergency.id}/remind`).set(auth(admin)).expect(404);
  });
});
