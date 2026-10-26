/* eslint-disable no-console */
/**
 * Seeds stable demo data for local development. Safe to re-run (idempotent upserts).
 * All demo accounts use the password in SEED_PASSWORD (default: Emcom!Demo2026).
 *
 *  Jacob Mews (ESTATE, "Block / Apartment", required)
 *    owner@emcom.dev  OWNER   | admin@emcom.dev ADMIN | david@emcom.dev MEMBER | ada@emcom.dev MEMBER
 *    pending@emcom.dev PENDING | suspended@emcom.dev SUSPENDED
 *  Grace Chapel (CHURCH, "Branch / Cell", optional)
 *    david@emcom.dev OWNER  | ada@emcom.dev ADMIN | owner@emcom.dev MEMBER
 *  Nova Works (WORKPLACE, "Department", required)
 *    ada@emcom.dev OWNER | david@emcom.dev ADMIN
 */
import { PrismaClient, CommunityType, MembershipRole, MembershipStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? 'Emcom!Demo2026';

async function user(email: string, fullName: string, phone: string, hash: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName, phone, passwordHash: hash, emailVerifiedAt: new Date() },
  });
}

async function community(
  code: string,
  name: string,
  type: CommunityType,
  location: string,
  description: string,
  ownerId: string,
  field: { label: string; required: boolean },
  whatsappUrl?: string,
) {
  return prisma.community.upsert({
    where: { inviteCode: code },
    update: {},
    create: {
      inviteCode: code,
      name,
      type,
      location,
      description,
      whatsappUrl,
      createdById: ownerId,
      identificationField: { create: field },
    },
  });
}

async function member(communityId: string, userId: string, role: MembershipRole, status: MembershipStatus, idValue?: string) {
  const now = new Date();
  return prisma.communityMembership.upsert({
    where: { communityId_userId: { communityId, userId } },
    update: {},
    create: {
      communityId,
      userId,
      role,
      status,
      identificationValue: idValue,
      decidedAt: status === 'PENDING' ? null : now,
      approvedAt: status === 'APPROVED' || status === 'SUSPENDED' ? now : null,
      suspendedAt: status === 'SUSPENDED' ? now : null,
    },
  });
}

async function main() {
  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const owner = await user('owner@emcom.dev', 'Grace Owner', '+2348010000001', hash);
  const admin = await user('admin@emcom.dev', 'Musa Admin', '+2348010000002', hash);
  const david = await user('david@emcom.dev', 'David Okafor', '+2348010000003', hash);
  const ada = await user('ada@emcom.dev', 'Ada Nwosu', '+2348010000004', hash);
  const pending = await user('pending@emcom.dev', 'Pat Pending', '+2348010000005', hash);
  const suspended = await user('suspended@emcom.dev', 'Sam Suspended', '+2348010000006', hash);

  const jacob = await community('JACOB4821', 'Jacob Mews', 'ESTATE', 'Lagos, Nigeria', 'A residential estate of 6 blocks.', owner.id, { label: 'Block / Apartment', required: true }, 'https://chat.whatsapp.com/JacobMewsDemoGroup01');
  const church = await community('GRACE7K2M', 'Grace Chapel', 'CHURCH', 'Ikeja, Lagos', 'Sunday worship and midweek cells.', david.id, { label: 'Branch / Cell', required: false });
  const nova = await community('NOVAW9P4', 'Nova Works', 'WORKPLACE', 'Victoria Island, Lagos', 'Office campus.', ada.id, { label: 'Department', required: true });

  await member(jacob.id, owner.id, 'OWNER', 'APPROVED', 'Block A1');
  await member(jacob.id, admin.id, 'ADMIN', 'APPROVED', 'Block C4');
  await member(jacob.id, david.id, 'MEMBER', 'APPROVED', 'Block B12');
  await member(jacob.id, ada.id, 'MEMBER', 'APPROVED', 'Block D2');
  await member(jacob.id, pending.id, 'MEMBER', 'PENDING', 'Block E7');
  await member(jacob.id, suspended.id, 'MEMBER', 'SUSPENDED', 'Block F1');

  await member(church.id, david.id, 'OWNER', 'APPROVED');
  await member(church.id, ada.id, 'ADMIN', 'APPROVED', 'Ikeja Cell 3');
  await member(church.id, owner.id, 'MEMBER', 'APPROVED', 'Choir');

  await member(nova.id, ada.id, 'OWNER', 'APPROVED', 'Operations');
  await member(nova.id, david.id, 'ADMIN', 'APPROVED', 'Engineering');

  // One resolved incident in Jacob Mews so History is not empty on first run.
  const existing = await prisma.emergency.count({ where: { communityId: jacob.id } });
  if (existing === 0) {
    const reportedAt = new Date(Date.now() - 2 * 86_400_000);
    const e = await prisma.emergency.create({
      data: {
        communityId: jacob.id,
        pathway: 'NORMAL',
        status: 'RESOLVED',
        category: 'ELECTRICAL_EMERGENCY',
        location: 'Block C generator house',
        description: 'Sparks from the generator panel.',
        instructions: 'Keep clear of Block C generator house.',
        reporterId: david.id,
        createdAt: reportedAt,
        confirmedAt: new Date(reportedAt.getTime() + 3 * 60_000),
        confirmedById: admin.id,
        resolvedAt: new Date(reportedAt.getTime() + 40 * 60_000),
        resolvedById: admin.id,
        resolutionMessage: 'Electrician isolated the panel. Power restored safely.',
        eventSeq: 5,
      },
    });
    const at = (m: number) => new Date(reportedAt.getTime() + m * 60_000);
    await prisma.emergencyEvent.createMany({
      data: [
        { emergencyId: e.id, communityId: jacob.id, seq: 1, type: 'REPORTED', actorId: david.id, createdAt: at(0) },
        { emergencyId: e.id, communityId: jacob.id, seq: 2, type: 'CONFIRMED', actorId: admin.id, createdAt: at(3), message: 'Keep clear of Block C generator house.' },
        { emergencyId: e.id, communityId: jacob.id, seq: 3, type: 'COMMUNITY_ALERTED', createdAt: at(3), message: '4 members targeted' },
        { emergencyId: e.id, communityId: jacob.id, seq: 4, type: 'UPDATE_SENT', actorId: admin.id, createdAt: at(15), message: 'Electrician on site.' },
        { emergencyId: e.id, communityId: jacob.id, seq: 5, type: 'RESOLVED', actorId: admin.id, createdAt: at(40), message: 'Electrician isolated the panel. Power restored safely.' },
      ],
    });
    await prisma.emergencyUpdate.create({
      data: { emergencyId: e.id, communityId: jacob.id, authorId: admin.id, message: 'Electrician on site.', createdAt: at(15) },
    });
  }

  console.log('Seed complete. Demo accounts are ready.');
  console.log('Community codes: Jacob Mews JACOB4821 · Grace Chapel GRACE7K2M · Nova Works NOVAW9P4');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
