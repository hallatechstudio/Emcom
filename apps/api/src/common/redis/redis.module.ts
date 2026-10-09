import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import IORedis, { Redis } from 'ioredis';
import { env } from '../../config/env';

export const REDIS = Symbol('REDIS');

/** Creates a connection suitable for BullMQ (no request retry cap, no ready check). */
export function createRedisConnection(): Redis {
  return new IORedis(env().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
}

@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: (): Redis =>
        new IORedis(env().REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
