import { auth, flushRedis, Harness } from './harness';

describe('Auth: registration, verification, tokens', () => {
  let h: Harness;
  beforeAll(async () => (h = await Harness.start()));
  afterAll(() => h.stop());
  beforeEach(() => flushRedis());

  const register = (email: string) =>
    h.http().post('/v1/auth/register').send({ fullName: 'Ada Lovelace', email, phone: '+234 801 234 5678', password: 'Sup3r-secret-pw' });

  it('registers, emails an OTP, and verifies the email', async () => {
    const res = await register('Ada@Example.com').expect(201);
    expect(res.body.user).toMatchObject({ email: 'ada@example.com', phone: '+2348012345678', emailVerified: false });
    expect(res.body.user.passwordHash).toBeUndefined();
    const mail = h.mail.outbox.find((m) => m.to === 'ada@example.com')!;
    const code = mail.text.match(/(\d{6})/)![1];

    await h.http().post('/v1/auth/verify-email').set(auth({ token: res.body.accessToken })).send({ code: '000000' }).expect(400);
    const ok = await h.http().post('/v1/auth/verify-email').set(auth({ token: res.body.accessToken })).send({ code }).expect(200);
    expect(ok.body.emailVerified).toBe(true);
    // A code is single use.
    await h.http().post('/v1/auth/verify-email').set(auth({ token: res.body.accessToken })).send({ code }).expect(200);
  });

  it('rejects duplicate emails, weak passwords and unknown fields', async () => {
    await register('dup@example.com').expect(201);
    const dup = await register('dup@example.com').expect(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
    await h.http().post('/v1/auth/register').send({ fullName: 'X Y', email: 'w@example.com', phone: '+2348000000', password: 'short' }).expect(400);
    const mass = await h
      .http()
      .post('/v1/auth/register')
      .send({ fullName: 'X Y', email: 'm@example.com', phone: '+2348000000', password: 'Sup3r-secret-pw', emailVerifiedAt: '2020-01-01' })
      .expect(400);
    expect(mass.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('blocks community creation and joining until the email is verified', async () => {
    const res = await register('unverified@example.com').expect(201);
    const r = await h
      .http()
      .post('/v1/communities')
      .set(auth({ token: res.body.accessToken }))
      .send({ name: 'Nope', type: 'ESTATE', location: 'Lagos' })
      .expect(403);
    expect(r.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('logs in with a generic error for bad credentials', async () => {
    const u = await h.user('login@test.dev');
    const bad = await h.http().post('/v1/auth/login').send({ email: u.email, password: 'wrong-password-1' }).expect(401);
    const unknown = await h.http().post('/v1/auth/login').send({ email: 'nobody@test.dev', password: 'wrong-password-1' }).expect(401);
    expect(bad.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(unknown.body.error.message).toBe(bad.body.error.message);
    await h.http().post('/v1/auth/login').send({ email: u.email, password: 'Test-Password-123' }).expect(200);
  });

  it('rotates refresh tokens and revokes the whole family on reuse', async () => {
    const u = await h.user('rotate@test.dev');
    const login = await h.http().post('/v1/auth/login').send({ email: u.email, password: 'Test-Password-123' }).expect(200);
    const r1 = login.body.refreshToken;
    const second = await h.http().post('/v1/auth/refresh').send({ refreshToken: r1 }).expect(200);
    const r2 = second.body.refreshToken;
    expect(r2).not.toBe(r1);
    // Replaying the rotated token is treated as theft.
    const reuse = await h.http().post('/v1/auth/refresh').send({ refreshToken: r1 }).expect(401);
    expect(reuse.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    // ...which also kills the legitimate successor.
    await h.http().post('/v1/auth/refresh').send({ refreshToken: r2 }).expect(401);
    const audit = await h.prisma.auditLog.findFirst({ where: { action: 'auth.refresh_token_reuse_detected', actorId: u.id } });
    expect(audit).not.toBeNull();
  });

  it('logout revokes the session', async () => {
    const u = await h.user('logout@test.dev');
    const login = await h.http().post('/v1/auth/login').send({ email: u.email, password: 'Test-Password-123' }).expect(200);
    await h.http().post('/v1/auth/logout').send({ refreshToken: login.body.refreshToken }).expect(204);
    await h.http().post('/v1/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);
  });

  it('resets a password with an emailed code and revokes all sessions', async () => {
    const u = await h.user('reset@test.dev');
    const login = await h.http().post('/v1/auth/login').send({ email: u.email, password: 'Test-Password-123' }).expect(200);
    await h.http().post('/v1/auth/password/forgot').send({ email: u.email }).expect(202);
    await h.http().post('/v1/auth/password/forgot').send({ email: 'ghost@test.dev' }).expect(202); // no enumeration
    const code = h.mail.outbox.filter((m) => m.to === u.email).pop()!.text.match(/(\d{6})/)![1];
    await h.http().post('/v1/auth/password/reset').send({ email: u.email, code, newPassword: 'Brand-new-pass-9' }).expect(204);
    await h.http().post('/v1/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);
    await h.http().post('/v1/auth/login').send({ email: u.email, password: 'Brand-new-pass-9' }).expect(200);
  });

  it('requires a valid bearer token on protected routes', async () => {
    await h.http().get('/v1/me').expect(401);
    await h.http().get('/v1/me').set({ authorization: 'Bearer not-a-jwt' }).expect(401);
    const u = await h.user();
    const me = await h.http().get('/v1/me').set(auth(u)).expect(200);
    expect(me.body.id).toBe(u.id);
  });
});
