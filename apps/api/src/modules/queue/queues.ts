import { Queue, QueueOptions } from 'bullmq';
import type { Redis } from 'ioredis';

export const QueueName = {
  FANOUT: 'emcom-fanout',
  PUSH: 'emcom-push',
  MAINTENANCE: 'emcom-maintenance',
} as const;

export interface FanoutJob {
  outboxEventId: string;
}

export interface PushJob {
  deliveryId: string;
}

export function defaultJobOptions(maxAttempts: number): QueueOptions['defaultJobOptions'] {
  return {
    attempts: maxAttempts,
    backoff: { type: 'exponential', delay: 2000 },
    // Keep completed job ids for 24h so a re-published job with the same id is deduplicated.
    removeOnComplete: { age: 24 * 3600, count: 100_000 },
    // Failed jobs stay inspectable (dead-letter set) for 14 days.
    removeOnFail: { age: 14 * 24 * 3600 },
  };
}

export function createQueues(connection: Redis, maxPushAttempts: number) {
  return {
    fanout: new Queue<FanoutJob>(QueueName.FANOUT, { connection, defaultJobOptions: defaultJobOptions(10) }),
    push: new Queue<PushJob>(QueueName.PUSH, { connection, defaultJobOptions: defaultJobOptions(maxPushAttempts) }),
    maintenance: new Queue(QueueName.MAINTENANCE, { connection, defaultJobOptions: defaultJobOptions(3) }),
  };
}
export type Queues = ReturnType<typeof createQueues>;
