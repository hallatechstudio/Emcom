import { Injectable, Logger } from '@nestjs/common';
import type { CommunityMembership } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { PresignedUploadDto } from '@emcom/shared-types';
import { ALLOWED_MEDIA_TYPES, isAdminRole, Limits } from '@emcom/shared-types';
import type { RequestMeta } from '../../common/auth/decorators';
import { Errors } from '../../common/errors/app-error';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { StorageService } from './storage.service';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  async createUpload(
    membership: CommunityMembership,
    contentType: string,
    sizeBytes: number,
  ): Promise<PresignedUploadDto> {
    await this.rateLimit.consume(`media:upload:${membership.userId}`, 30, 3600);
    const kind = ALLOWED_MEDIA_TYPES[contentType as keyof typeof ALLOWED_MEDIA_TYPES];
    if (!kind) throw Errors.badRequest('UNSUPPORTED_MEDIA_TYPE', 'Only JPEG/PNG/HEIC/WebP photos and MP4/MOV videos are allowed');
    const max = kind === 'PHOTO' ? Limits.maxPhotoBytes : Limits.maxVideoBytes;
    if (sizeBytes <= 0 || sizeBytes > max) {
      throw Errors.badRequest('MEDIA_TOO_LARGE', `File must be at most ${Math.round(max / 1024 / 1024)} MB`);
    }
    const id = randomUUID();
    const objectKey = `communities/${membership.communityId}/media/${id}`;
    await this.prisma.emergencyMedia.create({
      data: {
        id,
        communityId: membership.communityId,
        uploaderId: membership.userId,
        objectKey,
        contentType,
        sizeBytes,
      },
    });
    const expiresIn = 600;
    const uploadUrl = await this.storage.presignPut(objectKey, contentType, sizeBytes, expiresIn);
    return {
      mediaId: id,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  /**
   * Checks (outside any DB transaction) which of the caller's pending uploads really exist in
   * storage. Anything unverifiable is skipped — a media problem must never block an emergency report.
   */
  async verifyUploads(mediaIds: string[] | undefined, ctx: { userId: string; communityId: string }): Promise<string[]> {
    if (!mediaIds?.length) return [];
    const candidates = await this.prisma.emergencyMedia.findMany({
      where: { id: { in: mediaIds }, uploaderId: ctx.userId, communityId: ctx.communityId, status: 'PENDING_UPLOAD', emergencyId: null },
    });
    const checks = await Promise.all(candidates.map(async (m) => ({ m, head: await this.storage.head(m.objectKey) })));
    return checks
      .filter(({ m, head }) => {
        const ok = !!head && head.size === m.sizeBytes;
        if (!ok) this.logger.warn({ mediaId: m.id }, 'media missing from storage; skipping attachment');
        return ok;
      })
      .map(({ m }) => m.id);
  }

  /** Inside the report transaction: claim verified media for the new emergency. */
  async attach(tx: Tx, verifiedIds: string[], ctx: { userId: string; communityId: string; emergencyId: string }): Promise<void> {
    if (!verifiedIds.length) return;
    await tx.emergencyMedia.updateMany({
      where: { id: { in: verifiedIds }, uploaderId: ctx.userId, communityId: ctx.communityId, status: 'PENDING_UPLOAD', emergencyId: null },
      data: { status: 'ATTACHED', emergencyId: ctx.emergencyId },
    });
  }

  /** Returns a short-lived download URL only if the caller may see the emergency the media belongs to. */
  async getDownloadUrl(membership: CommunityMembership, mediaId: string, meta: RequestMeta): Promise<{ url: string; expiresAt: string }> {
    const media = await this.prisma.emergencyMedia.findFirst({
      where: { id: mediaId, communityId: membership.communityId, status: 'ATTACHED' },
      include: { emergency: { select: { status: true, reporterId: true } } },
    });
    if (!media?.emergency) throw Errors.notFound('Media');
    const isAdmin = isAdminRole(membership.role);
    const visible =
      isAdmin ||
      media.emergency.reporterId === membership.userId ||
      media.emergency.status === 'ACTIVE' ||
      media.emergency.status === 'RESOLVED';
    if (!visible) throw Errors.notFound('Media');
    await this.audit.record({
      action: AuditAction.MEDIA_ACCESSED,
      entityType: 'media',
      entityId: media.id,
      communityId: membership.communityId,
      actorId: membership.userId,
      meta,
    });
    const expiresIn = 300;
    return {
      url: await this.storage.presignGet(media.objectKey, expiresIn),
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }
}
