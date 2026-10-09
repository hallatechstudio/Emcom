import { QueueEvents } from 'bullmq';
import { FanoutService } from '../../src/modules/notifications/fanout.service';
import { MockPushProvider } from '../../src/modules/notifications/providers/mock.provider';
import { PushSenderService } from '../../src/modules/notifications/push-sender.service';
import { createRedisConnection } from '../../src/common/redis/redis.module';
import { QUEUES } from '../../src/modules/queue/queue.module';
import type { Queues } from '../../src/modules/queue/queues';
import { WorkerRunner } from '../../src/worker/worker.runner';
import { flushRedis, Harness, TestUser } from './harness';

/** E2E 11: queue outage, retry, recovery and duplicate jobs. */
describe('Transactional outbox + BullMQ pipeline', () => {
  let h: Harness;
  let owner: TestUser, member: TestUser;
  let community: { id: string };

  beforeAll(async () => {
    h = await Harness.start();
    owner = await h.user();
    member = await h.user();
    community = await h.community(owner);
    await h.membership(community.id, member, 'MEMBER');
  });
  afterAll(() => h.stop());
  beforeEach(async () => {
    await flushRedis();
    await h.drain();
    // Avoid coalescing into a critical alert left active by a previous test.
    await h.prisma.$executeRaw`UPDATE emergencies SET status = 'RESOLVED', "resolvedAt" = now(), "resolutionMessage" = 'test reset' WHERE status = 'ACTIVE'`;
  });

  it('keeps broadcast intent PENDING with backoff while the queue is down, then recovers', async () => {
    await h.device(member);
    const res = await h.critical(owner, community.id).expect(201);
    const id = res.body.emergency.id;
    const event = await h.prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: id, type: 'emergency.broadcast' } });

    // Simulated Redis/BullMQ outage.
    const leased = await h.dispatcher.dispatchBatch(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:6380');
    });
    expect(leased).toBeGreaterThanOrEqual(1);
    const failed = await h.prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(failed.status).toBe('PENDING');
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toContain('ECONNREFUSED');
    expect(failed.availableAt.getTime()).toBeGreaterThan(Date.now());
    // Not re-leased before the backoff elapses.
    expect(await h.dispatcher.dispatchBatch(async () => undefined)).toBe(0);

    // Recovery: make it due and dispatch through the real queue.
    await h.prisma.outboxEvent.update({ where: { id: event.id }, data: { availableAt: new Date() } });
    await h.dispatcher.dispatchBatch();
    const dispatched = await h.prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(dispatched.status).toBe('DISPATCHED');
    const queues = h.worker.get<Queues>(QUEUES);
    const job = await queues.fanout.getJob(`outbox-${event.id}`);
    expect(job?.data.outboxEventId).toBe(event.id);
  });

  it('duplicate publishes create one job and replayed fan-out creates no duplicate notifications', async () => {
    const res = await h.critical(member, community.id).expect(201);
    const event = await h.prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: res.body.emergency.id, type: 'emergency.broadcast' } });
    const queues = h.worker.get<Queues>(QUEUES);
    // Crash-after-publish scenario: the same row gets published twice.
    await queues.fanout.add(event.type, { outboxEventId: event.id }, { jobId: `outbox-${event.id}` });
    await queues.fanout.add(event.type, { outboxEventId: event.id }, { jobId: `outbox-${event.id}` });
    expect(await queues.fanout.getJobCountByTypes('waiting', 'prioritized')).toBe(1);

    const fanout = h.worker.get(FanoutService);
    const first = await fanout.process(event.id);
    const second = await fanout.process(event.id);
    expect(first.notifications).toBeGreaterThan(0);
    expect(second.notifications).toBe(0);
    const counts = await h.prisma.notification.groupBy({ by: ['userId'], where: { emergencyId: res.body.emergency.id }, _count: true });
    expect(counts.every((c) => c._count === 1)).toBe(true);
  });

  it('runs end-to-end through real BullMQ workers: transient failures retry, then succeed or dead-letter', async () => {
    const flaky = 'mock-fail-device-0001';
    await h.device(owner, flaky);
    const good = await h.device(owner);
    let calls = 0;
    // Fail the flaky token twice, then accept, to exercise retry/backoff.
    h.registry.register({
      name: 'MOCK',
      send: async (m) => {
        if (m.token === flaky) {
          calls++;
          return calls <= 2 ? { ok: false, kind: 'transient', error: 'provider 503' } : { ok: true, providerMessageId: 'ok-after-retry' };
        }
        return { ok: true, providerMessageId: 'ok-first-time' };
      },
    });

    const runner = h.worker.get(WorkerRunner);
    await runner.start();
    const queueEvents = new QueueEvents('emcom-push', { connection: createRedisConnection() });
    try {
      const res = await h.critical(member, community.id).expect(201);
      const id = res.body.emergency.id;
      const deadline = Date.now() + 20_000;
      let deliveries: { status: string; attempts: number; deviceTokenId: string }[] = [];
      while (Date.now() < deadline) {
        deliveries = await h.prisma.notificationDelivery.findMany({ where: { notification: { emergencyId: id, userId: owner.id } } });
        if (deliveries.length === 2 && deliveries.every((d) => d.status !== 'QUEUED')) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(deliveries.map((d) => d.status).sort()).toEqual(['PROVIDER_ACCEPTED', 'PROVIDER_ACCEPTED']);
      const flakyRow = await h.prisma.deviceToken.findUniqueOrThrow({ where: { token: flaky } });
      expect(deliveries.find((d) => d.deviceTokenId === flakyRow.id)!.attempts).toBe(3);
      expect(good).toBeTruthy();
    } finally {
      await queueEvents.close();
      await runner.stop();
    }
  }, 40_000);

  it('records FAILED (dead-letter) after the final retry', async () => {
    const sender = h.worker.get(PushSenderService);
    await h.device(member, 'mock-fail-always-0001');
    h.registry.register({ name: 'MOCK', send: async () => ({ ok: false, kind: 'transient', error: 'provider down' }) });
    const res = await h.critical(owner, community.id).expect(201);
    await h.dispatcher.dispatchBatch(async (e) => {
      await h.worker.get(FanoutService).process(e.id);
    });
    const d = await h.prisma.notificationDelivery.findFirstOrThrow({ where: { notification: { emergencyId: res.body.emergency.id } } });
    await expect(sender.send(d.id)).rejects.toThrow('provider down');
    await sender.markFinalFailure(d.id, 'provider down');
    const after = await h.prisma.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(after).toMatchObject({ status: 'FAILED', lastError: 'provider down' });
    // A late duplicate job cannot resurrect it.
    expect(await sender.send(d.id)).toBe('skipped');
    h.registry.register(new MockPushProvider());
  });
});
