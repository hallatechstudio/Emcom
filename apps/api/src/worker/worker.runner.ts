import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { createRedisConnection } from '../common/redis/redis.module';
import { env } from '../config/env';
import { MetricsService } from '../modules/metrics/metrics.service';
import { FanoutService } from '../modules/notifications/fanout.service';
import { PushProviderRegistry } from '../modules/notifications/providers/provider-registry';
import { PushSenderService } from '../modules/notifications/push-sender.service';
import { RetentionService } from '../modules/notifications/retention.service';
import { OutboxDispatcher } from '../modules/outbox/outbox-dispatcher.service';
import { QUEUES } from '../modules/queue/queue.module';
import { FanoutJob, PushJob, QueueName, Queues } from '../modules/queue/queues';

/** Owns the BullMQ workers, the outbox loop and periodic maintenance. Scale by running more replicas. */
@Injectable()
export class WorkerRunner {
  private readonly logger = new Logger(WorkerRunner.name);
  private workers: Worker[] = [];
  private connections: ReturnType<typeof createRedisConnection>[] = [];
  private gaugeTimer?: NodeJS.Timeout;

  constructor(
    private readonly dispatcher: OutboxDispatcher,
    private readonly fanout: FanoutService,
    private readonly sender: PushSenderService,
    private readonly retention: RetentionService,
    private readonly metrics: MetricsService,
    private readonly registry: PushProviderRegistry,
    @Inject(QUEUES) private readonly queues: Queues,
  ) {}

  async start(): Promise<void> {
    this.logger.log({ providers: this.registry.enabled(), forceMock: env().PUSH_FORCE_MOCK }, 'push providers');

    const fanoutWorker = new Worker<FanoutJob>(
      QueueName.FANOUT,
      async (job: Job<FanoutJob>) => this.fanout.process(job.data.outboxEventId),
      { connection: this.conn(), concurrency: 5 },
    );
    const pushWorker = new Worker<PushJob>(
      QueueName.PUSH,
      async (job: Job<PushJob>) => this.sender.send(job.data.deliveryId),
      {
        connection: this.conn(),
        concurrency: env().PUSH_CONCURRENCY,
        // Protect provider quotas: at most 500 sends/second per worker process.
        limiter: { max: 500, duration: 1000 },
      },
    );
    pushWorker.on('failed', (job, err) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        void this.sender.markFinalFailure(job.data.deliveryId, err.message);
      }
    });
    fanoutWorker.on('failed', (job, err) => {
      this.logger.error({ jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'fan-out job failed');
    });
    const maintenanceWorker = new Worker(
      QueueName.MAINTENANCE,
      async (job) => (job.name === 'retention' ? this.retention.run() : undefined),
      { connection: this.conn(), concurrency: 1 },
    );
    this.workers = [fanoutWorker, pushWorker, maintenanceWorker];

    await this.queues.maintenance.upsertJobScheduler('retention-daily', { pattern: '17 3 * * *' }, { name: 'retention' });
    this.dispatcher.start();
    this.gaugeTimer = setInterval(() => void this.refreshGauges(), 15_000);
    void this.refreshGauges();
    this.logger.log('worker started');
  }

  private conn() {
    const c = createRedisConnection();
    this.connections.push(c);
    return c;
  }

  async stop(): Promise<void> {
    if (this.gaugeTimer) clearInterval(this.gaugeTimer);
    await this.dispatcher.stop();
    // Let in-flight jobs finish; unfinished jobs are retried by another worker.
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all(this.connections.map((c) => c.quit().catch(() => undefined)));
    this.workers = [];
    this.connections = [];
    this.logger.log('worker stopped');
  }

  private async refreshGauges(): Promise<void> {
    try {
      await this.dispatcher.refreshGauges();
      for (const [name, q] of Object.entries(this.queues)) {
        const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'prioritized');
        for (const [state, n] of Object.entries(counts)) this.metrics.queueJobs.set({ queue: name, state }, n);
      }
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'gauge refresh failed');
    }
  }
}
