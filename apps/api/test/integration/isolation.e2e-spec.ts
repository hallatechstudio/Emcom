import { auth, flushRedis, Harness, TestUser } from './harness';

/** E2E 7: an alert from Community A must NEVER reach Community B (PRD §4). */
describe('Community isolation and IDOR protection', () => {
  let h: Harness;
  let ownerA: TestUser, adminA: TestUser, memberA: TestUser;
  let ownerB: TestUser, adminB: TestUser, memberB: TestUser;
  let both: TestUser;
  let A: { id: string }, B: { id: string };

  beforeAll(async () => {
    h = await Harness.start();
    [ownerA, adminA, memberA, ownerB, adminB, memberB, both] = await Promise.all(Array.from({ length: 7 }, () => h.user()));
    A = await h.community(ownerA, { name: 'Community A' });
    B = await h.community(ownerB, { name: 'Community B' });
    await h.membership(A.id, adminA, 'ADMIN');
    await h.membership(A.id, memberA, 'MEMBER');
    await h.membership(B.id, adminB, 'ADMIN');
    await h.membership(B.id, memberB, 'MEMBER');
    await h.membership(A.id, both, 'MEMBER');
    await h.membership(B.id, both, 'ADMIN');
    for (const u of [ownerA, adminA, memberA, ownerB, adminB, memberB, both]) await h.device(u);
  });
  afterAll(() => h.stop());
  beforeEach(() => flushRedis());

  it('broadcasts in A notify only A members — no inbox rows, no push deliveries in B', async () => {
    const crit = await h.critical(memberA, A.id).expect(201);
    const report = await h.report(memberA, A.id);
    await h.http().post(`/v1/communities/${A.id}/emergencies/${report.id}/confirm`).set(auth(adminA)).send({}).expect(200);
    await h.drain();

    for (const id of [crit.body.emergency.id, report.id]) {
      const recipients = await h.prisma.notification.findMany({ where: { emergencyId: id }, select: { userId: true, communityId: true } });
      const userIds = new Set(recipients.map((r) => r.userId));
      expect(userIds.has(memberB.id)).toBe(false);
      expect(userIds.has(adminB.id)).toBe(false);
      expect(userIds.has(ownerB.id)).toBe(false);
      expect(recipients.every((r) => r.communityId === A.id)).toBe(true);
    }
    // The user in both communities gets A's alert labelled with A.
    const bothInbox = await h.http().get('/v1/notifications').set(auth(both)).expect(200);
    expect(bothInbox.body.items.every((n: any) => n.communityId === A.id)).toBe(true);
    const bInbox = await h.http().get('/v1/notifications').set(auth(memberB)).expect(200);
    expect(bInbox.body.items).toHaveLength(0);
  });

  it('A resources cannot be read or acted on through B routes or by B members (IDOR)', async () => {
    const crit = await h.critical(memberA, A.id, `iso-${Date.now()}`).expect(201);
    const eid = crit.body.emergency.id;
    // B admin via B's community route with A's emergency id → not found.
    await h.http().get(`/v1/communities/${B.id}/emergencies/${eid}`).set(auth(adminB)).expect(404);
    await h.http().post(`/v1/communities/${B.id}/emergencies/${eid}/resolve`).set(auth(adminB)).send({ resolutionMessage: 'cross-community' }).expect(404);
    await h.http().post(`/v1/communities/${B.id}/emergencies/${eid}/updates`).set(auth(adminB)).send({ message: 'cross-community' }).expect(404);
    await h.http().post(`/v1/communities/${B.id}/emergencies/${eid}/acknowledge`).set(auth(memberB)).expect(404);
    await h.http().get(`/v1/communities/${B.id}/emergencies/${eid}/acknowledgments`).set(auth(adminB)).expect(404);
    await h.http().get(`/v1/communities/${B.id}/emergencies/${eid}/timeline`).set(auth(adminB)).expect(404);
    // B admin via A's route → not a member of A.
    await h.http().get(`/v1/communities/${A.id}/emergencies/${eid}`).set(auth(adminB)).expect(404);
    // "both" is ADMIN in B but only MEMBER in A: no admin powers in A.
    await h.http().post(`/v1/communities/${A.id}/emergencies/${eid}/resolve`).set(auth(both)).send({ resolutionMessage: 'not allowed here' }).expect(403);
    await h.http().post(`/v1/communities/${B.id}/emergencies/${eid}/resolve`).set(auth(both)).send({ resolutionMessage: 'wrong community' }).expect(404);

    // Membership ids from A cannot be moderated through B.
    const mA = await h.prisma.communityMembership.findFirstOrThrow({ where: { communityId: A.id, userId: memberA.id } });
    await h.http().post(`/v1/communities/${B.id}/members/${mA.id}/suspend`).set(auth(ownerB)).expect(404);
    await h.http().post(`/v1/communities/${B.id}/members/${mA.id}/role`).set(auth(ownerB)).send({ role: 'ADMIN' }).expect(404);
    expect((await h.prisma.communityMembership.findUniqueOrThrow({ where: { id: mA.id } })).status).toBe('APPROVED');

    // Lists are scoped.
    const listB = await h.http().get(`/v1/communities/${B.id}/emergencies`).set(auth(adminB)).expect(200);
    expect(listB.body.items.find((e: any) => e.id === eid)).toBeUndefined();
    const membersB = await h.http().get(`/v1/communities/${B.id}/members`).set(auth(adminB)).expect(200);
    expect(membersB.body.items.every((m: any) => m.communityId === B.id)).toBe(true);
  });

  it('media uploaded in A cannot be attached to or downloaded from B', async () => {
    const up = await h.http().post(`/v1/communities/${A.id}/media/uploads`).set(auth(both)).send({ contentType: 'image/jpeg', sizeBytes: 4 }).expect(201);
    await fetch(up.body.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: Buffer.from('abcd') });
    const r = await h.report(both, B.id, { mediaIds: [up.body.mediaId] });
    const detail = await h.http().get(`/v1/communities/${B.id}/emergencies/${r.id}`).set(auth(adminB)).expect(200);
    expect(detail.body.media).toEqual([]);
    await h.http().get(`/v1/communities/${B.id}/media/${up.body.mediaId}`).set(auth(adminB)).expect(404);
  });

  it('notifications of other users cannot be read or marked', async () => {
    await h.drain();
    const n = await h.prisma.notification.findFirstOrThrow({ where: { userId: memberA.id } });
    await h.http().post(`/v1/notifications/${n.id}/read`).set(auth(memberB)).expect(404);
    await h.http().post(`/v1/notifications/${n.id}/read`).set(auth(memberA)).expect(200);
  });

  it('dev mock push log only shows the caller’s own devices', async () => {
    const mine = await h.http().get('/v1/dev/mock-pushes').set(auth(memberB)).expect(200);
    expect(mine.body).toHaveLength(0);
  });
});
