import './instrument';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { buildOpenApi, configureApp } from './bootstrap';
import { env } from './config/env';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useBodyParser('json', { limit: '100kb' });
  configureApp(app);

  const adapter = new RedisIoAdapter(app, env().REDIS_URL);
  await adapter.connect();
  app.useWebSocketAdapter(adapter);

  if (env().SWAGGER_ENABLED) SwaggerModule.setup('docs', app, buildOpenApi(app));

  await app.listen(env().PORT, '0.0.0.0');
  app.get(Logger).log(`EMCOM API listening on :${env().PORT}`);
}

void bootstrap();
