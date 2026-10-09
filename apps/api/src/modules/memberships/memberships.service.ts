import { Injectable } from '@nestjs/common';
import type { CommunityMembership, MembershipStatus, Prisma } from '@prisma/client';
import type { MemberListItemDto, MembershipDto, Paginated } from '@emcom/shared-types';
import { canModerate, canTransitionMembership, RealtimeEvent } from '@emcom/shared-types';
import type { RequestMeta } from '../../common/auth/decorators';
import { Errors } from '../../common/errors/app-error';
import { keysetWhere, page } from '../../common/http/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditAction, AuditActionName, AuditService } from '../audit/audit.service';
import { toMembershipDto } from '../communities/presenters';
import { OutboxService } from '../outbox/outbox.service';
import { OutboxType } from '../outbox/outbox.types';
import { RealtimeService } from '../realtime/realtime.service';
import type { ListMembersQueryDto, MembershipAction } from './dto/membership.dto';

interface ActionRule {
  from: MembershipStatus[];
  to: MembershipStatus;
  audit: AuditActionName;
  /** Needs actor rank strictly above target (suspend/remove/reinstate). */
  rankCheck: boolean;
}

const RULES: Record<MembershipAction, ActionRule> = {
  approve: { from: ['PENDING'], to: 'APPROVED', audit: AuditAction.MEMBERSHIP_APPROVED, rankCheck: false },
  reject: { from: ['PENDING'], to: 'REJECTED', audit: AuditAction.MEMBERSHIP_REJECTED, rankCheck: false },
  suspend: { from: ['APPROVED'], to: 'SUSPENDED', audit: AuditAction.MEMBERSHIP_SUSPENDED, rankCheck: true },
  reinstate: { from: ['SUSPENDED'], to: 'APPROVED', audit: AuditAction.MEMBERSHIP_REINSTATED, rankCheck: true },
  remove: { from: ['APPROVED', 'SUSPENDED'], to: 'REMOVED', audit: AuditAction.MEMBERSHIP_REMOVED, rankCheck: true },
};

const memberSelect = { user: { select: { id: true, fullName: true, email: true, phone: true } } } as const;

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(communityId: string, q: ListMembersQueryDto): Promise<Paginated<MemberListItemDto>> {
    const limit = q.limit ?? 20;
    const search: Prisma.CommunityMembershipWhereInput = q.q
      ? {
          OR: [
            { identificationValue: { contains: q.q, mode: 'insensitive' } },
            { user: { fullName: { contains: q.q, mode: 'insensitive' } } },
            { user: { email: { contains: q.q, mode: 'insensitive' } } },
            { user: { phone: { contains: q.q } } },
          ],
        }
      : {};
    const rows = await this.prisma.communityMembership.findMany({
      where: { communityId, status: q.status, role: q.role, ...search, AND: [keysetWhere(q.cursor)] },
      include: memberSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const p = page(rows, limit);
    return { items: p.items.map(toListItem), nextCursor: p.nextCursor };
  }

  /** The caller's own membership in any state (used by "Join Request Pending"). */
  async mine(communityId: string, userId: string): Promise<MembershipDto> {
    const m = await this.prisma.communityMembership.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
    if (!m) throw Errors.notFound('Membership');
    return toMembershipDto(m);
  }

  async act(
    communityId: string,
    actor: CommunityMembership,
    membershipId: string,
    action: MembershipAction,
    meta: RequestMeta,
  ): Promise<MemberListItemDto> {
    const rule = RULES[action];
    const updated = await this.prisma.$transaction(async (tx) => {
      // Scoped by communityId: a membership id from another community is simply "not found".
      const target = await tx.communityMembership.findFirst({ where: { id: membershipId, communityId } });
      if (!target) throw Errors.notFound('Membership');
      if (target.userId === actor.userId) throw Errors.forbidden('You cannot change your own membership this way');
      if (rule.rankCheck && !canModerate(actor.role, target.role)) {
        throw Errors.forbidden('You cannot moderate a member with an equal or higher role', 'INSUFFICIENT_ROLE');
      }
      if (!rule.from.includes(target.status) || !canTransitionMembership(target.status, rule.to)) {
        throw Errors.invalidTransition(target.status, rule.to);
      }
      const now = new Date();
      // Conditional update = optimistic concurrency: a parallel decision makes this a no-op.
      const res = await tx.communityMembership.updateMany({
        where: { id: target.id, status: target.status },
        data: {
          status: rule.to,
          decidedAt: action === 'approve' || action === 'reject' ? now : undefined,
          decidedById: actor.userId,
          approvedAt: rule.to === 'APPROVED' ? now : undefined,
          suspendedAt: action === 'suspend' ? now : action === 'reinstate' ? null : undefined,
          removedAt: action === 'remove' ? now : undefined,
          // Removing an admin also strips the role so a later re-join starts as MEMBER.
          role: action === 'remove' ? 'MEMBER' : undefined,
        },
      });
      if (res.count !== 1) throw Errors.conflict('CONCURRENT_UPDATE', 'This membership was changed by someone else');

      if (action === 'approve' || action === 'reject') {
        const decision = action === 'approve' ? 'APPROVED' : 'REJECTED';
        await this.outbox.enqueue(tx, OutboxType.MEMBERSHIP_DECIDED, { membershipId: target.id, decision }, {
          aggregateId: target.id,
          communityId,
          dedupeKey: `membership-decided:${target.id}:${now.getTime()}`,
        });
      }
      await this.audit.record(
        {
          action: rule.audit,
          entityType: 'membership',
          entityId: target.id,
          communityId,
          actorId: actor.userId,
          metadata: { targetUserId: target.userId, from: target.status, to: rule.to },
          meta,
        },
        tx,
      );
      return tx.communityMembership.findUniqueOrThrow({ where: { id: target.id }, include: memberSelect });
    });

    if (updated.status !== 'APPROVED') this.realtime.revokeCommunityAccess(updated.userId, communityId);
    this.realtime.emit(RealtimeEvent.MEMBERSHIP_CHANGED, communityId, { membershipId: updated.id, status: updated.status }, { adminsOnly: true });
    return toListItem(updated);
  }

  /** Owner-only: promote a member to Admin or demote an Admin to Member (PRD §23). */
  async setRole(
    communityId: string,
    actor: CommunityMembership,
    membershipId: string,
    role: 'ADMIN' | 'MEMBER',
    meta: RequestMeta,
  ): Promise<MemberListItemDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const target = await tx.communityMembership.findFirst({ where: { id: membershipId, communityId } });
      if (!target) throw Errors.notFound('Membership');
      if (target.role === 'OWNER') throw Errors.forbidden('The owner role cannot be changed', 'OWNER_IMMUTABLE');
      if (target.status !== 'APPROVED') {
        throw Errors.conflict('MEMBERSHIP_NOT_ACTIVE', 'Only approved members can be assigned roles');
      }
      if (target.role === role) {
        return tx.communityMembership.findUniqueOrThrow({ where: { id: target.id }, include: memberSelect });
      }
      const res = await tx.communityMembership.updateMany({
        where: { id: target.id, role: target.role, status: 'APPROVED' },
        data: { role },
      });
      if (res.count !== 1) throw Errors.conflict('CONCURRENT_UPDATE', 'This membership was changed by someone else');
      await this.audit.record(
        {
          action: AuditAction.ROLE_CHANGED,
          entityType: 'membership',
          entityId: target.id,
          communityId,
          actorId: actor.userId,
          metadata: { targetUserId: target.userId, from: target.role, to: role },
          meta,
        },
        tx,
      );
      return tx.communityMembership.findUniqueOrThrow({ where: { id: target.id }, include: memberSelect });
    });
    if (role === 'MEMBER') this.realtime.revokeAdminRoom(updated.userId, communityId);
    this.realtime.emit(RealtimeEvent.MEMBERSHIP_CHANGED, communityId, { membershipId: updated.id, role }, { adminsOnly: true });
    return toListItem(updated);
  }

  /** Member leaves, or a requester withdraws a pending request. The owner cannot leave. */
  async leave(communityId: string, userId: string, meta: RequestMeta): Promise<MembershipDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const m = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId, userId } } });
      if (!m) throw Errors.notFound('Membership');
      if (m.role === 'OWNER') {
        throw Errors.conflict('OWNER_CANNOT_LEAVE', 'The community owner cannot leave the community');
      }
      if (!canTransitionMembership(m.status, 'LEFT')) throw Errors.invalidTransition(m.status, 'LEFT');
      const res = await tx.communityMembership.updateMany({
        where: { id: m.id, status: m.status },
        data: { status: 'LEFT', role: 'MEMBER' },
      });
      if (res.count !== 1) throw Errors.conflict('CONCURRENT_UPDATE', 'Membership changed, please retry');
      await this.audit.record(
        {
          action: AuditAction.MEMBERSHIP_LEFT,
          entityType: 'membership',
          entityId: m.id,
          communityId,
          actorId: userId,
          metadata: { from: m.status },
          meta,
        },
        tx,
      );
      return tx.communityMembership.findUniqueOrThrow({ where: { id: m.id } });
    });
    this.realtime.revokeCommunityAccess(userId, communityId);
    return toMembershipDto(updated);
  }
}

function toListItem(m: CommunityMembership & { user: { id: string; fullName: string; email: string; phone: string } }): MemberListItemDto {
  return { ...toMembershipDto(m), user: m.user };
}
