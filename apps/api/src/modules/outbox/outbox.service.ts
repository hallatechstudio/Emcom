import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Tx } from '../../common/prisma/prisma.service';
import type { OutboxPayloads, OutboxType } from './outbox.types';

/**
 * Writes broadcast intent in the SAME transaction as the state change, so an emergency can never
 * be committed without its notification work (and vice versa). The worker's OutboxDispatcher
 * moves rows into BullMQ.
 */
@Injectable()
export class OutboxService {
  async enqueue<T extends OutboxType>(
    tx: Tx,
    type: T,
    payload: OutboxPayloads[T],
    opts: { aggregateId: string; communityId?: string; dedupeKey: string },
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        type,
        aggregateId: opts.aggregateId,
        communityId: opts.communityId ?? null,
        payload: payload as unknown as Prisma.InputJsonValue,
        dedupeKey: opts.dedupeKey,
      },
    });
  }
}
