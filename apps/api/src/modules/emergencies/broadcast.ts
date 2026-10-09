import type { Emergency } from '@prisma/client';
import type { Tx } from '../../common/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../../common/auth/decorators';
import { OutboxService } from '../outbox/outbox.service';
import { OutboxType } from '../outbox/outbox.types';
import { appendEvent } from './timeline';

/**
 * Creates the community broadcast for an emergency, inside the caller's transaction:
 *  1. EmergencyAlert row (UNIQUE emergencyId → an emergency can never be broadcast twice)
 *  2. recipient snapshot = every APPROVED membership of THIS community at this instant
 *  3. COMMUNITY_ALERTED timeline event
 *  4. outbox row → durable fan-out job (push + inbox) after commit
 */
export async function createBroadcast(
  tx: Tx,
  deps: { outbox: OutboxService; audit: AuditService },
  emergency: Pick<Emergency, 'id' | 'communityId' | 'pathway'>,
  actorId: string,
  meta?: RequestMeta,
): Promise<{ alertId: string; recipientCount: number; seq: number }> {
  const alert = await tx.emergencyAlert.create({
    data: {
      emergencyId: emergency.id,
      communityId: emergency.communityId,
      pathway: emergency.pathway,
      triggeredById: actorId,
      recipientCount: 0,
    },
  });
  const recipientCount = await tx.$executeRaw`
    INSERT INTO alert_recipients (id, "alertId", "communityId", "membershipId", "userId", "addedAfterBroadcast", "createdAt")
    SELECT gen_random_uuid(), ${alert.id}::uuid, m."communityId", m.id, m."userId", false, now()
    FROM community_memberships m
    WHERE m."communityId" = ${emergency.communityId}::uuid AND m.status = 'APPROVED'`;
  await tx.emergencyAlert.update({ where: { id: alert.id }, data: { recipientCount } });
  const seq = await appendEvent(tx, emergency, 'COMMUNITY_ALERTED', null, `${recipientCount} members targeted`);
  await deps.outbox.enqueue(
    tx,
    OutboxType.EMERGENCY_BROADCAST,
    { emergencyId: emergency.id, alertId: alert.id, queuedAt: new Date().toISOString() },
    { aggregateId: emergency.id, communityId: emergency.communityId, dedupeKey: `broadcast:${alert.id}` },
  );
  await deps.audit.record(
    {
      action: AuditAction.EMERGENCY_BROADCAST_QUEUED,
      entityType: 'emergency',
      entityId: emergency.id,
      communityId: emergency.communityId,
      actorId,
      metadata: { alertId: alert.id, recipientCount, pathway: emergency.pathway },
      meta,
    },
    tx,
  );
  return { alertId: alert.id, recipientCount, seq };
}
