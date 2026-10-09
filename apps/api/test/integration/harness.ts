import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import IORedis from 'ioredis';
import request from 'supertest';
import { randomUUID } from 'crypto';
import type { AddressInfo } from 'net';
import type { MembershipRole, MembershipStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { TokenService } from '../../src/modules/auth/token.service';
import { MailService } from '../../src/modules/mail/mail.service';
import { FanoutService } from '../../src/modules/notifications/fanout.service';
import { PushSenderService } from '../../src/modules/notifications/push-sender.service';
import { OutboxDispatcher } from '../../src/modules/outbox/outbox-dispatcher.service';
import { QUEUES } from '../../src/modules/queue/queue.module';
import type { Queues } from '../../src/modules/queue/queues';
import { WorkerModule } from '../../src/worker/worker.module';
import { PushProviderRegistry } from '../../src/modules/notifications/providers/provider-registry';

export const PASSWORD = 'Test-Password-123';
let passwordHash: string | undefined;

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

/**
 * Boots the real API (HTTP + Socket.IO on a random port) and the worker module against the test
 * database and Redis. Everything is real except push transport (MOCK) and email (memory).
 */
export class Harness {
  app!: INestApplication;
  worker!: TestingModule;
  prisma!: PrismaService;
  url!: string;

  static async start(): Promise<Harness> {
    const h = new Harness();
    Logger.overrideLogger(false);
    await resetDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    h.app = moduleRef.createNestApplication({ logger: false });
    configureApp(h.app);
    await h.app.listen(0, '127.0.0.1');
    const addr = h.app.getHttpServer().address() as AddressInfo;
    h.url = `http://127.0.0.1:${addr.port}`;
    h.prisma = h.app.get(PrismaService);
    h.worker = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    await h.worker.init();
    return h;
  }

  async stop(): Promise<void> {
    const queues = this.worker.get<Queues>(QUEUES);
    await Promise.all(Object.values(queues).map((q) => q.obliterate({ force: true }).catch(() => undefined)));
    await this.worker.close();
    await this.app.close();
  }

  http() {
    return request(this.app.getHttpServer());
  }

  get mail(): MailService {
    return this.app.get(MailService);
  }

  get dispatcher(): OutboxDispatcher {
    return this.worker.get(OutboxDispatcher);
  }

  get registry(): PushProviderRegistry {
    return this.worker.get(PushProviderRegistry);
  }

  /**
   * Deterministically runs the async pipeline to completion without BullMQ timing:
   * outbox → fan-out → push sends. (BullMQ itself is exercised in outbox-queue.e2e-spec.ts.)
   */
  async drain(): Promise<void> {
    const fanout = this.worker.get(FanoutService);
    const sender = this.worker.get(PushSenderService);
    for (let i = 0; i < 20; i++) {
      const n = await this.dispatcher.dispatchBatch(async (e) => {
        await fanout.process(e.id);
      });
      const queued = await this.prisma.notificationDelivery.findMany({ where: { status: 'QUEUED' }, select: { id: true } });
      for (const d of queued) await sender.send(d.id).catch(() => undefined);
      if (n === 0) {
        // Leased-but-not-yet-due rows from earlier failures are not our concern here.
        return;
      }
    }
  }

  async user(email = `u-${randomUUID().slice(0, 8)}@test.dev`, opts: { verified?: boolean; fullName?: string } = {}): Promise<TestUser> {
    passwordHash ??= await AuthService.hashPassword(PASSWORD);
    const u = await this.prisma.user.create({
      data: {
        email,
        fullName: opts.fullName ?? email.split('@')[0]!,
        phone: '+2348000000000',
        passwordHash,
        emailVerifiedAt: opts.verified === false ? null : new Date(),
      },
    });
    const tokens = await this.app.get(TokenService).issueForNewSession(u.id);
    return { id: u.id, email, token: tokens.accessToken };
  }

  /** Creates a community via the real API so the creator becomes OWNER exactly as in production. */
  async community(owner: TestUser, overrides: Record<string, unknown> = {}): Promise<{ id: string; code: string }> {
    const res = await this.http()
      .post('/v1/communities')
      .set(auth(owner))
      .send({ name: 'Test Estate', type: 'ESTATE', location: 'Lagos', description: 'test', ...overrides })
      .expect(201);
    return { id: res.body.community.id, code: res.body.community.inviteCode };
  }

  /** Directly inserts a membership in a given state (for authorization matrix tests). */
  async membership(communityId: string, user: TestUser, role: MembershipRole = 'MEMBER', status: MembershipStatus = 'APPROVED', identificationValue?: string) {
    return this.prisma.communityMembership.create({
      data: { communityId, userId: user.id, role, status, identificationValue, approvedAt: status === 'APPROVED' ? new Date() : null },
    });
  }

  async device(user: TestUser, token = `mock-${randomUUID()}`) {
    await this.http().post('/v1/devices').set(auth(user)).send({ token, platform: 'ANDROID', provider: 'MOCK' }).expect(201);
    return token;
  }

  async report(user: TestUser, communityId: string, body: Record<string, unknown> = {}) {
    const res = await this.http()
      .post(`/v1/communities/${communityId}/emergencies`)
      .set(auth(user))
      .set('Idempotency-Key', `rep-${randomUUID()}`)
      .send({ category: 'FIRE', location: 'Block B', description: 'Fire reported near Block B', ...body })
      .expect(201);
    return res.body as { id: string; status: string };
  }

  critical(user: TestUser, communityId: string, key = `crit-${randomUUID()}`) {
    return this.http().post(`/v1/communities/${communityId}/critical-alerts`).set(auth(user)).set('Idempotency-Key', key).send({});
  }
}

export function auth(u: { token: string }) {
  return { authorization: `Bearer ${u.token}` };
}

export async function resetDatabase(): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  // TRUNCATE does not fire the append-only row triggers, so tests can reset freely.
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  await prisma.$disconnect();
  const redis = new IORedis(process.env.REDIS_URL!);
  await redis.flushdb();
  await redis.quit();
}

export async function flushRedis(): Promise<void> {
  const redis = new IORedis(process.env.REDIS_URL!);
  await redis.flushdb();
  await redis.quit();
}
