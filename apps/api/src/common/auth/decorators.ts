import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '@prisma/client';
import type { AuthedRequest, AuthUser } from './auth.types';

export const IS_PUBLIC = 'emcom:isPublic';
/** Skip the global JWT guard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const COMMUNITY_ROLE = 'emcom:communityRole';
/**
 * Require an APPROVED membership in the community named by the :communityId route param,
 * with at least the given role. Enforced by CommunityAccessGuard on the server, always.
 */
export const CommunityRole = (role: MembershipRole) => SetMetadata(COMMUNITY_ROLE, role);

export const REQUIRE_VERIFIED = 'emcom:requireVerified';
export const RequireVerifiedEmail = () => SetMetadata(REQUIRE_VERIFIED, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});

/** The caller's membership, resolved by CommunityAccessGuard. */
export const CurrentMembership = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().membership!;
});

export interface RequestMeta {
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

export const Meta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  const ua = req.headers['user-agent'];
  return {
    requestId: req.id ? String(req.id) : undefined,
    ip: req.ip,
    userAgent: typeof ua === 'string' ? ua.slice(0, 256) : undefined,
  };
});

/** Reads the Idempotency-Key header (8–100 safe chars) — returns undefined when absent. */
export const IdempotencyKey = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => {
  const raw = ctx.switchToHttp().getRequest<AuthedRequest>().headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  return /^[A-Za-z0-9_\-:.]{8,100}$/.test(value) ? value : 'INVALID';
});
