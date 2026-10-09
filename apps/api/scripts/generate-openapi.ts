/* Writes docs/openapi.json from the live Nest metadata (no server, DB or Redis needed). */
process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:1/x';
process.env.REDIS_URL ??= 'redis://localhost:1';
process.env.JWT_ACCESS_SECRET ??= 'openapi-generation-only-secret-000000000000';
process.env.NODE_ENV ??= 'development';
process.env.LOG_LEVEL = 'silent';

import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { buildOpenApi, configureApp } from '../src/bootstrap';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false, preview: true });
  configureApp(app);
  const doc = buildOpenApi(app);
  const out = join(__dirname, '../../../docs/openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(`wrote ${out} (${Object.keys(doc.paths).length} paths)`);
  process.exit(0);
}
void main();
