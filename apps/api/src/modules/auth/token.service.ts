import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import type { AuthTokensDto } from '@emcom/shared-types';
import { env } from '../../config/env';
import { Errors } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';

/**
 * Short-lived JWT access tokens + opaque rotating refresh tokens.
 * Refresh tokens are stored as SHA-256 hashes, belong to a "family" (one login session), and are
 * single use. Presenting an already-rotated token is treated as theft: the whole family is revoked.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async issueForNewSession(userId: string, userAgent?: string): Promise<AuthTokensDto> {
    return this.issue(userId, randomUUID(), userAgent);
  }

  async rotate(presented: string, userAgent?: string): Promise<{ userId: string; tokens: AuthTokensDto }> {
    const tokenHash = sha256(presented);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    const invalid = Errors.unauthorized('Session expired. Please log in again.', 'INVALID_REFRESH_TOKEN');
    if (!existing) throw invalid;

    if (existing.revokedAt) {
      if (existing.revokedReason === 'rotated') {
        await this.revokeFamily(existing.familyId, 'reuse_detected');
        await this.audit.record({
          action: AuditAction.REFRESH_TOKEN_REUSE,
          entityType: 'user',
          entityId: existing.userId,
          actorId: existing.userId,
          metadata: { familyId: existing.familyId },
        });
      }
      throw invalid;
    }
    if (existing.expiresAt < new Date()) throw invalid;

    // Claim the token atomically so two concurrent refreshes cannot both succeed.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'rotated' },
    });
    if (claimed.count !== 1) throw invalid;

    const tokens = await this.issue(existing.userId, existing.familyId, userAgent, existing.id);
    return { userId: existing.userId, tokens };
  }

  async revokeByToken(presented: string): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(presented) } });
    if (existing) await this.revokeFamily(existing.familyId, 'logout');
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async issue(userId: string, familyId: string, userAgent?: string, previousId?: string): Promise<AuthTokensDto> {
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const created = await this.prisma.refreshToken.create({
      data: { userId, familyId, tokenHash: sha256(refreshToken), expiresAt, userAgent: userAgent ?? null },
    });
    if (previousId) {
      await this.prisma.refreshToken.update({ where: { id: previousId }, data: { replacedById: created.id } });
    }
    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: familyId, typ: 'access' },
      { expiresIn: env().JWT_ACCESS_TTL_SECONDS, algorithm: 'HS256' },
    );
    return {
      accessToken,
      accessTokenExpiresIn: env().JWT_ACCESS_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    };
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
