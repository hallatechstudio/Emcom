import { Injectable, Logger } from '@nestjs/common';
import type { NotificationType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { PushProviderRegistry } from './providers/provider-registry';

export class TransientPushError extends Error {}

/**
 * Sends one NotificationDelivery. Idempotent: only QUEUED deliveries are sent. Transient failures
 * throw TransientPushError so BullMQ retries with exponential backoff; the final failure is
 * recorded by markFinalFailure().
 */
@Injectable()
export class PushSenderService {
  private readonly logger = new Logger(PushSenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PushProviderRegistry,
    private readonly metrics: MetricsService,
  ) {}

  async send(deliveryId: string): Promise<'sent' | 'skipped' | 'invalid' | 'failed'> {
    const d = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: { deviceToken: true, notification: true },
    });
    if (!d || d.status !== 'QUEUED') return 'skipped';
    if (d.deviceToken.invalidatedAt) {
      await this.finish(deliveryId, { status: 'SKIPPED', lastError: 'token invalidated' });
      return 'skipped';
    }
    const provider = this.registry.resolve(d.provider);
    if (!provider) {
      await this.finish(deliveryId, { status: 'SKIPPED', lastError: `provider ${d.provider} not enabled` });
      this.metrics.pushResults.inc({ provider: d.provider, status: 'SKIPPED' });
      return 'skipped';
    }
    await this.prisma.notificationDelivery.update({ where: { id: deliveryId }, data: { attempts: { increment: 1 } } });
    const n = d.notification;
    const result = await provider.send({
      token: d.deviceToken.token,
      title: n.title,
      body: n.body,
      priority: n.priority,
      data: {
        notificationId: n.id,
        type: n.type as NotificationType,
        communityId: n.communityId ?? undefined,
        emergencyId: n.emergencyId ?? undefined,
      },
    });

    if (result.ok) {
      await this.finish(deliveryId, {
        status: 'PROVIDER_ACCEPTED',
        acceptedAt: new Date(),
        providerMessageId: result.providerMessageId ?? null,
        lastError: null,
      });
      this.metrics.pushResults.inc({ provider: provider.name, status: 'PROVIDER_ACCEPTED' });
      this.metrics.pushProviderLatency.observe({ provider: provider.name }, (Date.now() - d.queuedAt.getTime()) / 1000);
      return 'sent';
    }
    if (result.kind === 'invalid_token') {
      await this.prisma.$transaction([
        this.prisma.notificationDelivery.updateMany({
          where: { id: deliveryId, status: 'QUEUED' },
          data: { status: 'INVALID_TOKEN', failedAt: new Date(), lastError: result.error },
        }),
        this.prisma.deviceToken.update({
          where: { id: d.deviceTokenId },
          data: { invalidatedAt: new Date(), invalidReason: result.error },
        }),
      ]);
      this.metrics.pushResults.inc({ provider: provider.name, status: 'INVALID_TOKEN' });
      return 'invalid';
    }
    if (result.kind === 'permanent') {
      await this.finish(deliveryId, { status: 'FAILED', failedAt: new Date(), lastError: result.error });
      this.metrics.pushResults.inc({ provider: provider.name, status: 'FAILED' });
      return 'failed';
    }
    await this.prisma.notificationDelivery.update({ where: { id: deliveryId }, data: { lastError: result.error } });
    throw new TransientPushError(result.error);
  }

  /** Called when BullMQ has exhausted retries for a transient failure (dead-letter). */
  async markFinalFailure(deliveryId: string, error: string): Promise<void> {
    const res = await this.prisma.notificationDelivery.updateMany({
      where: { id: deliveryId, status: 'QUEUED' },
      data: { status: 'FAILED', failedAt: new Date(), lastError: error.slice(0, 500) },
    });
    if (res.count) {
      this.metrics.pushResults.inc({ provider: 'any', status: 'FAILED' });
      this.logger.error({ deliveryId, error }, 'push delivery failed after all retries');
    }
  }

  private finish(id: string, data: Parameters<PrismaService['notificationDelivery']['updateMany']>[0]['data']) {
    // Conditional on QUEUED so a duplicate job can never overwrite a final state.
    return this.prisma.notificationDelivery.updateMany({ where: { id, status: 'QUEUED' }, data });
  }
}
