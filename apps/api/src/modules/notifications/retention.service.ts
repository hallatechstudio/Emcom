import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';

/**
 * Configurable retention for operational data. Emergencies, timelines, updates, acknowledgments and
 * audit logs are NEVER deleted by routine operation (see docs/security-and-authorization.md §Retention).
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(now = new Date()): Promise<Record<string, number>> {
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
    const out: Record<string, number> = {};
    out.idempotency = (await this.prisma.idempotencyRecord.deleteMany({ where: { createdAt: { lt: days(env().RETENTION_IDEMPOTENCY_DAYS) } } })).count;
    if (env().RETENTION_DELIVERY_DAYS > 0) {
      out.deliveries = (
        await this.prisma.notificationDelivery.deleteMany({
          where: { queuedAt: { lt: days(env().RETENTION_DELIVERY_DAYS) }, status: { not: 'QUEUED' } },
        })
      ).count;
    }
    if (env().RETENTION_NOTIFICATION_DAYS > 0) {
      out.notifications = (await this.prisma.notification.deleteMany({ where: { createdAt: { lt: days(env().RETENTION_NOTIFICATION_DAYS) } } })).count;
    }
    out.outbox = (await this.prisma.outboxEvent.deleteMany({ where: { status: 'DISPATCHED', dispatchedAt: { lt: days(30) } } })).count;
    out.otp = (await this.prisma.otpCode.deleteMany({ where: { expiresAt: { lt: days(1) } } })).count;
    out.refreshTokens = (await this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: days(7) } } })).count;
    out.abandonedMedia = (
      await this.prisma.emergencyMedia.deleteMany({ where: { status: 'PENDING_UPLOAD', createdAt: { lt: days(2) } } })
    ).count;
    this.logger.log({ retention: out }, 'retention sweep complete');
    return out;
  }
}
