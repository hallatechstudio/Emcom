import { Harness } from './harness';

/** Guarantees enforced by PostgreSQL itself, independent of application code. */
describe('Database invariants', () => {
  let h: Harness;
  let communityId: string;
  let emergencyId: string;

  beforeAll(async () => {
    h = await Harness.start();
    const owner = await h.user();
    communityId = (await h.community(owner)).id;
    const res = await h.critical(owner, communityId).expect(201);
    emergencyId = res.body.emergency.id;
  });
  afterAll(() => h.stop());

  it('audit logs are append-only', async () => {
    await expect(h.prisma.$executeRaw`UPDATE audit_logs SET action = 'tampered'`).rejects.toThrow(/append-only/);
    await expect(h.prisma.$executeRaw`DELETE FROM audit_logs`).rejects.toThrow(/append-only/);
  });

  it('emergency timelines are append-only and incidents cannot be deleted', async () => {
    await expect(h.prisma.$executeRaw`UPDATE emergency_events SET message = 'x'`).rejects.toThrow(/append-only/);
    await expect(h.prisma.$executeRaw`DELETE FROM emergencies WHERE id = ${emergencyId}::uuid`).rejects.toThrow(/append-only/);
  });

  it('an emergency can only have one broadcast', async () => {
    const owner = await h.prisma.user.findFirstOrThrow();
    await expect(
      h.prisma.emergencyAlert.create({ data: { emergencyId, communityId, pathway: 'CRITICAL', triggeredById: owner.id, recipientCount: 0 } }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it('shape constraints: normal reports need a category; resolved needs a message; critical is never pending', async () => {
    const owner = await h.prisma.user.findFirstOrThrow();
    await expect(h.prisma.emergency.create({ data: { communityId, pathway: 'NORMAL', status: 'PENDING', reporterId: owner.id } })).rejects.toThrow();
    await expect(h.prisma.emergency.create({ data: { communityId, pathway: 'CRITICAL', status: 'PENDING', reporterId: owner.id } })).rejects.toThrow();
    await expect(h.prisma.emergency.update({ where: { id: emergencyId }, data: { status: 'RESOLVED' } })).rejects.toThrow();
  });

  it('acknowledgments cannot point at another community than their alert', async () => {
    const other = await h.user();
    const otherCommunity = await h.community(other, { name: 'Other' });
    const alert = await h.prisma.emergencyAlert.findUniqueOrThrow({ where: { emergencyId } });
    const m = await h.prisma.communityMembership.findFirstOrThrow({ where: { communityId: otherCommunity.id } });
    await expect(
      h.prisma.alertAcknowledgment.create({ data: { alertId: alert.id, communityId: otherCommunity.id, userId: other.id, membershipId: m.id } }),
    ).rejects.toThrow();
  });
});
