import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OutboxEvent } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';
import { MetricsService } from '../metrics/metrics.service';
import { QUEUES } from '../queue/queue.module';
import type { Queues } from '../queue/queues';

const LEASE_SECONDS = 30;

/**
 * Moves committed outbox rows into BullMQ.
 *  - Rows are leased with FOR UPDATE SKIP LOCKED, so several workers can run concurrently.
 *  - jobId = outbox id: publishing the same row twice never creates two jobs.
 *  - If Redis is down, rows stay PENDING with exponential backoff (capped at 30s) and are retried
 *    forever — broadcast intent is never dropped. emcom_outbox_oldest_pending_age_seconds alerts on it.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    @Inject(QUEUES) private readonly queues: Queues,
  ) {}

  start(): void {
    this.stopped = false;
    const loop = async () => {
      if (this.stopped) return;
      try {
        const n = await this.dispatchBatch();
        this.timer = setTimeout(loop, n > 0 ? 0 : env().OUTBOX_POLL_MS);
      } catch (err) {
        this.logger.error({ err }, 'outbox loop error');
        this.timer = setTimeout(loop, 2000);
      }
    };
    void loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    while (this.running) await new Promise((r) => setTimeout(r, 25));
  }

  /** Leases and publishes one batch. Returns the number of rows leased. */
  async dispatchBatch(publish: (e: OutboxEvent) => Promise<void> = (e) => this.publish(e)): Promise<number> {
    this.running = true;
    try {
      const leased = await this.prisma.$queryRaw<OutboxEvent[]>`
        UPDATE outbox_events SET "availableAt" = now() + make_interval(secs => ${LEASE_SECONDS}), attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM outbox_events
          WHERE status = 'PENDING' AND "availableAt" <= now()
          ORDER BY "createdAt"
          LIMIT ${env().OUTBOX_BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *`;
      for (const event of leased) {
        try {
          await publish(event);
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'DISPATCHED', dispatchedAt: new Date(), lastError: null },
          });
          this.metrics.outboxDispatched.inc({ type: event.type });
        } catch (err) {
          const delayMs = Math.min(30_000, 250 * 2 ** Math.min(event.attempts, 7));
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { availableAt: new Date(Date.now() + delayMs), lastError: String((err as Error).message).slice(0, 500) },
          });
          this.metrics.outboxPublishErrors.inc();
          this.logger.warn({ outboxId: event.id, attempts: event.attempts, err: (err as Error).message }, 'outbox publish failed; will retry');
        }
      }
      return leased.length;
    } finally {
      this.running = false;
    }
  }

  private async publish(event: OutboxEvent): Promise<void> {
    await this.queues.fanout.add(event.type, { outboxEventId: event.id }, { jobId: `outbox-${event.id}`, priority: event.type === 'emergency.broadcast' ? 1 : 5 });
  }

  async refreshGauges(): Promise<void> {
    const [pending, oldest] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
      this.prisma.outboxEvent.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    this.metrics.outboxPending.set(pending);
    this.metrics.outboxOldestAge.set(oldest ? (Date.now() - oldest.createdAt.getTime()) / 1000 : 0);
  }
}
