import './instrument';
import { NestFactory } from '@nestjs/core';
import { createServer } from 'http';
import { Logger } from 'nestjs-pino';
import { PrismaService } from './common/prisma/prisma.service';
import { REDIS } from './common/redis/redis.module';
import { env } from './config/env';
import { readiness } from './modules/health/health.controller';
import { MetricsService } from './modules/metrics/metrics.service';
import { WorkerModule } from './worker/worker.module';
import { WorkerRunner } from './worker/worker.runner';

/** Background process: outbox dispatcher + fan-out + push delivery + maintenance. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const runner = app.get(WorkerRunner);
  await runner.start();

  // Health + metrics for orchestrators and Prometheus (internal port, never public).
  const metrics = app.get(MetricsService);
  const server = createServer((req, res) => {
    void (async () => {
      if (req.url === '/health/live') return res.writeHead(200).end('ok');
      if (req.url === '/health/ready') {
        const r = await readiness(app.get(PrismaService), app.get(REDIS));
        return res.writeHead(r.ok ? 200 : 503, { 'content-type': 'application/json' }).end(JSON.stringify(r));
      }
      if (req.url === '/metrics') {
        return res.writeHead(200, { 'content-type': metrics.registry.contentType }).end(await metrics.registry.metrics());
      }
      res.writeHead(404).end();
    })();
  }).listen(env().WORKER_METRICS_PORT, '0.0.0.0');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`received ${signal}; draining`);
    server.close();
    await runner.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();
