import { Injectable } from '@nestjs/common';
import type { CommunityMembership, Prisma } from '@prisma/client';
import type { EmergencyDto, EmergencyEventDto, EmergencyUpdateDto, Paginated } from '@emcom/shared-types';
import { canTransitionEmergency, isAdminRole, RealtimeEvent } from '@emcom/shared-types';
import type { RequestMeta } from '../../common/auth/decorators';
import { Errors } from '../../common/errors/app-error';
import { runIdempotent, saveKey } from '../../common/http/idempotency';
import { keysetWhere, page } from '../../common/http/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { env } from '../../config/env';
import { AuditAction, AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { MetricsService } from '../metrics/metrics.service';
import { OutboxService } from '../outbox/outbox.service';
import { OutboxType } from '../outbox/outbox.types';
import { RealtimeService } from '../realtime/realtime.service';
import { createBroadcast } from './broadcast';
import type {
  ConfirmEmergencyDto,
  DismissEmergencyDto,
  ListEmergenciesQueryDto,
  PostUpdateDto,
  ReportEmergencyDto,
  ResolveEmergencyDto,
} from './dto/emergency.dto';
import { emergencyInclude, toEmergencyDto, toEventDto, toUpdateDto } from './presenters';
import { appendEvent, lockEmergency } from './timeline';

export interface Viewer {
  userId: string;
  communityId: string;
  isAdmin: boolean;
}

export const viewerOf = (m: CommunityMembership): Viewer => ({
  userId: m.userId,
  communityId: m.communityId,
  isAdmin: isAdminRole(m.role),
});

/**
 * Members see ACTIVE/RESOLVED incidents of their community plus their own reports in any state.
 * Admins additionally see PENDING and DISMISSED (PRD §21). Every query is community-scoped.
 */
export function visibilityWhere(v: Viewer): Prisma.EmergencyWhereInput {
  if (v.isAdmin) return { communityId: v.communityId };
  return { communityId: v.communityId, OR: [{ status: { in: ['ACTIVE', 'RESOLVED'] } }, { reporterId: v.userId }] };
}

@Injectable()
export class EmergenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeService,
    private readonly media: MediaService,
    private readonly rateLimit: RateLimitService,
    private readonly metrics: MetricsService,
  ) {}

  // ---------------------------------------------------------------- normal report (PRD §11–12)

  async report(
    membership: CommunityMembership,
    dto: ReportEmergencyDto,
    idempotencyKey: string | undefined,
    meta: RequestMeta,
  ): Promise<EmergencyDto> {
    const viewer = viewerOf(membership);
    return runIdempotent(
      this.prisma,
      membership.userId,
      idempotencyKey,
      'emergency.report',
      async () => {
        await this.rateLimit.consume(
          `report:${membership.communityId}:${membership.userId}`,
          env().REPORT_USER_LIMIT,
          env().REPORT_USER_WINDOW_SECONDS,
        );
        const verifiedMedia = await this.media.verifyUploads(dto.mediaIds, {
          userId: membership.userId,
          communityId: membership.communityId,
        });
        const emergency = await this.prisma.$transaction(async (tx) => {
          const e = await tx.emergency.create({
            data: {
              communityId: membership.communityId,
              pathway: 'NORMAL',
              status: 'PENDING',
              category: dto.category,
              location: dto.location,
              description: dto.description,
              reporterId: membership.userId,
            },
          });
          await appendEvent(tx, e, 'REPORTED', membership.userId);
          await this.media.attach(tx, verifiedMedia, {
            userId: membership.userId,
            communityId: membership.communityId,
            emergencyId: e.id,
          });
          await this.outbox.enqueue(tx, OutboxType.EMERGENCY_REPORTED, { emergencyId: e.id }, {
            aggregateId: e.id,
            communityId: e.communityId,
            dedupeKey: `reported:${e.id}`,
          });
          await this.audit.record(
            {
              action: AuditAction.EMERGENCY_REPORTED,
              entityType: 'emergency',
              entityId: e.id,
              communityId: e.communityId,
              actorId: membership.userId,
              metadata: { category: dto.category, mediaCount: verifiedMedia.length },
              meta,
            },
            tx,
          );
          await saveKey(tx, membership.userId, idempotencyKey, 'emergency.report', { resourceId: e.id });
          return e;
        });
        this.metrics.emergenciesCreated.inc({ pathway: 'NORMAL' });
        this.realtime.emit(RealtimeEvent.EMERGENCY_CREATED, emergency.communityId, { emergencyId: emergency.id, status: 'PENDING' }, {
          adminsOnly: true,
          emergencyId: emergency.id,
          seq: 1,
        });
        return this.getOne(viewer, emergency.id);
      },
      (prior) => this.getOne(viewer, prior.resourceId),
    );
  }

  // ---------------------------------------------------------------- admin decisions

  async confirm(admin: CommunityMembership, id: string, dto: ConfirmEmergencyDto, meta: RequestMeta): Promise<EmergencyDto> {
    const viewer = viewerOf(admin);
    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await lockEmergency(tx, id, admin.communityId);
      if (locked.status !== 'PENDING') {
        if (locked.status === 'ACTIVE') {
          throw Errors.conflict('ALREADY_CONFIRMED', 'This emergency has already been confirmed and broadcast');
        }
        throw Errors.invalidTransition(locked.status, 'ACTIVE');
      }
      const now = new Date();
      const e = await tx.emergency.update({
        where: { id },
        data: { status: 'ACTIVE', confirmedAt: now, confirmedById: admin.userId, instructions: dto.instructions || null },
      });
      await appendEvent(tx, e, 'CONFIRMED', admin.userId, dto.instructions || null);
      await this.audit.record(
        {
          action: AuditAction.EMERGENCY_CONFIRMED,
          entityType: 'emergency',
          entityId: id,
          communityId: e.communityId,
          actorId: admin.userId,
          meta,
        },
        tx,
      );
      const b = await createBroadcast(tx, { outbox: this.outbox, audit: this.audit }, e, admin.userId, meta);
      return { e, seq: b.seq };
    });
    this.emitPublic(RealtimeEvent.EMERGENCY_CREATED, result.e.communityId, id, 'ACTIVE', result.seq);
    return this.getOne(viewer, id);
  }

  async dismiss(admin: CommunityMembership, id: string, dto: DismissEmergencyDto, meta: RequestMeta): Promise<EmergencyDto> {
    const viewer = viewerOf(admin);
    const seq = await this.prisma.$transaction(async (tx) => {
      const locked = await lockEmergency(tx, id, admin.communityId);
      if (!canTransitionEmergency(locked.status as never, 'DISMISSED')) {
        throw Errors.invalidTransition(locked.status, 'DISMISSED');
      }
      const e = await tx.emergency.update({
        where: { id },
        data: { status: 'DISMISSED', dismissedAt: new Date(), dismissedById: admin.userId, dismissalReason: dto.reason || null },
      });
      const s = await appendEvent(tx, e, 'DISMISSED', admin.userId);
      await this.outbox.enqueue(tx, OutboxType.EMERGENCY_DISMISSED, { emergencyId: id }, {
        aggregateId: id,
        communityId: e.communityId,
        dedupeKey: `dismissed:${id}`,
      });
      await this.audit.record(
        {
          action: AuditAction.EMERGENCY_DISMISSED,
          entityType: 'emergency',
          entityId: id,
          communityId: e.communityId,
          actorId: admin.userId,
          metadata: { reason: dto.reason ?? null },
          meta,
        },
        tx,
      );
      return s;
    });
    // Dismissed reports are admin-only: never published to the member room.
    this.realtime.emit(RealtimeEvent.EMERGENCY_CHANGED, admin.communityId, { emergencyId: id, status: 'DISMISSED' }, {
      adminsOnly: true,
      emergencyId: id,
      seq,
    });
    return this.getOne(viewer, id);
  }

  async postUpdate(
    admin: CommunityMembership,
    id: string,
    dto: PostUpdateDto,
    idempotencyKey: string | undefined,
    meta: RequestMeta,
  ): Promise<EmergencyUpdateDto> {
    const load = (updateId: string) =>
      this.prisma.emergencyUpdate
        .findFirstOrThrow({
          where: { id: updateId, communityId: admin.communityId },
          include: { author: { select: { id: true, fullName: true } } },
        })
        .then(toUpdateDto);
    return runIdempotent(
      this.prisma,
      admin.userId,
      idempotencyKey,
      `emergency.update:${id}`,
      async () => {
        const { update, seq } = await this.prisma.$transaction(async (tx) => {
          const locked = await lockEmergency(tx, id, admin.communityId);
          if (locked.status !== 'ACTIVE') {
            throw Errors.conflict('EMERGENCY_NOT_ACTIVE', 'Updates can only be sent for an active emergency');
          }
          const u = await tx.emergencyUpdate.create({
            data: { emergencyId: id, communityId: admin.communityId, authorId: admin.userId, message: dto.message },
          });
          const s = await appendEvent(tx, { id, communityId: admin.communityId }, 'UPDATE_SENT', admin.userId, dto.message);
          await this.outbox.enqueue(tx, OutboxType.EMERGENCY_UPDATE, { emergencyId: id, updateId: u.id }, {
            aggregateId: id,
            communityId: admin.communityId,
            dedupeKey: `update:${u.id}`,
          });
          await this.audit.record(
            {
              action: AuditAction.EMERGENCY_UPDATE_SENT,
              entityType: 'emergency',
              entityId: id,
              communityId: admin.communityId,
              actorId: admin.userId,
              metadata: { updateId: u.id },
              meta,
            },
            tx,
          );
          await saveKey(tx, admin.userId, idempotencyKey, `emergency.update:${id}`, { resourceId: u.id });
          return { update: u, seq: s };
        });
        this.realtime.emit(RealtimeEvent.EMERGENCY_UPDATE, admin.communityId, { emergencyId: id, updateId: update.id }, {
          emergencyId: id,
          seq,
        });
        return load(update.id);
      },
      (prior) => load(prior.resourceId),
    );
  }

  async resolve(admin: CommunityMembership, id: string, dto: ResolveEmergencyDto, meta: RequestMeta): Promise<EmergencyDto> {
    const viewer = viewerOf(admin);
    const seq = await this.prisma.$transaction(async (tx) => {
      const locked = await lockEmergency(tx, id, admin.communityId);
      if (!canTransitionEmergency(locked.status as never, 'RESOLVED')) {
        if (locked.status === 'RESOLVED') throw Errors.conflict('ALREADY_RESOLVED', 'This emergency is already resolved');
        throw Errors.invalidTransition(locked.status, 'RESOLVED');
      }
      const e = await tx.emergency.update({
        where: { id },
        data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: admin.userId, resolutionMessage: dto.resolutionMessage },
      });
      const s = await appendEvent(tx, e, 'RESOLVED', admin.userId, dto.resolutionMessage);
      await this.outbox.enqueue(tx, OutboxType.EMERGENCY_RESOLVED, { emergencyId: id }, {
        aggregateId: id,
        communityId: e.communityId,
        dedupeKey: `resolved:${id}`,
      });
      await this.audit.record(
        {
          action: AuditAction.EMERGENCY_RESOLVED,
          entityType: 'emergency',
          entityId: id,
          communityId: e.communityId,
          actorId: admin.userId,
          meta,
        },
        tx,
      );
      return s;
    });
    this.emitPublic(RealtimeEvent.EMERGENCY_CHANGED, admin.communityId, id, 'RESOLVED', seq);
    return this.getOne(viewer, id);
  }

  // ---------------------------------------------------------------- reads

  async list(v: Viewer, q: ListEmergenciesQueryDto): Promise<Paginated<EmergencyDto>> {
    const limit = q.limit ?? 20;
    const where: Prisma.EmergencyWhereInput = {
      AND: [
        visibilityWhere(v),
        q.status?.length ? { status: { in: q.status } } : {},
        q.pathway ? { pathway: q.pathway } : {},
        q.mine ? { reporterId: v.userId } : {},
        keysetWhere(q.cursor),
      ],
    };
    const rows = await this.prisma.emergency.findMany({
      where,
      include: emergencyInclude(v.userId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const p = page(rows, limit);
    return { items: p.items.map((e) => toEmergencyDto(e, v)), nextCursor: p.nextCursor };
  }

  async getOne(v: Viewer, id: string): Promise<EmergencyDto> {
    const e = await this.prisma.emergency.findFirst({
      where: { AND: [{ id }, visibilityWhere(v)] },
      include: emergencyInclude(v.userId),
    });
    if (!e) throw Errors.notFound('Emergency');
    return toEmergencyDto(e, v);
  }

  async updates(v: Viewer, id: string): Promise<EmergencyUpdateDto[]> {
    await this.assertVisible(v, id);
    const rows = await this.prisma.emergencyUpdate.findMany({
      where: { emergencyId: id, communityId: v.communityId },
      include: { author: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toUpdateDto);
  }

  async timeline(v: Viewer, id: string): Promise<EmergencyEventDto[]> {
    await this.assertVisible(v, id);
    const rows = await this.prisma.emergencyEvent.findMany({
      where: { emergencyId: id, communityId: v.communityId },
      include: { actor: { select: { id: true, fullName: true } } },
      orderBy: { seq: 'asc' },
    });
    return rows.map((r) => toEventDto(r, v));
  }

  async assertVisible(v: Viewer, id: string): Promise<void> {
    const found = await this.prisma.emergency.findFirst({ where: { AND: [{ id }, visibilityWhere(v)] }, select: { id: true } });
    if (!found) throw Errors.notFound('Emergency');
  }

  private emitPublic(event: RealtimeEvent, communityId: string, emergencyId: string, status: string, seq: number) {
    this.realtime.emit(event, communityId, { emergencyId, status }, { emergencyId, seq });
  }
}
