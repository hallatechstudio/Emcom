import { auth, flushRedis, Harness, TestUser } from './harness';

describe('Concurrency, acknowledgments and admin actions (E2E 9, 10, 15)', () => {
  let h: Harness;
  let owner: TestUser, admin1: TestUser, admin2: TestUser;
  let members: TestUser[];
  let community: { id: string };
  const base = () => `/v1/communities/${community.id}`;

  beforeAll(async () => {
    h = await Harness.start();
    owner = await h.user('o@c.dev', { fullName: 'Owner Person' });
    admin1 = await h.user();
    admin2 = await h.user();
    community = await h.community(owner);
    await h.membership(community.id, admin1, 'ADMIN');
    await h.membership(community.id, admin2, 'ADMIN');
    members = [];
    for (let i = 0; i < 5; i++) {
      const m = await h.user(`m${i}@c.dev`, { fullName: `Member ${i}` });
      await h.membership(community.id, m, 'MEMBER', 'APPROVED', `Block ${String.fromCharCode(65 + i)}`);
      members.push(m);
    }
  });
  afterAll(() => h.stop());
  beforeEach(() => flushRedis());

  it('E2E 10: concurrent confirmations by several admins produce exactly one broadcast', async () => {
    const r = await h.report(members[0]!, community.id);
    const results = await Promise.all(
      [admin1, admin2, owner, admin1, admin2].map((a) => h.http().post(`${base()}/emergencies/${r.id}/confirm`).set(auth(a)).send({})),
    );
    expect(results.filter((x) => x.status === 200)).toHaveLength(1);
    expect(results.filter((x) => x.status === 409).every((x) => x.body.error.code === 'ALREADY_CONFIRMED')).toBe(true);
    expect(await h.prisma.emergencyAlert.count({ where: { emergencyId: r.id } })).toBe(1);
    expect(await h.prisma.outboxEvent.count({ where: { aggregateId: r.id, type: 'emergency.broadcast' } })).toBe(1);
    expect(await h.prisma.auditLog.count({ where: { entityId: r.id, action: 'emergency.confirmed' } })).toBe(1);
  });

  it('concurrent confirm vs dismiss never yields contradictory state', async () => {
    const r = await h.report(members[1]!, community.id);
    const [c, d] = await Promise.all([
      h.http().post(`${base()}/emergencies/${r.id}/confirm`).set(auth(admin1)).send({}),
      h.http().post(`${base()}/emergencies/${r.id}/dismiss`).set(auth(admin2)).send({}),
    ]);
    expect([c.status, d.status].sort()).toEqual([200, 409]);
    const e = await h.prisma.emergency.findUniqueOrThrow({ where: { id: r.id }, include: { alert: true } });
    if (e.status === 'ACTIVE') expect(e.alert).not.toBeNull();
    else expect(e.alert).toBeNull();
  });

  it('E2E 9: concurrent double-tap acknowledgments are stored once', async () => {
    const r = await h.report(members[0]!, community.id);
    await h.http().post(`${base()}/emergencies/${r.id}/confirm`).set(auth(admin1)).send({}).expect(200);
    const taps = await Promise.all(Array.from({ length: 6 }, () => h.http().post(`${base()}/emergencies/${r.id}/acknowledge`).set(auth(members[2]!))));
    expect(taps.every((t) => t.status === 200)).toBe(true);
    expect(new Set(taps.map((t) => t.body.acknowledgedAt)).size).toBe(1);
    const alert = await h.prisma.emergencyAlert.findUniqueOrThrow({ where: { emergencyId: r.id } });
    expect(await h.prisma.alertAcknowledgment.count({ where: { alertId: alert.id, userId: members[2]!.id } })).toBe(1);
  });

  it('acknowledgment baseline: snapshot + late joiners flagged; unacked filter and search work', async () => {
    const r = await h.report(members[0]!, community.id);
    await h.http().post(`${base()}/emergencies/${r.id}/confirm`).set(auth(admin1)).send({}).expect(200);
    const late = await h.user('late@c.dev', { fullName: 'Late Joiner' });
    await h.membership(community.id, late, 'MEMBER', 'APPROVED', 'Block Z');
    await h.http().post(`${base()}/emergencies/${r.id}/acknowledge`).set(auth(members[3]!)).expect(200);
    await h.http().post(`${base()}/emergencies/${r.id}/acknowledge`).set(auth(late)).expect(200);

    const sum = await h.http().get(`${base()}/emergencies/${r.id}/acknowledgments`).set(auth(admin2)).expect(200);
    expect(sum.body).toMatchObject({ recipientCount: 9, acknowledgedCount: 2, notAcknowledgedCount: 7 });
    const acked = await h.http().get(`${base()}/emergencies/${r.id}/acknowledgments/recipients?filter=acknowledged`).set(auth(admin2)).expect(200);
    expect(acked.body.items.map((i: any) => i.fullName).sort()).toEqual(['Late Joiner', 'Member 3']);
    expect(acked.body.items.find((i: any) => i.fullName === 'Late Joiner').addedAfterBroadcast).toBe(true);
    const notAcked = await h.http().get(`${base()}/emergencies/${r.id}/acknowledgments/recipients?filter=not_acknowledged`).set(auth(admin2)).expect(200);
    expect(notAcked.body.items).toHaveLength(7);
    expect(notAcked.body.items[0].pushState).toBe('NO_DEVICE');
    const search = await h.http().get(`${base()}/emergencies/${r.id}/acknowledgments/recipients?q=block%20b`).set(auth(admin2)).expect(200);
    expect(search.body.items.map((i: any) => i.fullName)).toEqual(['Member 1']);
    const paged = await h.http().get(`${base()}/emergencies/${r.id}/acknowledgments/recipients?limit=4`).set(auth(admin2)).expect(200);
    expect(paged.body.items).toHaveLength(4);
    const next = await h.http().get(`${base()}/emergencies/${r.id}/acknowledgments/recipients?limit=10&cursor=${paged.body.nextCursor}`).set(auth(admin2)).expect(200);
    expect(next.body.items).toHaveLength(5);
  });

  it('cannot acknowledge a resolved emergency for the first time', async () => {
    const r = await h.report(members[0]!, community.id);
    await h.http().post(`${base()}/emergencies/${r.id}/confirm`).set(auth(admin1)).send({}).expect(200);
    await h.http().post(`${base()}/emergencies/${r.id}/resolve`).set(auth(admin1)).send({ resolutionMessage: 'All clear now.' }).expect(200);
    const res = await h.http().post(`${base()}/emergencies/${r.id}/acknowledge`).set(auth(members[4]!)).expect(409);
    expect(res.body.error.code).toBe('EMERGENCY_NOT_ACTIVE');
  });

  it('E2E 15: overview, member search, audit log and update idempotency', async () => {
    const pendingUser = await h.user();
    await h.membership(community.id, pendingUser, 'MEMBER', 'PENDING');
    const ov = await h.http().get(`${base()}/admin/overview`).set(auth(admin1)).expect(200);
    expect(ov.body.memberCount).toBe(9);
    expect(ov.body.pendingRequestCount).toBe(1);
    expect(ov.body.activeEmergencyCount).toBeGreaterThanOrEqual(1);
    expect(ov.body.alertsToday).toBeGreaterThanOrEqual(3);
    await h.http().get(`${base()}/admin/overview`).set(auth(members[0]!)).expect(403);

    const search = await h.http().get(`${base()}/members?q=block%20c`).set(auth(admin1)).expect(200);
    expect(search.body.items.map((m: any) => m.user.fullName)).toEqual(['Member 2']);

    const logs = await h.http().get(`${base()}/admin/audit-logs?action=emergency.confirmed`).set(auth(admin1)).expect(200);
    expect(logs.body.items.length).toBeGreaterThan(0);
    expect(logs.body.items[0].actor).toHaveProperty('fullName');

    const active = await h.prisma.emergency.findFirstOrThrow({ where: { communityId: community.id, status: 'ACTIVE' } });
    const send = () => h.http().post(`${base()}/emergencies/${active.id}/updates`).set(auth(admin1)).set('Idempotency-Key', 'update-once-0001').send({ message: 'Please stay indoors.' });
    const [u1, u2] = await Promise.all([send(), send()]);
    expect(u1.body.id).toBe(u2.body.id);
    expect(await h.prisma.emergencyUpdate.count({ where: { emergencyId: active.id, message: 'Please stay indoors.' } })).toBe(1);
  });
});
