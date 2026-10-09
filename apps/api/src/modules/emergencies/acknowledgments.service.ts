import { Injectable } from '@nestjs/common';
import type { CommunityMembership, DeliveryStatus, Prisma } from '@prisma/client';
import type { AckRecipientDto, AckSummaryDto, Paginated } from '@emcom/shared-types';
import { RealtimeEvent } from '@emcom/shared-types';
import { Errors } from '../../common/errors/app-error';
import { encodeCursor, decodeCursor } from '../../common/http/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { AckRecipientsQueryDto } from './dto/emergency.dto';

const BROADCAST_TYPES = ['CRITICAL_ALERT', 'EMERGENCY_BROADCAST'] as const;
// Best-known state across a user's devices, most informative first.
const PUSH_RANK: DeliveryStatus[] = ['PROVIDER_ACCEPTED', 'QUEUED', 'FAILED', 'INVALID_TOKEN', 'SKIPPED'];

/**
 * Acknowledgment = "I have seen this alert". It is NOT proof of push delivery, physical safety or
 * rescue. Baseline (denominator) = the recipient snapshot taken at broadcast time, plus approved
 * members who join later and acknowledge (flagged addedAfterBroadcast).
 */
@Injectable()
export class AcknowledgmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async acknowledge(membership: CommunityMembership, emergencyId: string): Promise<{ acknowledgedAt: string; alreadyAcknowledged: boolean }> {
    const emergency = await this.prisma.emergency.findFirst({
      where: { id: emergencyId, communityId: membership.communityId, status: { in: ['ACTIVE', 'RESOLVED'] } },
      include: { alert: true },
    });
    if (!emergency?.alert) throw Errors.notFound('Emergency');
    const alert = emergency.alert;

    const existing = await this.prisma.alertAcknowledgment.findUnique({
      where: { alertId_userId: { alertId: alert.id, userId: membership.userId } },
    });
    if (existing) return { acknowledgedAt: existing.acknowledgedAt.toISOString(), alreadyAcknowledged: true };
    if (emergency.status !== 'ACTIVE') {
      throw Errors.conflict('EMERGENCY_NOT_ACTIVE', 'This emergency has been resolved');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.alertRecipient.createMany({
        data: [{ alertId: alert.id, communityId: alert.communityId, membershipId: membership.id, userId: membership.userId, addedAfterBroadcast: true }],
        skipDuplicates: true,
      });
      // UNIQUE(alertId, userId) makes concurrent double-taps safe.
      await tx.alertAcknowledgment.createMany({
        data: [{ alertId: alert.id, communityId: alert.communityId, userId: membership.userId, membershipId: membership.id }],
        skipDuplicates: true,
      });
    });
    const ack = await this.prisma.alertAcknowledgment.findUniqueOrThrow({
      where: { alertId_userId: { alertId: alert.id, userId: membership.userId } },
    });
    const summary = await this.counts(alert.id);
    this.realtime.emit(RealtimeEvent.ACK_CHANGED, membership.communityId, { emergencyId, ...summary }, { adminsOnly: true, emergencyId });
    return { acknowledgedAt: ack.acknowledgedAt.toISOString(), alreadyAcknowledged: false };
  }

  async summary(communityId: string, emergencyId: string): Promise<AckSummaryDto> {
    const alert = await this.alertFor(communityId, emergencyId);
    const counts = await this.counts(alert.id);
    const grouped = await this.prisma.notificationDelivery.groupBy({
      by: ['status'],
      where: { notification: { emergencyId, communityId, type: { in: [...BROADCAST_TYPES] } } },
      _count: { _all: true },
    });
    return {
      alertId: alert.id,
      ...counts,
      delivery: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])),
    };
  }

  async recipients(communityId: string, emergencyId: string, q: AckRecipientsQueryDto): Promise<Paginated<AckRecipientDto>> {
    const alert = await this.alertFor(communityId, emergencyId);
    const limit = q.limit ?? 50;
    const cursor = decodeCursor(q.cursor);
    const ackedUserIds = (
      await this.prisma.alertAcknowledgment.findMany({ where: { alertId: alert.id }, select: { userId: true } })
    ).map((a) => a.userId);
    const and: Prisma.AlertRecipientWhereInput[] = [{ alertId: alert.id, communityId }];
    if (cursor) {
      and.push({ OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] });
    }
    if (q.q) {
      and.push({
        OR: [
          { membership: { identificationValue: { contains: q.q, mode: 'insensitive' } } },
          { membership: { user: { fullName: { contains: q.q, mode: 'insensitive' } } } },
        ],
      });
    }
    if (q.filter === 'acknowledged') and.push({ userId: { in: ackedUserIds } });
    if (q.filter === 'not_acknowledged') and.push({ userId: { notIn: ackedUserIds } });
    const where: Prisma.AlertRecipientWhereInput = { AND: and };

    const rows = await this.prisma.alertRecipient.findMany({
      where,
      include: { membership: { include: { user: { select: { fullName: true } } } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    const userIds = items.map((r) => r.userId);
    const [acks, deliveries] = await Promise.all([
      this.prisma.alertAcknowledgment.findMany({ where: { alertId: alert.id, userId: { in: userIds } } }),
      this.prisma.notificationDelivery.findMany({
        where: { notification: { emergencyId, communityId, type: { in: [...BROADCAST_TYPES] }, userId: { in: userIds } } },
        select: { status: true, notification: { select: { userId: true } } },
      }),
    ]);
    const ackMap = new Map(acks.map((a) => [a.userId, a.acknowledgedAt]));
    const pushMap = new Map<string, DeliveryStatus>();
    for (const d of deliveries) {
      const uid = d.notification.userId;
      const prev = pushMap.get(uid);
      if (!prev || PUSH_RANK.indexOf(d.status) < PUSH_RANK.indexOf(prev)) pushMap.set(uid, d.status);
    }
    const last = items[items.length - 1];
    return {
      items: items.map((r) => ({
        userId: r.userId,
        fullName: r.membership.user.fullName,
        identificationValue: r.membership.identificationValue,
        membershipStatus: r.membership.status,
        acknowledgedAt: ackMap.get(r.userId)?.toISOString() ?? null,
        addedAfterBroadcast: r.addedAfterBroadcast,
        pushState: pushMap.get(r.userId) ?? 'NO_DEVICE',
      })),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  private async alertFor(communityId: string, emergencyId: string) {
    const alert = await this.prisma.emergencyAlert.findFirst({ where: { emergencyId, communityId } });
    if (!alert) throw Errors.notFound('Alert');
    return alert;
  }

  private async counts(alertId: string) {
    const [recipientCount, acknowledgedCount] = await Promise.all([
      this.prisma.alertRecipient.count({ where: { alertId } }),
      this.prisma.alertAcknowledgment.count({ where: { alertId } }),
    ]);
    return { recipientCount, acknowledgedCount, notAcknowledgedCount: recipientCount - acknowledgedCount };
  }
}
