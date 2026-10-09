import { auth, flushRedis, Harness, TestUser } from './harness';

describe('Memberships: state transitions and authorization matrix (E2E 8)', () => {
  let h: Harness;
  let owner: TestUser;
  let admin: TestUser;
  let community: { id: string; code: string };

  beforeAll(async () => {
    h = await Harness.start();
    owner = await h.user();
    admin = await h.user();
    community = await h.community(owner);
    await h.membership(community.id, admin, 'ADMIN');
  });
  afterAll(() => h.stop());
  beforeEach(() => flushRedis());

  const act = (who: TestUser, membershipId: string, action: string) =>
    h.http().post(`/v1/communities/${community.id}/members/${membershipId}/${action}`).set(auth(who));

  async function joinPending(): Promise<{ user: TestUser; membershipId: string }> {
    const user = await h.user();
    const res = await h.http().post('/v1/communities/join').set(auth(user)).send({ code: community.code }).expect(201);
    return { user, membershipId: res.body.id };
  }

  it.each(['PENDING', 'REJECTED', 'SUSPENDED', 'REMOVED', 'LEFT'] as const)(
    '%s members cannot read incidents, report, trigger critical alerts or acknowledge',
    async (status) => {
      const u = await h.user();
      await h.membership(community.id, u, 'MEMBER', status);
      const base = `/v1/communities/${community.id}`;
      const checks = [
        h.http().get(base).set(auth(u)),
        h.http().get(`${base}/emergencies`).set(auth(u)),
        h.http().post(`${base}/emergencies`).set(auth(u)).send({ category: 'FIRE', location: 'X', description: 'test fire' }),
        h.http().post(`${base}/critical-alerts`).set(auth(u)).send({}),
        h.http().post(`${base}/media/uploads`).set(auth(u)).send({ contentType: 'image/jpeg', sizeBytes: 100 }),
      ];
      for (const res of await Promise.all(checks)) {
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('MEMBERSHIP_NOT_ACTIVE');
      }
      // ...but can always read their own membership status.
      const mine = await h.http().get(`${base}/membership`).set(auth(u)).expect(200);
      expect(mine.body.status).toBe(status);
    },
  );

  it('non-members get 404 (community existence is not revealed)', async () => {
    const stranger = await h.user();
    const res = await h.http().get(`/v1/communities/${community.id}/emergencies`).set(auth(stranger)).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('approve / reject / suspend / reinstate / remove follow the state machine', async () => {
    const a = await joinPending();
    await act(admin, a.membershipId, 'approve').expect(200);
    const again = await act(admin, a.membershipId, 'approve').expect(409);
    expect(again.body.error.code).toBe('INVALID_STATE_TRANSITION');
    await act(admin, a.membershipId, 'suspend').expect(200);
    await h.http().get(`/v1/communities/${community.id}`).set(auth(a.user)).expect(403);
    await act(admin, a.membershipId, 'reinstate').expect(200);
    await h.http().get(`/v1/communities/${community.id}`).set(auth(a.user)).expect(200);
    await act(admin, a.membershipId, 'remove').expect(200);
    await h.http().get(`/v1/communities/${community.id}`).set(auth(a.user)).expect(403);
    // Removed users may request again with a valid code (back to PENDING, never straight to APPROVED).
    const rejoin = await h.http().post('/v1/communities/join').set(auth(a.user)).send({ code: community.code }).expect(201);
    expect(rejoin.body.status).toBe('PENDING');

    const b = await joinPending();
    await act(admin, b.membershipId, 'reject').expect(200);
    await act(admin, b.membershipId, 'suspend').expect(409);
    const re = await h.http().post('/v1/communities/join').set(auth(b.user)).send({ code: community.code }).expect(201);
    expect(re.body.status).toBe('PENDING');

    const actions = await h.prisma.auditLog.findMany({ where: { communityId: community.id, entityId: a.membershipId }, orderBy: { createdAt: 'asc' } });
    expect(actions.map((x) => x.action)).toEqual([
      'membership.requested',
      'membership.approved',
      'membership.suspended',
      'membership.reinstated',
      'membership.removed',
      'membership.requested',
    ]);
  });

  it('suspended users cannot re-join by code', async () => {
    const s = await joinPending();
    await act(admin, s.membershipId, 'approve').expect(200);
    await act(admin, s.membershipId, 'suspend').expect(200);
    const res = await h.http().post('/v1/communities/join').set(auth(s.user)).send({ code: community.code }).expect(403);
    expect(res.body.error.code).toBe('MEMBERSHIP_SUSPENDED');
  });

  it('admins cannot moderate admins or the owner; members cannot moderate anyone', async () => {
    const ownerM = await h.prisma.communityMembership.findFirstOrThrow({ where: { communityId: community.id, userId: owner.id } });
    const otherAdmin = await h.user();
    const oa = await h.membership(community.id, otherAdmin, 'ADMIN');
    const member = await h.user();
    const mm = await h.membership(community.id, member, 'MEMBER');

    await act(admin, ownerM.id, 'suspend').expect(403);
    await act(admin, oa.id, 'remove').expect(403);
    await act(member, mm.id, 'suspend').expect(403);
    const self = await act(admin, (await h.prisma.communityMembership.findFirstOrThrow({ where: { userId: admin.id, communityId: community.id } })).id, 'suspend').expect(403);
    expect(self.body.error.code).toBe('FORBIDDEN');
    // Owner can moderate an admin.
    await act(owner, oa.id, 'suspend').expect(200);
  });

  it('only the owner adds/removes admins; the owner role is immutable', async () => {
    const m = await h.user();
    const mm = await h.membership(community.id, m, 'MEMBER');
    const ownerM = await h.prisma.communityMembership.findFirstOrThrow({ where: { communityId: community.id, userId: owner.id } });

    await h.http().post(`/v1/communities/${community.id}/members/${mm.id}/role`).set(auth(admin)).send({ role: 'ADMIN' }).expect(403);
    const promoted = await h.http().post(`/v1/communities/${community.id}/members/${mm.id}/role`).set(auth(owner)).send({ role: 'ADMIN' }).expect(200);
    expect(promoted.body.role).toBe('ADMIN');
    await h.http().get(`/v1/communities/${community.id}/members`).set(auth(m)).expect(200);
    await h.http().post(`/v1/communities/${community.id}/members/${mm.id}/role`).set(auth(owner)).send({ role: 'MEMBER' }).expect(200);
    await h.http().get(`/v1/communities/${community.id}/members`).set(auth(m)).expect(403);
    await h.http().post(`/v1/communities/${community.id}/members/${ownerM.id}/role`).set(auth(owner)).send({ role: 'MEMBER' }).expect(403);
    await h.http().post(`/v1/communities/${community.id}/members/${mm.id}/role`).set(auth(owner)).send({ role: 'OWNER' }).expect(400);
    const log = await h.prisma.auditLog.count({ where: { action: 'membership.role_changed', entityId: mm.id } });
    expect(log).toBe(2);
  });

  it('members can leave; the owner cannot', async () => {
    const m = await h.user();
    await h.membership(community.id, m, 'MEMBER');
    await h.http().post(`/v1/communities/${community.id}/leave`).set(auth(m)).expect(200);
    await h.http().get(`/v1/communities/${community.id}`).set(auth(m)).expect(403);
    const res = await h.http().post(`/v1/communities/${community.id}/leave`).set(auth(owner)).expect(409);
    expect(res.body.error.code).toBe('OWNER_CANNOT_LEAVE');
  });

  it('concurrent approve + reject on the same request yields exactly one decision', async () => {
    const p = await joinPending();
    const results = await Promise.all([act(admin, p.membershipId, 'approve'), act(owner, p.membershipId, 'reject')]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    const decisions = await h.prisma.auditLog.count({
      where: { entityId: p.membershipId, action: { in: ['membership.approved', 'membership.rejected'] } },
    });
    expect(decisions).toBe(1);
  });
});
