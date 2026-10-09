import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { Errors } from '../errors/app-error';

/**
 * Fixed-window rate limiter backed by Redis.
 * Fails OPEN when Redis is unavailable: rate limiting must never block emergency traffic.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async consume(bucket: string, limit: number, windowSeconds: number): Promise<void> {
    const key = `rl:${bucket}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    let count: number;
    try {
      const res = await this.redis.multi().incr(key).expire(key, windowSeconds + 1).exec();
      count = Number(res?.[0]?.[1] ?? 0);
    } catch (err) {
      this.logger.warn({ err, bucket }, 'rate limiter unavailable; allowing request');
      return;
    }
    if (count > limit) {
      throw Errors.tooMany('Too many requests. Please wait and try again.', windowSeconds);
    }
  }
}
