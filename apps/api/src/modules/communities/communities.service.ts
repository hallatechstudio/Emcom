import { Injectable } from '@nestjs/common';
import type { CommunityMembership } from '@prisma/client';
import type { CommunityDto, CommunityPreviewDto, MembershipDto, MyCommunityDto } from '@emcom/shared-types';
import { normalizeCommunityCode, RealtimeEvent } from '@emcom/shared-types';
import type { AuthUser } from '../../common/auth/auth.types';
import type { RequestMeta } from '../../common/auth/decorators';
import { Errors } from '../../common/errors/app-error';
import { isUniqueViolation, PrismaService, Tx } from '../../common/prisma/prisma.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { OutboxType } from '../outbox/outbox.types';
import { RealtimeService } from '../realtime/realtime.service';
import type {
  CreateCommunityDto,
  JoinCommunityDto,
  SetIdentificationFieldDto,
  UpdateCommunityDto,
} from './dto/community.dto';
import { generateInviteCode } from './invite-code';
import { toCommunityDto, toMembershipDto, toPreviewDto } from './presenters';

const withField = { identificationField: true } as const;

@Injectable()
export class CommunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly rateLimit: RateLimitService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(user: AuthUser, dto: CreateCommunityDto, meta: RequestMeta): Promise<MyCommunityDto> {
    await this.rateLimit.consume(`community:create:${user.id}`, 10, 86_400);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const inviteCode = await this.freshCode(tx, dto.name);
          const community = await tx.community.create({
            data: {
              name: dto.name,
              type: dto.type,
              location: dto.location,
              description: dto.description ?? '',
              whatsappUrl: dto.whatsappUrl ?? null,
              inviteCode,
              createdById: user.id,
              identificationField: dto.identificationField
                ? { create: { label: dto.identificationField.label, required: dto.identificationField.required } }
                : undefined,
            },
            include: withField,
          });
          // PRD §6: the creator automatically becomes Community Owner + Admin.
          const membership = await tx.communityMembership.create({
            data: {
              communityId: community.id,
              userId: user.id,
              role: 'OWNER',
              status: 'APPROVED',
              decidedAt: new Date(),
              approvedAt: new Date(),
              decidedById: user.id,
            },
          });
          await this.audit.record(
            {
              action: AuditAction.COMMUNITY_CREATED,
              entityType: 'community',
              entityId: community.id,
              communityId: community.id,
              actorId: user.id,
              metadata: { name: community.name, type: community.type },
              meta,
            },
            tx,
          );
          return { community: toCommunityDto(community, membership), membership: toMembershipDto(membership), activeEmergencyCount: 0 };
        });
      } catch (err) {
        if (isUniqueViolation(err, 'inviteCode') || isUniqueViolation(err, 'code')) continue;
        throw err;
      }
    }
    throw Errors.conflict('CODE_GENERATION_FAILED', 'Could not allocate a community code, please retry');
  }

  async mine(userId: string): Promise<MyCommunityDto[]> {
    const memberships = await this.prisma.communityMembership.findMany({
      where: { userId, status: { in: ['APPROVED', 'PENDING', 'REJECTED', 'SUSPENDED'] } },
      include: { community: { include: withField } },
      orderBy: { createdAt: 'asc' },
    });
    const approvedIds = memberships.filter((m) => m.status === 'APPROVED').map((m) => m.communityId);
    const counts = approvedIds.length
      ? await this.prisma.emergency.groupBy({
          by: ['communityId'],
          where: { communityId: { in: approvedIds }, status: 'ACTIVE' },
          _count: { _all: true },
        })
      : [];
    const countMap = new Map(counts.map((c) => [c.communityId, c._count._all]));
    return memberships.map((m) => {
      // Non-approved users only see the public preview of the community, never incident data.
      const community: CommunityDto =
        m.status === 'APPROVED'
          ? toCommunityDto(m.community, m)
          : { ...toPreviewDto(m.community), whatsappUrl: null, createdAt: m.community.createdAt.toISOString() };
      return {
        community,
        membership: toMembershipDto(m),
        activeEmergencyCount: m.status === 'APPROVED' ? (countMap.get(m.communityId) ?? 0) : 0,
      };
    });
  }

  async preview(userId: string, rawCode: string): Promise<CommunityPreviewDto> {
    // Limit code guessing per account.
    await this.rateLimit.consume(`community:preview:${userId}`, 20, 3600);
    const community = await this.prisma.community.findUnique({
      where: { inviteCode: normalizeCommunityCode(rawCode) },
      include: withField,
    });
    if (!community) throw Errors.notFound('Community code');
    return toPreviewDto(community);
  }

  async join(user: AuthUser, dto: JoinCommunityDto, meta: RequestMeta): Promise<MembershipDto> {
    await this.rateLimit.consume(`community:join:${user.id}`, 20, 3600);
    const community = await this.prisma.community.findUnique({
      where: { inviteCode: normalizeCommunityCode(dto.code) },
      include: withField,
    });
    if (!community) throw Errors.notFound('Community code');

    const identificationValue = dto.identificationValue?.trim() || null;
    if (community.identificationField?.required && !identificationValue) {
      throw Errors.badRequest(
        'IDENTIFICATION_REQUIRED',
        `${community.identificationField.label} is required to join this community`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.communityMembership.findUnique({
        where: { communityId_userId: { communityId: community.id, userId: user.id } },
      });
      if (existing?.status === 'APPROVED') {
        throw Errors.conflict('ALREADY_MEMBER', 'You are already a member of this community');
      }
      if (existing?.status === 'SUSPENDED') {
        throw Errors.forbidden('Your membership in this community is suspended', 'MEMBERSHIP_SUSPENDED');
      }
      if (existing?.status === 'PENDING') {
        // Idempotent re-submit: keep the request, refresh the identification value.
        const updated = await tx.communityMembership.update({
          where: { id: existing.id },
          data: { identificationValue },
        });
        return { membership: updated, created: false };
      }
      const membership = existing
        ? // REJECTED / REMOVED / LEFT → PENDING (new request). Role is always reset to MEMBER.
          await tx.communityMembership.update({
            where: { id: existing.id },
            data: {
              status: 'PENDING',
              role: 'MEMBER',
              identificationValue,
              requestedAt: new Date(),
              decidedAt: null,
              decidedById: null,
              approvedAt: null,
              suspendedAt: null,
              removedAt: null,
            },
          })
        : await tx.communityMembership.create({
            data: { communityId: community.id, userId: user.id, identificationValue },
          });
      await this.outbox.enqueue(tx, OutboxType.JOIN_REQUESTED, { membershipId: membership.id }, {
        aggregateId: membership.id,
        communityId: community.id,
        dedupeKey: `join:${membership.id}:${membership.requestedAt.getTime()}`,
      });
      await this.audit.record(
        {
          action: AuditAction.MEMBERSHIP_REQUESTED,
          entityType: 'membership',
          entityId: membership.id,
          communityId: community.id,
          actorId: user.id,
          meta,
        },
        tx,
      );
      return { membership, created: true };
    });
    if (result.created) {
      this.realtime.emit(RealtimeEvent.MEMBERSHIP_CHANGED, community.id, { membershipId: result.membership.id, status: 'PENDING' }, { adminsOnly: true });
    }
    return toMembershipDto(result.membership);
  }

  async get(communityId: string, viewer: CommunityMembership): Promise<CommunityDto> {
    const community = await this.prisma.community.findUniqueOrThrow({ where: { id: communityId }, include: withField });
    return toCommunityDto(community, viewer);
  }

  async update(
    communityId: string,
    actor: CommunityMembership,
    dto: UpdateCommunityDto,
    meta: RequestMeta,
  ): Promise<CommunityDto> {
    const ownerOnly = (['name', 'type', 'location'] as const).filter((k) => dto[k] !== undefined);
    if (ownerOnly.length && actor.role !== 'OWNER') {
      throw Errors.forbidden(`Only the community owner can change: ${ownerOnly.join(', ')}`, 'INSUFFICIENT_ROLE');
    }
    const data = {
      name: dto.name,
      type: dto.type,
      location: dto.location,
      description: dto.description,
      whatsappUrl: dto.whatsappUrl === undefined ? undefined : dto.whatsappUrl,
    };
    const community = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.community.update({ where: { id: communityId }, data, include: withField });
      await this.audit.record(
        {
          action: AuditAction.COMMUNITY_UPDATED,
          entityType: 'community',
          entityId: communityId,
          communityId,
          actorId: actor.userId,
          metadata: { fields: Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined) },
          meta,
        },
        tx,
      );
      return updated;
    });
    return toCommunityDto(community, actor);
  }

  async setIdentificationField(
    communityId: string,
    actor: CommunityMembership,
    dto: SetIdentificationFieldDto,
    meta: RequestMeta,
  ): Promise<CommunityDto> {
    const community = await this.prisma.$transaction(async (tx) => {
      if (dto.field) {
        await tx.communityIdentificationField.upsert({
          where: { communityId },
          create: { communityId, label: dto.field.label, required: dto.field.required },
          update: { label: dto.field.label, required: dto.field.required },
        });
      } else {
        await tx.communityIdentificationField.deleteMany({ where: { communityId } });
      }
      await this.audit.record(
        {
          action: AuditAction.IDENTIFICATION_FIELD_UPDATED,
          entityType: 'community',
          entityId: communityId,
          communityId,
          actorId: actor.userId,
          metadata: { field: dto.field ?? null },
          meta,
        },
        tx,
      );
      return tx.community.findUniqueOrThrow({ where: { id: communityId }, include: withField });
    });
    return toCommunityDto(community, actor);
  }

  /** PRD §8: regenerating the code never removes existing members — memberships are not touched. */
  async rotateCode(communityId: string, actor: CommunityMembership, meta: RequestMeta): Promise<CommunityDto> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const community = await this.prisma.$transaction(async (tx) => {
          const current = await tx.community.findUniqueOrThrow({ where: { id: communityId } });
          const code = await this.freshCode(tx, current.name);
          await tx.communityCodeHistory.create({
            data: { communityId, code: current.inviteCode, retiredById: actor.userId },
          });
          const updated = await tx.community.update({
            where: { id: communityId },
            data: { inviteCode: code, inviteCodeRotatedAt: new Date() },
            include: withField,
          });
          await this.audit.record(
            {
              action: AuditAction.INVITE_CODE_ROTATED,
              entityType: 'community',
              entityId: communityId,
              communityId,
              actorId: actor.userId,
              meta,
            },
            tx,
          );
          return updated;
        });
        return toCommunityDto(community, actor);
      } catch (err) {
        if (isUniqueViolation(err)) continue;
        throw err;
      }
    }
    throw Errors.conflict('CODE_GENERATION_FAILED', 'Could not allocate a community code, please retry');
  }

  private async freshCode(tx: Tx, name: string): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = generateInviteCode(name);
      const [inUse, retired] = await Promise.all([
        tx.community.findUnique({ where: { inviteCode: code }, select: { id: true } }),
        tx.communityCodeHistory.findUnique({ where: { code }, select: { id: true } }),
      ]);
      if (!inUse && !retired) return code;
    }
    throw Errors.conflict('CODE_GENERATION_FAILED', 'Could not allocate a community code, please retry');
  }
}
