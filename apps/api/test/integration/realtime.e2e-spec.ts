import { io, Socket } from 'socket.io-client';
import { RealtimeEvent } from '@emcom/shared-types';
import { auth, flushRedis, Harness, TestUser } from './harness';

/** E2E 12: WebSocket authentication, unauthorized joins and membership revocation. */
describe('Realtime gateway', () => {
  let h: Harness;
  let owner: TestUser, admin: TestUser, member: TestUser, pending: TestUser, outsider: TestUser;
  let community: { id: string };
  const sockets: Socket[] = [];

  const connect = (token?: string) =>
    new Promise<Socket>((resolve, reject) => {
      const s = io(`${h.url}/realtime`, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, forceNew: true });
      sockets.push(s);
      s.on('connect', () => setTimeout(() => (s.connected ? resolve(s) : reject(new Error('disconnected'))), 150));
      s.on('connect_error', reject);
      s.on('disconnect', () => reject(new Error('disconnected')));
    });
  const join = (s: Socket, communityId: string) =>
    s.timeout(3000).emitWithAck(RealtimeEvent.JOIN_COMMUNITY, { communityId }) as Promise<{ ok: boolean; error?: string }>;
  const next = <T = any>(s: Socket, event: string, ms = 3000) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
      s.once(event, (p: T) => {
        clearTimeout(t);
        resolve(p);
      });
    });
  const none = (s: Socket, event: string, ms = 600) =>
    new Promise<void>((resolve, reject) => {
      const handler = () => reject(new Error(`unexpected ${event}`));
      s.once(event, handler);
      setTimeout(() => {
        s.off(event, handler);
        resolve();
      }, ms);
    });

  beforeAll(async () => {
    h = await Harness.start();
    owner = await h.user();
    admin = await h.user();
    member = await h.user();
    pending = await h.user();
    outsider = await h.user();
    community = await h.community(owner);
    await h.membership(community.id, admin, 'ADMIN');
    await h.membership(community.id, member, 'MEMBER');
    await h.membership(community.id, pending, 'MEMBER', 'PENDING');
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await h.stop();
  });
  beforeEach(() => flushRedis());

  it('a join sent immediately on connect waits for authentication (no race)', async () => {
    const s = io(`${h.url}/realtime`, { auth: { token: member.token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    const ack = await new Promise<{ ok: boolean }>((resolve) => s.on('connect', () => void join(s, community.id).then(resolve)));
    expect(ack).toEqual({ ok: true });
  });

  it('rejects connections without a valid token', async () => {
    await expect(connect()).rejects.toThrow();
    await expect(connect('garbage')).rejects.toThrow();
  });

  it('refuses room joins for non-members and pending members', async () => {
    const so = await connect(outsider.token);
    expect(await join(so, community.id)).toEqual({ ok: false, error: 'NOT_FOUND' });
    const sp = await connect(pending.token);
    expect(await join(sp, community.id)).toEqual({ ok: false, error: 'MEMBERSHIP_NOT_ACTIVE' });
    expect(await join(sp, 'not-a-uuid')).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('delivers community events to members; pending reports only to admins; nothing to outsiders', async () => {
    const sm = await connect(member.token);
    const sa = await connect(admin.token);
    const so = await connect(outsider.token);
    expect(await join(sm, community.id)).toEqual({ ok: true });
    expect(await join(sa, community.id)).toEqual({ ok: true });
    await join(so, community.id);

    const adminGot = next(sa, RealtimeEvent.EMERGENCY_CREATED);
    const memberNone = none(sm, RealtimeEvent.EMERGENCY_CREATED);
    const r = await h.report(member, community.id);
    expect((await adminGot).data).toEqual({ emergencyId: r.id, status: 'PENDING' });
    await memberNone;

    const memberGot = next(sm, RealtimeEvent.EMERGENCY_CREATED);
    const outsiderNone = none(so, RealtimeEvent.EMERGENCY_CREATED);
    await h.http().post(`/v1/communities/${community.id}/emergencies/${r.id}/confirm`).set(auth(admin)).send({}).expect(200);
    const evt = await memberGot;
    expect(evt).toMatchObject({ communityId: community.id, emergencyId: r.id, data: { status: 'ACTIVE' } });
    expect(typeof evt.eventId).toBe('string');
    expect(evt.seq).toBe(3);
    await outsiderNone;

    const upd = next(sm, RealtimeEvent.EMERGENCY_UPDATE);
    await h.http().post(`/v1/communities/${community.id}/emergencies/${r.id}/updates`).set(auth(admin)).send({ message: 'Stay inside' }).expect(201);
    expect((await upd).seq).toBe(4);

    const ackEvt = next(sa, RealtimeEvent.ACK_CHANGED);
    await h.http().post(`/v1/communities/${community.id}/emergencies/${r.id}/acknowledge`).set(auth(member)).expect(200);
    expect((await ackEvt).data).toMatchObject({ emergencyId: r.id, acknowledgedCount: 1 });
  });

  it('suspension immediately revokes room access; demotion leaves the admin room', async () => {
    const victim = await h.user();
    const m = await h.membership(community.id, victim, 'MEMBER');
    const sv = await connect(victim.token);
    expect(await join(sv, community.id)).toEqual({ ok: true });

    const revoked = next(sv, RealtimeEvent.ACCESS_REVOKED);
    await h.http().post(`/v1/communities/${community.id}/members/${m.id}/suspend`).set(auth(admin)).expect(200);
    expect((await revoked).communityId).toBe(community.id);
    const silent = none(sv, RealtimeEvent.EMERGENCY_CREATED, 800);
    await h.critical(owner, community.id).expect(201);
    await silent;
    expect(await join(sv, community.id)).toEqual({ ok: false, error: 'MEMBERSHIP_NOT_ACTIVE' });

    const adminUser = await h.user();
    const am = await h.membership(community.id, adminUser, 'ADMIN');
    const sa = await connect(adminUser.token);
    await join(sa, community.id);
    await h.http().post(`/v1/communities/${community.id}/members/${am.id}/role`).set(auth(owner)).send({ role: 'MEMBER' }).expect(200);
    const noPending = none(sa, RealtimeEvent.EMERGENCY_CREATED, 800);
    await h.report(member, community.id);
    await noPending;
  });
});
