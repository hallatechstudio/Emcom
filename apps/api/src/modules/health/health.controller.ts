import { Controller, Get, Headers, Inject, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { Public } from '../../common/auth/decorators';
import { Errors } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REDIS } from '../../common/redis/redis.module';
import { env } from '../../config/env';
import { MetricsService } from '../metrics/metrics.service';

export async function readiness(prisma: PrismaService, redis: Redis) {
  const checks: Record<string, 'ok' | 'fail'> = {};
  await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => (checks.database = 'ok')).catch(() => (checks.database = 'fail')),
    redis.ping().then(() => (checks.redis = 'ok')).catch(() => (checks.redis = 'fail')),
  ]);
  return { ok: Object.values(checks).every((c) => c === 'ok'), checks };
}

@ApiExcludeController()
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly metrics: MetricsService,
  ) {}

  @Public()
  @Get('health/live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('health/ready')
  async ready(@Res() res: Response) {
    const r = await readiness(this.prisma, this.redis);
    res.status(r.ok ? 200 : 503).json({ status: r.ok ? 'ok' : 'degraded', checks: r.checks });
  }

  @Public()
  @Get('metrics')
  async metricsEndpoint(@Headers('authorization') auth: string | undefined, @Res() res: Response) {
    const token = env().METRICS_TOKEN;
    if (token && auth !== `Bearer ${token}`) throw Errors.unauthorized();
    res.setHeader('content-type', this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }
}
