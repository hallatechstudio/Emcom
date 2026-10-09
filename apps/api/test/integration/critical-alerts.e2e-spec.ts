import { setEnvForTests } from '../../src/config/env';
import { auth, flushRedis, Harness, TestUser } from './harness';

describe('Critical Alert (E2E 5, 6, 9, 10)', () => {
  let h: Harness;
  let owner: TestUser;
  let admin: TestUser;
  let a: TestUser;
  let b: TestUser;
  let community: { id: string };
  const base = () => `/v1/communities/${community.id}`;

  beforeAll(async () => {
    h = await Harness.start();
    owner = await h.user();
    admin = await h.user();
    a = await h.user();
    b = await h.user();
    community = await h.community(owner, { name: 'Jacob Mews', whatsappUrl: 'https://chat.whatsapp.com/JacobMewsGroup01' });
    await h.membership(community.id, admin, 'ADMIN');
    await h.membership(community.id, a, 'MEMBER');
    await h.membership(community.id, b, 'MEMBER');
    for (const u of [owner, admin, a, b]) await h.device(u);
  });
  afterAll(() => h.stop());
  beforeEach(async () => {
    await flushRedis();
    // Each test starts with no active critical alerts so coalescing does not leak across tests.
    await h.prisma.$executeRaw`UPDATE emergencies SET status = 'RESOLVED', "resolvedAt" = now(), "resolutionMessage" = 'test reset' WHERE status = 'ACTIVE'`;
    setEnvForTests({ CRITICAL_ALERT_COALESCE_SECONDS: 120, CRITICAL_ALERT_USER_LIMIT: 100 });
  });

  it('E2E 5: confirmed trigger immediately creates an ACTIVE incident and broadcast intent, no admin approval', async () => {
    const res = await h.critical(a, community.id).expect(201);
    expect(res.body).toMatchObject({ coalesced: false, broadcastStatus: 'QUEUED' });
    expect(res.body.emergency).toMatchObject({ pathway: 'CRITICAL', status: 'ACTIVE', category: null });
    const id = res.body.emergency.id;

    // Broadcast intent exists atomically with the incident, before any worker has run.
    const outbox = await h.prisma.outboxEvent.findMany({ where: { aggregateId: id, type: 'emergency.broadcast' } });
    expect(outbox).toHaveLength(1);
    const alert = await h.prisma.emergencyAlert.findUniqueOrThrow({ where: { emergencyId: id } });
    expect(alert.recipientCount).toBe(4);

    await h.drain();
    const inbox = await h.http().get('/v1/notifications').set(auth(b)).expect(200);
    expect(inbox.body.items[0]).toMatchObject({ type: 'CRITICAL_ALERT', priority: 'CRITICAL', title: 'EMERGENCY! Jacob Mews', emergencyId: id });
    // The sender is not pushed their own alert (they see the "Critical Alert Sent" screen).
    expect(await h.prisma.notification.count({ where: { userId: a.id, emergencyId: id } })).toBe(0);
    const ownerSees = await h.http().get(`${base()}/emergencies/${id}`).set(auth(owner)).expect(200);
    expect(ownerSees.body.reporter.id).toBe(a.id);

    // Admin manages it afterwards like any incident.
    await h.http().post(`${base()}/emergencies/${id}/updates`).set(auth(admin)).send({ message: 'Security en route to Gate 2' }).expect(201);
    await h.http().post(`${base()}/emergencies/${id}/acknowledge`).set(auth(b)).expect(200);
    await h.http().post(`${base()}/emergencies/${id}/resolve`).set(auth(admin)).send({ resolutionMessage: 'False alarm at Gate 2 cleared.' }).expect(200);
    const tl = await h.http().get(`${base()}/emergencies/${id}/timeline`).set(auth(admin)).expect(200);
    expect(tl.body.map((e: any) => e.type)).toEqual(['CRITICAL_ALERT_TRIGGERED', 'COMMUNITY_ALERTED', 'UPDATE_SENT', 'RESOLVED']);
    expect(await h.prisma.auditLog.count({ where: { action: 'critical_alert.triggered', entityId: id } })).toBe(1);
  });

  it('E2E 6: cancelling on the confirmation screen has no server effect (nothing until the POST)', async () => {
    await h.drain();
    const before = await Promise.all([h.prisma.emergency.count(), h.prisma.outboxEvent.count(), h.prisma.notification.count()]);
    // The mobile confirmation screen only reads community info before the user chooses.
    await h.http().get(base()).set(auth(a)).expect(200);
    await h.drain();
    const after = await Promise.all([h.prisma.emergency.count(), h.prisma.outboxEvent.count(), h.prisma.notification.count()]);
    expect(after).toEqual(before);
  });

  it('does not require a category or attachment, and accepts an optional location hint', async () => {
    const res = await h.http().post(`${base()}/critical-alerts`).set(auth(b)).set('Idempotency-Key', 'loc-hint-0001').send({ location: 'Gate 2' }).expect(201);
    expect(res.body.emergency.location).toBe('Gate 2');
    await h.http().post(`${base()}/critical-alerts`).set(auth(b)).send({ category: 'FIRE' }).expect(400);
  });

  it('E2E 9: network retries with the same Idempotency-Key return the original alert', async () => {
    const key = 'retry-key-123456';
    const [r1, r2, r3] = await Promise.all([h.critical(a, community.id, key), h.critical(a, community.id, key), h.critical(a, community.id, key)]);
    for (const r of [r1, r2, r3]) expect(r.status).toBe(201);
    const ids = new Set([r1, r2, r3].map((r) => r.body.emergency.id));
    expect(ids.size).toBe(1);
    expect(await h.prisma.emergency.count({ where: { id: [...ids][0] } })).toBe(1);
    expect(await h.prisma.emergencyAlert.count({ where: { emergencyId: [...ids][0] } })).toBe(1);
    expect(await h.prisma.outboxEvent.count({ where: { aggregateId: [...ids][0], type: 'emergency.broadcast' } })).toBe(1);
    // Reusing a key for a different operation is rejected.
    const misuse = await h.http().post(`${base()}/emergencies`).set(auth(a)).set('Idempotency-Key', key).send({ category: 'FIRE', location: 'x1', description: 'fire here' }).expect(409);
    expect(misuse.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('E2E 10: simultaneous triggers from different members produce one broadcast; others are recorded', async () => {
    const results = await Promise.all([a, b, admin, owner].map((u) => h.critical(u, community.id)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const emergencyIds = new Set(results.map((r) => r.body.emergency.id));
    expect(emergencyIds.size).toBe(1);
    expect(results.filter((r) => !r.body.coalesced)).toHaveLength(1);
    const id = [...emergencyIds][0];
    expect(await h.prisma.emergencyAlert.count({ where: { emergencyId: id } })).toBe(1);
    const e = await h.prisma.emergency.findUniqueOrThrow({ where: { id } });
    expect(e.additionalTriggerCount).toBe(3);
    const events = await h.prisma.emergencyEvent.findMany({ where: { emergencyId: id }, orderBy: { seq: 'asc' } });
    expect(events.map((x) => x.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(events.filter((x) => x.type === 'ADDITIONAL_TRIGGER')).toHaveLength(3);
  });

  it('with coalescing disabled, simultaneous triggers each broadcast exactly once', async () => {
    setEnvForTests({ CRITICAL_ALERT_COALESCE_SECONDS: 0 });
    const results = await Promise.all([a, b].map((u) => h.critical(u, community.id)));
    const ids = results.map((r) => r.body.emergency.id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(await h.prisma.outboxEvent.count({ where: { aggregateId: id, type: 'emergency.broadcast' } })).toBe(1);
  });

  it('caps new broadcasts per member with an explicit, audited 429 (never silent)', async () => {
    setEnvForTests({ CRITICAL_ALERT_COALESCE_SECONDS: 0, CRITICAL_ALERT_USER_LIMIT: 2 });
    const fresh = await h.user();
    await h.membership(community.id, fresh, 'MEMBER');
    await h.critical(fresh, community.id).expect(201);
    await h.critical(fresh, community.id).expect(201);
    const limited = await h.critical(fresh, community.id).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.body.error.message).toMatch(/emergency services/);
    expect(await h.prisma.auditLog.count({ where: { action: 'critical_alert.rate_limited', actorId: fresh.id } })).toBe(1);
  });

  it('a member suspended a moment ago cannot trigger, and suspended members are not notified', async () => {
    const s = await h.user();
    const m = await h.membership(community.id, s, 'MEMBER');
    await h.device(s);
    await h.http().post(`${base()}/members/${m.id}/suspend`).set(auth(admin)).expect(200);
    await h.critical(s, community.id).expect(403);
    const res = await h.critical(a, community.id).expect(201);
    await h.drain();
    expect(await h.prisma.notification.count({ where: { userId: s.id, emergencyId: res.body.emergency.id } })).toBe(0);
  });
});
