import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Namespace, Server } from 'socket.io';
import { RealtimeEnvelope, RealtimeEvent } from '@emcom/shared-types';

export const communityRoom = (communityId: string) => `community:${communityId}`;
export const adminRoom = (communityId: string) => `community:${communityId}:admins`;
export const userRoom = (userId: string) => `user:${userId}`;

/**
 * Publishes community-scoped events. Payloads carry identifiers and status only; clients refetch
 * details through the authorized REST API. Best effort: realtime is never the only delivery path.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | Namespace | null = null;

  attach(server: Server | Namespace): void {
    this.server = server;
  }

  emit<T>(
    event: RealtimeEvent,
    communityId: string,
    data: T,
    opts: { adminsOnly?: boolean; emergencyId?: string; seq?: number } = {},
  ): void {
    if (!this.server) return;
    const envelope: RealtimeEnvelope<T> = {
      communityId,
      emergencyId: opts.emergencyId,
      seq: opts.seq,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      data,
    };
    try {
      this.server.to(opts.adminsOnly ? adminRoom(communityId) : communityRoom(communityId)).emit(event, envelope);
    } catch (err) {
      this.logger.warn({ err, event }, 'realtime emit failed');
    }
  }

  emitToUser<T>(userId: string, event: RealtimeEvent, communityId: string, data: T): void {
    if (!this.server) return;
    const envelope: RealtimeEnvelope<T> = {
      communityId,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      data,
    };
    this.server.to(userRoom(userId)).emit(event, envelope);
  }

  /** Immediately removes all of a user's sockets from a community's rooms (suspension/removal/leave). */
  revokeCommunityAccess(userId: string, communityId: string): void {
    if (!this.server) return;
    this.server.in(userRoom(userId)).socketsLeave([communityRoom(communityId), adminRoom(communityId)]);
    this.emitToUser(userId, RealtimeEvent.ACCESS_REVOKED, communityId, { communityId });
  }

  revokeAdminRoom(userId: string, communityId: string): void {
    if (!this.server) return;
    this.server.in(userRoom(userId)).socketsLeave(adminRoom(communityId));
  }
}
