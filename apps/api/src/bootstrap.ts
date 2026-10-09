import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { env } from './config/env';

/** HTTP app configuration shared by main.ts, e2e tests and the OpenAPI generator. */
export function configureApp(app: INestApplication): void {
  const http = app.getHttpAdapter().getInstance() as { set?: (k: string, v: unknown) => void; disable?: (k: string) => void };
  if (env().TRUST_PROXY) http.set?.('trust proxy', 1);
  http.disable?.('x-powered-by');
  app.use(helmet());
  app.enableCors({
    origin: env().CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: false,
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Unknown fields are rejected outright (mass-assignment protection).
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
}

export function buildOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('EMCOM API')
    .setDescription("EMCOM — Your Community's Emergency Network. All community routes enforce per-community roles server-side.")
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
