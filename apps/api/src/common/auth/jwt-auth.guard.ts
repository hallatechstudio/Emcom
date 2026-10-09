import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Errors } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload, AuthedRequest } from './auth.types';
import { IS_PUBLIC, REQUIRE_VERIFIED } from './decorators';
import { env } from '../../config/env';

/** Global guard: every route requires a valid access token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value?.startsWith('Bearer ')) throw Errors.unauthorized();

    const payload = await verifyAccessToken(this.jwt, value.slice(7));
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, fullName: true, status: true, emailVerifiedAt: true },
    });
    if (!user || user.status !== 'ACTIVE') throw Errors.unauthorized('Account unavailable', 'ACCOUNT_UNAVAILABLE');

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      emailVerified: !!user.emailVerifiedAt,
      sessionId: payload.sid,
    };

    const requireVerified = this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (requireVerified && env().REQUIRE_EMAIL_VERIFICATION && !req.user.emailVerified) {
      throw Errors.forbidden('Verify your email address to continue', 'EMAIL_NOT_VERIFIED');
    }
    return true;
  }
}

export async function verifyAccessToken(jwt: JwtService, token: string): Promise<AccessTokenPayload> {
  try {
    const payload = await jwt.verifyAsync<AccessTokenPayload>(token, { algorithms: ['HS256'] });
    if (payload.typ !== 'access' || !payload.sub) throw new Error('wrong token type');
    return payload;
  } catch {
    throw Errors.unauthorized('Invalid or expired access token', 'INVALID_TOKEN');
  }
}
