import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MembershipRole } from '@prisma/client';
import { roleAtLeast } from '@emcom/shared-types';
import { Errors } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthedRequest } from './auth.types';
import { COMMUNITY_ROLE } from './decorators';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Per-community authorization. Runs after JwtAuthGuard.
 *  - no membership           → 404 (does not reveal that the community exists)
 *  - membership not APPROVED → 403 MEMBERSHIP_NOT_ACTIVE (pending/rejected/suspended/removed/left)
 *  - role below requirement  → 403 INSUFFICIENT_ROLE
 */
@Injectable()
export class CommunityAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const required = this.reflector.getAllAndOverride<MembershipRole | undefined>(COMMUNITY_ROLE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const communityId = req.params.communityId;
    if (!communityId || !UUID.test(communityId)) throw Errors.notFound('Community');
    req.membership = await assertCommunityRole(this.prisma, req.user.id, communityId, required);
    return true;
  }
}

export async function assertCommunityRole(
  prisma: Pick<PrismaService, 'communityMembership'>,
  userId: string,
  communityId: string,
  required: MembershipRole,
) {
  const membership = await prisma.communityMembership.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (!membership) throw Errors.notFound('Community');
  if (membership.status !== 'APPROVED') {
    throw Errors.forbidden('Your membership in this community is not active', 'MEMBERSHIP_NOT_ACTIVE');
  }
  if (!roleAtLeast(membership.role, required)) {
    throw Errors.forbidden('This action requires a higher community role', 'INSUFFICIENT_ROLE');
  }
  return membership;
}
