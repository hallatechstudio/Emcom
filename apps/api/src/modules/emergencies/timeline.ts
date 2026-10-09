import type { EmergencyEventType } from '@prisma/client';
import { Errors } from '../../common/errors/app-error';
import type { Tx } from '../../common/prisma/prisma.service';

/**
 * Appends a timeline event with the next per-emergency sequence number. The increment takes a row
 * lock on the emergency, so events are totally ordered even under concurrent admin actions.
 */
export async function appendEvent(
  tx: Tx,
  e: { id: string; communityId: string },
  type: EmergencyEventType,
  actorId: string | null,
  message?: string | null,
): Promise<number> {
  const { eventSeq } = await tx.emergency.update({
    where: { id: e.id },
    data: { eventSeq: { increment: 1 } },
    select: { eventSeq: true },
  });
  await tx.emergencyEvent.create({
    data: { emergencyId: e.id, communityId: e.communityId, seq: eventSeq, type, actorId, message: message ?? null },
  });
  return eventSeq;
}

/** SELECT … FOR UPDATE on the emergency, scoped to its community. */
export async function lockEmergency(tx: Tx, id: string, communityId: string) {
  const rows = await tx.$queryRaw<{ id: string; status: string }[]>`
    SELECT id, status::text AS status FROM emergencies
    WHERE id = ${id}::uuid AND "communityId" = ${communityId}::uuid
    FOR UPDATE`;
  if (!rows[0]) throw Errors.notFound('Emergency');
  return rows[0];
}
