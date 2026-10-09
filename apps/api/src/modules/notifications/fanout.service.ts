import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OutboxEvent } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import type { OutboxPayloads } from '../outbox/outbox.types';
import { OutboxType } from '../outbox/outbox.types';
import { QUEUES } from '../queue/queue.module';
import type { Queues } from '../queue/queues';
import { Content, NotificationContent } from './content';

const CHUNK = 500;

interface Target {
  userIds: string[];
  content: NotificationContent;
  communityId: string | null;
  emergencyId: string | null;
  dedupeKey: string;
  /** Only deliver to users whose membership in communityId is APPROVED at fan-out time. */
  requireApproved: boolean;
}

/**
 * Turns an outbox event into persistent inbox notifications + one push delivery per device.
 * Fully idempotent: replaying the same event creates nothing new (unique dedupe keys) and only
 * re-enqueues deliveries still QUEUED (BullMQ jobId = deliveryId deduplicates those).
 */
@Injectable()
export class FanoutService {
  private readonly logger = new Logger(FanoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    @Inject(QUEUES) private readonly queues: Queues,
  ) {}

  async process(outboxEventId: string): Promise<{ notifications: number; deliveries: number }> {
    const event = await this.prisma.outboxEvent.findUnique({ where: { id: outboxEventId } });
    if (!event) {
      this.logger.warn({ outboxEventId }, 'outbox event not found; skipping');
      return { notifications: 0, deliveries: 0 };
    }
    const targets = await this.resolveTargets(event);
    let notifications = 0;
    let deliveries = 0;
    for (const t of targets) {
      const r = await this.deliver(t);
      notifications += r.notifications;
      deliveries += r.deliveries;
    }
    if (event.type === OutboxType.EMERGENCY_BROADCAST) {
      const queuedAt = (event.payload as unknown as OutboxPayloads['emergency.broadcast']).queuedAt;
      this.metrics.broadcastFanoutLatency.observe((Date.now() - new Date(queuedAt).getTime()) / 1000);
    }
    return { notifications, deliveries };
  }

  private async resolveTargets(event: OutboxEvent): Promise<Target[]> {
    switch (event.type) {
      case OutboxType.EMERGENCY_BROADCAST: {
        const p = event.payload as unknown as OutboxPayloads['emergency.broadcast'];
        const e = await this.loadEmergency(p.emergencyId);
        const recipients = await this.prisma.alertRecipient.findMany({
          where: { alertId: p.alertId, communityId: e.communityId },
          select: { userId: true },
        });
        const content =
          e.pathway === 'CRITICAL'
            ? Content.criticalAlert(e.community.name, e.location)
            : Content.broadcast(e.community.name, e.category, e.location, e.instructions);
        const targets: Target[] = [
          {
            // Everyone in the snapshot except the person who raised it (they see "Critical Alert Sent").
            userIds: recipients.map((r) => r.userId).filter((u) => u !== (e.pathway === 'CRITICAL' ? e.reporterId : '')),
            content,
            communityId: e.communityId,
            emergencyId: e.id,
            dedupeKey: `broadcast:${p.alertId}`,
            requireApproved: true,
          },
        ];
        if (e.pathway === 'NORMAL') {
          targets.push({
            userIds: [e.reporterId],
            content: Content.confirmed(e.community.name, e.category),
            communityId: e.communityId,
            emergencyId: e.id,
            dedupeKey: `confirmed:${e.id}`,
            requireApproved: true,
          });
        }
        return targets;
      }
      case OutboxType.EMERGENCY_REPORTED: {
        const p = event.payload as unknown as OutboxPayloads['emergency.reported'];
        const e = await this.loadEmergency(p.emergencyId);
        return [
          {
            userIds: await this.adminIds(e.communityId),
            content: Content.reportReceived(e.community.name, e.category, e.location),
            communityId: e.communityId,
            emergencyId: e.id,
            dedupeKey: `reported:${e.id}`,
            requireApproved: true,
          },
        ];
      }
      case OutboxType.EMERGENCY_UPDATE: {
        const p = event.payload as unknown as OutboxPayloads['emergency.update'];
        const e = await this.loadEmergency(p.emergencyId);
        const u = await this.prisma.emergencyUpdate.findFirstOrThrow({ where: { id: p.updateId, emergencyId: e.id } });
        return [
          {
            userIds: await this.approvedIds(e.communityId),
            content: Content.update(e.community.name, e.category, u.message),
            communityId: e.communityId,
            emergencyId: e.id,
            dedupeKey: `update:${u.id}`,
            requireApproved: true,
          },
        ];
      }
      case OutboxType.EMERGENCY_RESOLVED: {
        const p = event.payload as unknown as OutboxPayloads['emergency.resolved'];
        const e = await this.loadEmergency(p.emergencyId);
        return [
          {
            userIds: await this.approvedIds(e.communityId),
            content: Content.resolved(e.community.name, e.category, e.resolutionMessage),
            communityId: e.communityId,
            emergencyId: e.id,
            dedupeKey: `resolved:${e.id}`,
            requireApproved: true,
          },
        ];
      }
      case OutboxType.EMERGENCY_DISMISSED: {
        const p = event.payload as unknown as OutboxPayloads['emergency.dismissed'];
        const e = await this.loadEmergency(p.emergencyId);
        return [
          {
            userIds: [e.reporterId],
            content: Content.dismissed(e.community.name),
            communityId: e.communityId,
            emergencyId: e.id,
            dedupeKey: `dismissed:${e.id}`,
            requireApproved: true,
          },
        ];
      }
      case OutboxType.JOIN_REQUESTED: {
        const p = event.payload as unknown as OutboxPayloads['membership.join_requested'];
        const m = await this.prisma.communityMembership.findUniqueOrThrow({
          where: { id: p.membershipId },
          include: { community: { select: { name: true } }, user: { select: { fullName: true } } },
        });
        if (m.status !== 'PENDING') return [];
        return [
          {
            userIds: await this.adminIds(m.communityId),
            content: Content.joinRequest(m.community.name, m.user.fullName),
            communityId: m.communityId,
            emergencyId: null,
            dedupeKey: `join:${event.dedupeKey}`,
            requireApproved: true,
          },
        ];
      }
      case OutboxType.MEMBERSHIP_DECIDED: {
        const p = event.payload as unknown as OutboxPayloads['membership.decided'];
        const m = await this.prisma.communityMembership.findUniqueOrThrow({
          where: { id: p.membershipId },
          include: { community: { select: { name: true } } },
        });
        return [
          {
            userIds: [m.userId],
            content: p.decision === 'APPROVED' ? Content.approved(m.community.name) : Content.rejected(m.community.name),
            communityId: m.communityId,
            emergencyId: null,
            dedupeKey: `decided:${event.dedupeKey}`,
            // The applicant is not APPROVED when rejected; this message is about their own request.
            requireApproved: false,
          },
        ];
      }
      default:
        this.logger.error({ type: event.type }, 'unknown outbox event type');
        return [];
    }
  }

  private async deliver(t: Target): Promise<{ notifications: number; deliveries: number }> {
    let notifications = 0;
    let deliveries = 0;
    for (let i = 0; i < t.userIds.length; i += CHUNK) {
      let userIds = t.userIds.slice(i, i + CHUNK);
      if (t.requireApproved && t.communityId) {
        // Re-check at send time: suspended/removed members must not receive broadcasts.
        const ok = await this.prisma.communityMembership.findMany({
          where: { communityId: t.communityId, userId: { in: userIds }, status: 'APPROVED' },
          select: { userId: true },
        });
        const allowed = new Set(ok.map((m) => m.userId));
        userIds = userIds.filter((u) => allowed.has(u));
      }
      if (!userIds.length) continue;

      const created = await this.prisma.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          communityId: t.communityId,
          emergencyId: t.emergencyId,
          type: t.content.type,
          priority: t.content.priority,
          title: t.content.title,
          body: t.content.body,
          dedupeKey: t.dedupeKey,
        })),
        skipDuplicates: true,
      });
      notifications += created.count;

      const rows = await this.prisma.notification.findMany({
        where: { dedupeKey: t.dedupeKey, userId: { in: userIds } },
        select: { id: true, userId: true },
      });
      const tokens = await this.prisma.deviceToken.findMany({
        where: { userId: { in: userIds }, invalidatedAt: null },
        select: { id: true, userId: true, provider: true },
      });
      const byUser = new Map<string, typeof tokens>();
      for (const tk of tokens) byUser.set(tk.userId, [...(byUser.get(tk.userId) ?? []), tk]);

      const deliveryRows = rows.flatMap((n) =>
        (byUser.get(n.userId) ?? []).map((tk) => ({ notificationId: n.id, deviceTokenId: tk.id, provider: tk.provider })),
      );
      if (deliveryRows.length) {
        await this.prisma.notificationDelivery.createMany({ data: deliveryRows, skipDuplicates: true });
      }
      const pending = await this.prisma.notificationDelivery.findMany({
        where: { notificationId: { in: rows.map((r) => r.id) }, status: 'QUEUED' },
        select: { id: true },
      });
      if (pending.length) {
        const priority = t.content.priority === 'NORMAL' ? 5 : 1;
        await this.queues.push.addBulk(
          pending.map((d) => ({ name: 'send', data: { deliveryId: d.id }, opts: { jobId: d.id, priority } })),
        );
        deliveries += pending.length;
      }
    }
    return { notifications, deliveries };
  }

  private loadEmergency(id: string) {
    return this.prisma.emergency.findUniqueOrThrow({ where: { id }, include: { community: { select: { name: true } } } });
  }

  private async adminIds(communityId: string): Promise<string[]> {
    const rows = await this.prisma.communityMembership.findMany({
      where: { communityId, status: 'APPROVED', role: { in: ['ADMIN', 'OWNER'] } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  private async approvedIds(communityId: string): Promise<string[]> {
    const rows = await this.prisma.communityMembership.findMany({
      where: { communityId, status: 'APPROVED' },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
}
