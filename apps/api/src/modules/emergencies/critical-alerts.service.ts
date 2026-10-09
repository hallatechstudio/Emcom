import { Injectable } from '@nestjs/common';
import type { CommunityMembership } from '@prisma/client';
import type { CriticalAlertResultDto } from '@emcom/shared-types';
import { RealtimeEvent } from '@emcom/shared-types';
import type { RequestMeta } from '../../common/auth/decorators';
import { Errors } from '../../common/errors/app-error';
import { runIdempotent, saveKey } from '../../common/http/idempotency';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';
import { AuditAction, AuditService } from '../audit/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import { OutboxService } from '../outbox/outbox.service';
import { RealtimeService } from '../realtime/realtime.service';
import { createBroadcast } from './broadcast';
import type { TriggerCriticalAlertDto } from './dto/emergency.dto';
import { EmergenciesService, viewerOf } from './emergencies.service';
import { appendEvent } from './timeline';

const SCOPE = 'critical_alert';

/**
 * PRD §13–14: Critical Alert — no category, no admin approval. A confirmed trigger immediately
 * creates an ACTIVE incident and durable broadcast work.
 *
 * Concurrency: triggers for one community are serialised with a transaction-scoped advisory lock,
 * so simultaneous presses cannot produce contradictory state.
 *
 * Abuse prevention without suppressing genuine emergencies:
 *  - Coalescing: if an ACTIVE critical alert in the same community was raised within
 *    CRITICAL_ALERT_COALESCE_SECONDS, the trigger is recorded on that incident (timeline + count)
 *    instead of re-broadcasting. The community has already been alerted.
 *  - Per-user cap on NEW broadcasts in a window (explicit 429 with guidance, audited).
 *  - Everything is audited so admins can respond to misuse (suspend/remove).
 */
@Injectable()
export class CriticalAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeService,
    private readonly metrics: MetricsService,
    private readonly emergencies: EmergenciesService,
  ) {}

  async trigger(
    membership: CommunityMembership,
    dto: TriggerCriticalAlertDto,
    idempotencyKey: string | undefined,
    meta: RequestMeta,
  ): Promise<CriticalAlertResultDto> {
    const viewer = viewerOf(membership);
    const { communityId, userId } = membership;

    return runIdempotent(
      this.prisma,
      userId,
      idempotencyKey,
      SCOPE,
      async () => {
        const outcome = await this.prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'critical:' + communityId}, 0))`;

            // Membership may have changed since the guard ran (e.g. suspended a moment ago).
            const current = await tx.communityMembership.findUnique({ where: { id: membership.id } });
            if (current?.status !== 'APPROVED') {
              throw Errors.forbidden('Your membership in this community is not active', 'MEMBERSHIP_NOT_ACTIVE');
            }

            const now = Date.now();
            const coalesceSince = new Date(now - env().CRITICAL_ALERT_COALESCE_SECONDS * 1000);
            const recentActive =
              env().CRITICAL_ALERT_COALESCE_SECONDS > 0
                ? await tx.emergency.findFirst({
                    where: { communityId, pathway: 'CRITICAL', status: 'ACTIVE', createdAt: { gte: coalesceSince } },
                    orderBy: { createdAt: 'desc' },
                  })
                : null;

            if (recentActive) {
              await tx.emergency.update({
                where: { id: recentActive.id },
                data: { additionalTriggerCount: { increment: 1 } },
              });
              const seq = await appendEvent(tx, recentActive, 'ADDITIONAL_TRIGGER', userId, dto.location || null);
              await this.audit.record(
                {
                  action: AuditAction.CRITICAL_ALERT_COALESCED,
                  entityType: 'emergency',
                  entityId: recentActive.id,
                  communityId,
                  actorId: userId,
                  metadata: { location: dto.location ?? null },
                  meta,
                },
                tx,
              );
              await saveKey(tx, userId, idempotencyKey, SCOPE, { resourceId: recentActive.id, coalesced: true });
              return { emergencyId: recentActive.id, coalesced: true, seq };
            }

            const windowStart = new Date(now - env().CRITICAL_ALERT_USER_WINDOW_SECONDS * 1000);
            const recentByUser = await tx.emergency.count({
              where: { communityId, reporterId: userId, pathway: 'CRITICAL', createdAt: { gte: windowStart } },
            });
            if (recentByUser >= env().CRITICAL_ALERT_USER_LIMIT) {
              // Recorded outside this (rolled-back) transaction below.
              throw new CriticalRateLimited(recentByUser);
            }

            const e = await tx.emergency.create({
              data: {
                communityId,
                pathway: 'CRITICAL',
                status: 'ACTIVE',
                location: dto.location || null,
                reporterId: userId,
                confirmedAt: new Date(),
              },
            });
            await appendEvent(tx, e, 'CRITICAL_ALERT_TRIGGERED', userId, dto.location || null);
            await this.audit.record(
              {
                action: AuditAction.CRITICAL_ALERT_TRIGGERED,
                entityType: 'emergency',
                entityId: e.id,
                communityId,
                actorId: userId,
                meta,
              },
              tx,
            );
            const b = await createBroadcast(tx, { outbox: this.outbox, audit: this.audit }, e, userId, meta);
            await saveKey(tx, userId, idempotencyKey, SCOPE, { resourceId: e.id });
            return { emergencyId: e.id, coalesced: false, seq: b.seq };
          },
          { timeout: 15_000, maxWait: 10_000 },
        );

        if (outcome.coalesced) {
          this.realtime.emit(RealtimeEvent.EMERGENCY_CHANGED, communityId, { emergencyId: outcome.emergencyId, status: 'ACTIVE' }, {
            emergencyId: outcome.emergencyId,
            seq: outcome.seq,
          });
        } else {
          this.metrics.emergenciesCreated.inc({ pathway: 'CRITICAL' });
          this.realtime.emit(RealtimeEvent.EMERGENCY_CREATED, communityId, { emergencyId: outcome.emergencyId, status: 'ACTIVE', pathway: 'CRITICAL' }, {
            emergencyId: outcome.emergencyId,
            seq: outcome.seq,
          });
        }
        return {
          emergency: await this.emergencies.getOne(viewer, outcome.emergencyId),
          coalesced: outcome.coalesced,
          broadcastStatus: outcome.coalesced ? 'ALREADY_BROADCAST' : 'QUEUED',
        } satisfies CriticalAlertResultDto;
      },
      async (prior): Promise<CriticalAlertResultDto> => ({
        emergency: await this.emergencies.getOne(viewer, prior.resourceId),
        coalesced: !!prior.coalesced,
        broadcastStatus: prior.coalesced ? 'ALREADY_BROADCAST' : 'QUEUED',
      }),
    ).catch(async (err) => {
      if (err instanceof CriticalRateLimited) {
        await this.audit.record({
          action: AuditAction.CRITICAL_ALERT_RATE_LIMITED,
          entityType: 'community',
          entityId: communityId,
          communityId,
          actorId: userId,
          metadata: { recentByUser: err.recent },
          meta,
        });
        throw Errors.tooMany(
          'You have sent several critical alerts recently. If lives are at risk, call your local emergency services now and contact your community administrators.',
          env().CRITICAL_ALERT_USER_WINDOW_SECONDS,
        );
      }
      throw err;
    });
  }
}

class CriticalRateLimited extends Error {
  constructor(readonly recent: number) {
    super('critical alert rate limited');
  }
}
