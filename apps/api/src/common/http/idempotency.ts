import { Errors } from '../errors/app-error';
import type { PrismaService, Tx } from '../prisma/prisma.service';
import { isUniqueViolation } from '../prisma/prisma.service';

export interface IdempotentOutcome {
  resourceId: string;
  coalesced?: boolean;
}

export function assertValidKey(key: string | undefined): void {
  if (key === 'INVALID') {
    throw Errors.badRequest('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8-100 characters of [A-Za-z0-9_-:.]');
  }
}

export async function findReplay(
  prisma: PrismaService,
  userId: string,
  key: string | undefined,
  scope: string,
): Promise<IdempotentOutcome | null> {
  if (!key) return null;
  const rec = await prisma.idempotencyRecord.findUnique({ where: { userId_key: { userId, key } } });
  if (!rec) return null;
  if (rec.scope !== scope) {
    throw Errors.conflict('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request');
  }
  return { resourceId: rec.resourceId, coalesced: rec.coalesced };
}

export async function saveKey(
  tx: Tx,
  userId: string,
  key: string | undefined,
  scope: string,
  outcome: IdempotentOutcome,
): Promise<void> {
  if (!key) return;
  await tx.idempotencyRecord.create({
    data: { userId, key, scope, resourceId: outcome.resourceId, coalesced: outcome.coalesced ?? false },
  });
}

/**
 * Runs `work` and, if it loses a race with a concurrent request carrying the same key (unique
 * violation on the idempotency record), returns the winner's outcome instead.
 */
export async function runIdempotent<T>(
  prisma: PrismaService,
  userId: string,
  key: string | undefined,
  scope: string,
  work: () => Promise<T>,
  replay: (outcome: IdempotentOutcome) => Promise<T>,
): Promise<T> {
  assertValidKey(key);
  const prior = await findReplay(prisma, userId, key, scope);
  if (prior) return replay(prior);
  try {
    return await work();
  } catch (err) {
    if (key && isUniqueViolation(err, 'key')) {
      const winner = await findReplay(prisma, userId, key, scope);
      if (winner) return replay(winner);
    }
    throw err;
  }
}
