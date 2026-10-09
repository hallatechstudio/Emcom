import { auth, flushRedis, Harness, TestUser } from './harness';

describe('Normal emergency workflow (E2E 3, 4)', () => {
  let h: Harness;
  let owner: TestUser;
  let admin: TestUser;
  let reporter: TestUser;
  let member: TestUser;
  let community: { id: string };
  const base = () => `/v1/communities/${community.id}`;

  beforeAll(async () => {
    h = await Harness.start();
    owner = await h.user('owner@e.dev', { fullName: 'Olu Owner' });
    admin = await h.user('admin@e.dev', { fullName: 'Ama Admin' });
    reporter = await h.user('reporter@e.dev', { fullName: 'Rita Reporter' });
    member = await h.user('member@e.dev', { fullName: 'Max Member' });
    community = await h.community(owner, { name: 'Jacob Mews' });
    await h.membership(community.id, admin, 'ADMIN');
    await h.membership(community.id, reporter, 'MEMBER', 'APPROVED', 'B12');
    await h.membership(community.id, member, 'MEMBER', 'APPROVED', 'C3');
    for (const u of [owner, admin, reporter, member]) await h.device(u);
  });
  afterAll(() => h.stop());
  beforeEach(() => flushRedis());

  it('report → admin notified → confirm & broadcast → acknowledge → update → resolve → history', async () => {
    const report = await h.report(reporter, community.id, { category: 'FIRE', location: 'Block B', description: 'Fire near Block B' });
    expect(report.status).toBe('PENDING');

    // Pending reports are invisible to other members.
    await h.http().get(`${base()}/emergencies/${report.id}`).set(auth(member)).expect(404);
    const memberActive = await h.http().get(`${base()}/emergencies?status=PENDING`).set(auth(member)).expect(200);
    expect(memberActive.body.items).toHaveLength(0);
    // Reporter can follow their own report.
    await h.http().get(`${base()}/emergencies/${report.id}`).set(auth(reporter)).expect(200);

    await h.drain();
    const adminInbox = await h.http().get('/v1/notifications').set(auth(admin)).expect(200);
    expect(adminInbox.body.items[0]).toMatchObject({ type: 'EMERGENCY_REPORT_RECEIVED', priority: 'HIGH', emergencyId: report.id });
    const memberInbox0 = await h.http().get('/v1/notifications').set(auth(member)).expect(200);
    expect(memberInbox0.body.items).toHaveLength(0);

    // Members cannot confirm.
    await h.http().post(`${base()}/emergencies/${report.id}/confirm`).set(auth(member)).send({}).expect(403);
    const confirmed = await h
      .http()
      .post(`${base()}/emergencies/${report.id}/confirm`)
      .set(auth(admin))
      .send({ instructions: 'Avoid the area and follow community instructions.' })
      .expect(200);
    expect(confirmed.body).toMatchObject({ status: 'ACTIVE', instructions: 'Avoid the area and follow community instructions.' });
    expect(confirmed.body.alert.recipientCount).toBe(4);

    await h.drain();
    const inbox = await h.http().get('/v1/notifications').set(auth(member)).expect(200);
    expect(inbox.body.items[0]).toMatchObject({ type: 'EMERGENCY_BROADCAST', priority: 'CRITICAL', emergencyId: report.id, communityId: community.id });
    expect(inbox.body.items[0].title).toContain('FIRE');
    const reporterInbox = await h.http().get('/v1/notifications').set(auth(reporter)).expect(200);
    expect(reporterInbox.body.items.map((n: any) => n.type)).toEqual(expect.arrayContaining(['EMERGENCY_BROADCAST', 'EMERGENCY_CONFIRMED']));
    const deliveries = await h.prisma.notificationDelivery.findMany({ where: { notification: { emergencyId: report.id, type: 'EMERGENCY_BROADCAST' } } });
    expect(deliveries).toHaveLength(4);
    expect(deliveries.every((d) => d.status === 'PROVIDER_ACCEPTED')).toBe(true);

    // Members see the active emergency without the reporter's identity.
    const seen = await h.http().get(`${base()}/emergencies/${report.id}`).set(auth(member)).expect(200);
    expect(seen.body.reporter).toBeNull();
    expect(seen.body.myAcknowledgedAt).toBeNull();

    const ack = await h.http().post(`${base()}/emergencies/${report.id}/acknowledge`).set(auth(member)).expect(200);
    expect(ack.body.alreadyAcknowledged).toBe(false);
    const ack2 = await h.http().post(`${base()}/emergencies/${report.id}/acknowledge`).set(auth(member)).expect(200);
    expect(ack2.body).toEqual({ acknowledgedAt: ack.body.acknowledgedAt, alreadyAcknowledged: true });

    const summary = await h.http().get(`${base()}/emergencies/${report.id}/acknowledgments`).set(auth(admin)).expect(200);
    expect(summary.body).toMatchObject({ recipientCount: 4, acknowledgedCount: 1, notAcknowledgedCount: 3 });
    expect(summary.body.delivery.PROVIDER_ACCEPTED).toBe(4);
    await h.http().get(`${base()}/emergencies/${report.id}/acknowledgments`).set(auth(member)).expect(403);

    const upd = await h.http().post(`${base()}/emergencies/${report.id}/updates`).set(auth(admin)).send({ message: 'Fire service has arrived at Block B.' }).expect(201);
    await h.http().post(`${base()}/emergencies/${report.id}/updates`).set(auth(member)).send({ message: 'I am an admin now' }).expect(403);
    const updates = await h.http().get(`${base()}/emergencies/${report.id}/updates`).set(auth(member)).expect(200);
    expect(updates.body).toEqual([expect.objectContaining({ id: upd.body.id, message: 'Fire service has arrived at Block B.' })]);

    await h.drain();
    await h.http().post(`${base()}/emergencies/${report.id}/resolve`).set(auth(admin)).send({ resolutionMessage: '' }).expect(400);
    const resolved = await h
      .http()
      .post(`${base()}/emergencies/${report.id}/resolve`)
      .set(auth(admin))
      .send({ resolutionMessage: 'Fire put out. Situation resolved.' })
      .expect(200);
    expect(resolved.body).toMatchObject({ status: 'RESOLVED', resolutionMessage: 'Fire put out. Situation resolved.' });
    await h.http().post(`${base()}/emergencies/${report.id}/resolve`).set(auth(admin)).send({ resolutionMessage: 'Again resolved?' }).expect(409);
    await h.http().post(`${base()}/emergencies/${report.id}/updates`).set(auth(admin)).send({ message: 'late update' }).expect(409);

    await h.drain();
    const types = (await h.http().get('/v1/notifications').set(auth(member)).expect(200)).body.items.map((n: any) => n.type);
    expect(types.slice(0, 3)).toEqual(['EMERGENCY_RESOLVED', 'EMERGENCY_UPDATE', 'EMERGENCY_BROADCAST']);

    const history = await h.http().get(`${base()}/emergencies?status=RESOLVED`).set(auth(member)).expect(200);
    expect(history.body.items.map((e: any) => e.id)).toContain(report.id);
    const timeline = await h.http().get(`${base()}/emergencies/${report.id}/timeline`).set(auth(member)).expect(200);
    expect(timeline.body.map((e: any) => e.type)).toEqual(['REPORTED', 'CONFIRMED', 'COMMUNITY_ALERTED', 'UPDATE_SENT', 'RESOLVED']);
    expect(timeline.body.map((e: any) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(timeline.body[0].actor).toBeNull(); // reporter hidden from other members
    const adminTimeline = await h.http().get(`${base()}/emergencies/${report.id}/timeline`).set(auth(admin)).expect(200);
    expect(adminTimeline.body[0].actor.fullName).toBe('Rita Reporter');

    const audit = await h.prisma.auditLog.findMany({ where: { entityId: report.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => a.action)).toEqual([
      'emergency.reported',
      'emergency.confirmed',
      'emergency.broadcast_queued',
      'emergency.update_sent',
      'emergency.resolved',
    ]);
  });

  it('E2E 4: a dismissed report never reaches members and stays in admin history', async () => {
    const report = await h.report(reporter, community.id, { category: 'GAS_LEAK', location: 'Block D', description: 'Smell of gas' });
    await h.http().post(`${base()}/emergencies/${report.id}/dismiss`).set(auth(member)).send({}).expect(403);
    const dismissed = await h.http().post(`${base()}/emergencies/${report.id}/dismiss`).set(auth(admin)).send({ reason: 'Checked: no leak' }).expect(200);
    expect(dismissed.body.status).toBe('DISMISSED');
    await h.http().post(`${base()}/emergencies/${report.id}/confirm`).set(auth(admin)).send({}).expect(409);
    await h.drain();

    const memberView = await h.http().get(`${base()}/emergencies?status=DISMISSED`).set(auth(member)).expect(200);
    expect(memberView.body.items).toHaveLength(0);
    await h.http().get(`${base()}/emergencies/${report.id}`).set(auth(member)).expect(404);
    await h.http().get(`${base()}/emergencies/${report.id}/timeline`).set(auth(member)).expect(404);
    const memberNotifications = await h.prisma.notification.count({ where: { emergencyId: report.id, userId: member.id } });
    expect(memberNotifications).toBe(0);
    expect(await h.prisma.emergencyAlert.count({ where: { emergencyId: report.id } })).toBe(0);

    const adminView = await h.http().get(`${base()}/emergencies?status=DISMISSED`).set(auth(admin)).expect(200);
    expect(adminView.body.items.map((e: any) => e.id)).toContain(report.id);
    expect(adminView.body.items[0].dismissalReason).toBe('Checked: no leak');
    const reporterView = await h.http().get(`${base()}/emergencies/${report.id}`).set(auth(reporter)).expect(200);
    expect(reporterView.body.status).toBe('DISMISSED');
    expect(reporterView.body.dismissalReason).toBeNull();
  });

  it('validates report input and rejects free-form status changes', async () => {
    const bad = await h.http().post(`${base()}/emergencies`).set(auth(member)).send({ category: 'ALIENS', location: 'x', description: 'y' }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    await h.http().post(`${base()}/emergencies`).set(auth(member)).send({ category: 'FIRE', location: 'Block A', description: 'fire', status: 'ACTIVE' }).expect(400);
    await h.http().patch(`${base()}/emergencies/00000000-0000-4000-8000-000000000000`).set(auth(admin)).send({ status: 'RESOLVED' }).expect(404);
    await h.http().post(`${base()}/emergencies`).set(auth(member)).set('Idempotency-Key', 'bad key!').send({ category: 'FIRE', location: 'Block A', description: 'fire' }).expect(400);
  });

  it('attaches uploaded photos and serves them only through authorized short-lived URLs', async () => {
    const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
    const up = await h.http().post(`${base()}/media/uploads`).set(auth(reporter)).send({ contentType: 'image/jpeg', sizeBytes: jpeg.length }).expect(201);
    const put = await fetch(up.body.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: jpeg });
    expect(put.status).toBe(200);
    await h.http().post(`${base()}/media/uploads`).set(auth(reporter)).send({ contentType: 'application/x-msdownload', sizeBytes: 10 }).expect(400);
    await h.http().post(`${base()}/media/uploads`).set(auth(reporter)).send({ contentType: 'image/png', sizeBytes: 50 * 1024 * 1024 }).expect(400);

    // A media id that was never uploaded is silently skipped, not fatal for the emergency.
    const ghost = await h.http().post(`${base()}/media/uploads`).set(auth(reporter)).send({ contentType: 'image/png', sizeBytes: 10 }).expect(201);
    const report = await h.report(reporter, community.id, { mediaIds: [up.body.mediaId, ghost.body.mediaId] });
    const detail = await h.http().get(`${base()}/emergencies/${report.id}`).set(auth(admin)).expect(200);
    expect(detail.body.media).toEqual([expect.objectContaining({ id: up.body.mediaId, kind: 'PHOTO' })]);

    // Pending report: member cannot fetch the photo; admin can.
    await h.http().get(`${base()}/media/${up.body.mediaId}`).set(auth(member)).expect(404);
    const dl = await h.http().get(`${base()}/media/${up.body.mediaId}`).set(auth(admin)).expect(200);
    const got = await fetch(dl.body.url);
    expect(Buffer.from(await got.arrayBuffer())).toEqual(jpeg);
    expect(await h.prisma.auditLog.count({ where: { action: 'media.accessed', entityId: up.body.mediaId } })).toBe(1);
  });
});
