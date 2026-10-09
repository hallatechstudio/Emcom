import { auth, flushRedis, Harness } from './harness';

describe('Communities: create, join, approve, code rotation, settings', () => {
  let h: Harness;
  beforeAll(async () => (h = await Harness.start()));
  afterAll(() => h.stop());
  beforeEach(() => flushRedis());

  it('E2E 1: register → create community → join → approve', async () => {
    // Register a real user through the API and verify email.
    const reg = await h
      .http()
      .post('/v1/auth/register')
      .send({ fullName: 'Owner One', email: 'owner1@test.dev', phone: '+2348011111111', password: 'Owner-pass-123' })
      .expect(201);
    const code = h.mail.outbox.find((m) => m.to === 'owner1@test.dev')!.text.match(/(\d{6})/)![1];
    const owner = { id: reg.body.user.id, token: reg.body.accessToken };
    await h.http().post('/v1/auth/verify-email').set(auth(owner)).send({ code }).expect(200);

    const created = await h
      .http()
      .post('/v1/communities')
      .set(auth(owner))
      .send({
        name: 'Jacob Mews',
        type: 'ESTATE',
        location: 'Lagos, Nigeria',
        description: 'Estate',
        identificationField: { label: 'Block / Apartment', required: true },
        whatsappUrl: 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQr',
      })
      .expect(201);
    expect(created.body.membership).toMatchObject({ role: 'OWNER', status: 'APPROVED' });
    const communityId = created.body.community.id;
    const inviteCode = created.body.community.inviteCode as string;
    expect(inviteCode).toMatch(/^JACOB[A-Z2-9]{5}$/);

    const member = await h.user('joiner@test.dev');
    const preview = await h.http().get(`/v1/communities/preview?code=${inviteCode.toLowerCase()}`).set(auth(member)).expect(200);
    expect(preview.body).toMatchObject({ name: 'Jacob Mews', type: 'ESTATE', identificationField: { label: 'Block / Apartment', required: true } });
    expect(preview.body.inviteCode).toBeUndefined();
    expect(preview.body.whatsappUrl).toBeUndefined();

    const missing = await h.http().post('/v1/communities/join').set(auth(member)).send({ code: inviteCode }).expect(400);
    expect(missing.body.error.code).toBe('IDENTIFICATION_REQUIRED');
    const joined = await h.http().post('/v1/communities/join').set(auth(member)).send({ code: inviteCode, identificationValue: 'B12' }).expect(201);
    expect(joined.body).toMatchObject({ status: 'PENDING', role: 'MEMBER', identificationValue: 'B12' });
    // Re-submitting is idempotent.
    await h.http().post('/v1/communities/join').set(auth(member)).send({ code: inviteCode, identificationValue: 'B12' }).expect(201);

    // Pending member cannot see community details.
    const blocked = await h.http().get(`/v1/communities/${communityId}`).set(auth(member)).expect(403);
    expect(blocked.body.error.code).toBe('MEMBERSHIP_NOT_ACTIVE');

    // Owner sees the request and approves it; join-request notification was fanned out to admins.
    await h.drain();
    const inbox = await h.http().get('/v1/notifications').set(auth(owner)).expect(200);
    expect(inbox.body.items.map((n: { type: string }) => n.type)).toContain('JOIN_REQUEST');
    const pending = await h.http().get(`/v1/communities/${communityId}/members?status=PENDING`).set(auth(owner)).expect(200);
    expect(pending.body.items).toHaveLength(1);
    await h.http().post(`/v1/communities/${communityId}/members/${joined.body.id}/approve`).set(auth(owner)).expect(200);

    const detail = await h.http().get(`/v1/communities/${communityId}`).set(auth(member)).expect(200);
    expect(detail.body.whatsappUrl).toBe('https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQr');
    expect(detail.body.inviteCode).toBeUndefined(); // members do not see the code
    await h.drain();
    const memberInbox = await h.http().get('/v1/notifications').set(auth(member)).expect(200);
    expect(memberInbox.body.items[0].type).toBe('MEMBERSHIP_APPROVED');
  });

  it('E2E 2: one user holds different roles in different communities', async () => {
    const david = await h.user('david@test.dev');
    const a = await h.user('a-owner@test.dev');
    const c = await h.user('c-owner@test.dev');
    const own = await h.community(david, { name: 'Davids Church', type: 'CHURCH' });
    const commA = await h.community(a, { name: 'Estate A' });
    const commC = await h.community(c, { name: 'Workplace C', type: 'WORKPLACE' });
    await h.membership(commA.id, david, 'MEMBER');
    await h.membership(commC.id, david, 'ADMIN');

    const mine = await h.http().get('/v1/communities/mine').set(auth(david)).expect(200);
    const roles = Object.fromEntries(mine.body.map((m: any) => [m.community.name, m.membership.role]));
    expect(roles).toEqual({ 'Davids Church': 'OWNER', 'Estate A': 'MEMBER', 'Workplace C': 'ADMIN' });

    // Admin powers apply only where David is admin.
    await h.http().get(`/v1/communities/${commC.id}/members`).set(auth(david)).expect(200);
    const denied = await h.http().get(`/v1/communities/${commA.id}/members`).set(auth(david)).expect(403);
    expect(denied.body.error.code).toBe('INSUFFICIENT_ROLE');
    // Owner-only actions only in his own community.
    await h.http().post(`/v1/communities/${own.id}/invite-code/rotate`).set(auth(david)).expect(200);
    await h.http().post(`/v1/communities/${commC.id}/invite-code/rotate`).set(auth(david)).expect(403);
  });

  it('rotating the code never removes members and retires the old code', async () => {
    const owner = await h.user();
    const m = await h.user();
    const c = await h.community(owner);
    await h.membership(c.id, m, 'MEMBER');
    const rotated = await h.http().post(`/v1/communities/${c.id}/invite-code/rotate`).set(auth(owner)).expect(200);
    expect(rotated.body.inviteCode).not.toBe(c.code);
    await h.http().get(`/v1/communities/${c.id}`).set(auth(m)).expect(200);
    const joiner = await h.user();
    await h.http().post('/v1/communities/join').set(auth(joiner)).send({ code: c.code }).expect(404);
    await h.http().post('/v1/communities/join').set(auth(joiner)).send({ code: rotated.body.inviteCode }).expect(201);
    const log = await h.prisma.auditLog.findFirst({ where: { action: 'community.invite_code_rotated', communityId: c.id } });
    expect(log?.actorId).toBe(owner.id);
  });

  it('enforces owner-only vs admin settings and validates the WhatsApp link', async () => {
    const owner = await h.user();
    const admin = await h.user();
    const member = await h.user();
    const c = await h.community(owner);
    await h.membership(c.id, admin, 'ADMIN');
    await h.membership(c.id, member, 'MEMBER');

    await h.http().patch(`/v1/communities/${c.id}`).set(auth(admin)).send({ whatsappUrl: 'https://chat.whatsapp.com/ValidGroupCode123' }).expect(200);
    const ownerOnly = await h.http().patch(`/v1/communities/${c.id}`).set(auth(admin)).send({ name: 'Hijacked' }).expect(403);
    expect(ownerOnly.body.error.code).toBe('INSUFFICIENT_ROLE');
    await h.http().patch(`/v1/communities/${c.id}`).set(auth(member)).send({ description: 'x' }).expect(403);
    await h.http().patch(`/v1/communities/${c.id}`).set(auth(owner)).send({ name: 'Renamed Estate' }).expect(200);

    for (const bad of ['http://chat.whatsapp.com/abcdefghijk', 'https://evil.com/chat.whatsapp.com', 'javascript:alert(1)', 'https://chat.whatsapp.com.evil.io/abcdefghijk']) {
      await h.http().patch(`/v1/communities/${c.id}`).set(auth(owner)).send({ whatsappUrl: bad }).expect(400);
    }
    await h.http().patch(`/v1/communities/${c.id}`).set(auth(owner)).send({ whatsappUrl: null }).expect(200);

    // Identification field is owner-only.
    await h.http().put(`/v1/communities/${c.id}/identification-field`).set(auth(admin)).send({ field: { label: 'Department', required: true } }).expect(403);
    const f = await h.http().put(`/v1/communities/${c.id}/identification-field`).set(auth(owner)).send({ field: { label: 'Department', required: true } }).expect(200);
    expect(f.body.identificationField).toEqual({ label: 'Department', required: true });
    const cleared = await h.http().put(`/v1/communities/${c.id}/identification-field`).set(auth(owner)).send({ field: null }).expect(200);
    expect(cleared.body.identificationField).toBeNull();
  });

  it('rate-limits community code previews to slow down guessing', async () => {
    const u = await h.user();
    for (let i = 0; i < 20; i++) await h.http().get('/v1/communities/preview?code=ZZZZZ2345').set(auth(u)).expect(404);
    const limited = await h.http().get('/v1/communities/preview?code=ZZZZZ2345').set(auth(u)).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});
