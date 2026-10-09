import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RequestMeta } from '../../common/auth/decorators';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';

export const AuditAction = {
  USER_REGISTERED: 'user.registered',
  USER_EMAIL_VERIFIED: 'user.email_verified',
  USER_PASSWORD_RESET: 'user.password_reset',
  USER_PASSWORD_CHANGED: 'user.password_changed',
  REFRESH_TOKEN_REUSE: 'auth.refresh_token_reuse_detected',
  COMMUNITY_CREATED: 'community.created',
  COMMUNITY_UPDATED: 'community.updated',
  IDENTIFICATION_FIELD_UPDATED: 'community.identification_field_updated',
  INVITE_CODE_ROTATED: 'community.invite_code_rotated',
  MEMBERSHIP_REQUESTED: 'membership.requested',
  MEMBERSHIP_APPROVED: 'membership.approved',
  MEMBERSHIP_REJECTED: 'membership.rejected',
  MEMBERSHIP_SUSPENDED: 'membership.suspended',
  MEMBERSHIP_REINSTATED: 'membership.reinstated',
  MEMBERSHIP_REMOVED: 'membership.removed',
  MEMBERSHIP_LEFT: 'membership.left',
  ROLE_CHANGED: 'membership.role_changed',
  EMERGENCY_REPORTED: 'emergency.reported',
  EMERGENCY_CONFIRMED: 'emergency.confirmed',
  EMERGENCY_DISMISSED: 'emergency.dismissed',
  EMERGENCY_BROADCAST_QUEUED: 'emergency.broadcast_queued',
  EMERGENCY_UPDATE_SENT: 'emergency.update_sent',
  EMERGENCY_RESOLVED: 'emergency.resolved',
  CRITICAL_ALERT_TRIGGERED: 'critical_alert.triggered',
  CRITICAL_ALERT_COALESCED: 'critical_alert.coalesced',
  CRITICAL_ALERT_RATE_LIMITED: 'critical_alert.rate_limited',
  MEDIA_ACCESSED: 'media.accessed',
} as const;
export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  action: AuditActionName;
  entityType: string;
  entityId?: string | null;
  communityId?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
  meta?: RequestMeta;
}

/** Append-only audit trail. Pass the transaction client so the audit row commits with the change. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Tx): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        communityId: entry.communityId ?? null,
        actorId: entry.actorId ?? null,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: entry.meta?.ip ?? null,
        userAgent: entry.meta?.userAgent ?? null,
        requestId: entry.meta?.requestId ?? null,
      },
    });
  }
}
