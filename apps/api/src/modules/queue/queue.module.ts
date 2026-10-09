import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { createRedisConnection } from '../../common/redis/redis.module';
import { env } from '../../config/env';
import { createQueues, Queues } from './queues';

export const QUEUES = Symbol('QUEUES');

@Injectable()
class QueueLifecycle implements OnModuleDestroy {
  constructor(@Inject(QUEUES) private readonly queues: Queues) {}
  async onModuleDestroy(): Promise<void> {
    await Promise.all(Object.values(this.queues).map((q) => q.close().catch(() => undefined)));
    // BullMQ does not close connections it was handed; we own this one.
    await queueConnection?.quit().catch(() => undefined);
  }
}

let queueConnection: ReturnType<typeof createRedisConnection> | undefined;

@Global()
@Module({
  providers: [
    {
      provide: QUEUES,
      useFactory: () => {
        queueConnection = createRedisConnection();
        return createQueues(queueConnection, env().PUSH_MAX_ATTEMPTS);
      },
    },
    QueueLifecycle,
  ],
  exports: [QUEUES],
})
export class QueueModule {}
