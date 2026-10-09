import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { AuthResultDto, UserDto } from '@emcom/shared-types';
import { Errors } from '../../common/errors/app-error';
import type { RequestMeta } from '../../common/auth/decorators';
import { isUniqueViolation, PrismaService } from '../../common/prisma/prisma.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import type { ChangePasswordDto, LoginDto, RegisterDto, ResetPasswordDto, UpdateProfileDto } from './dto/auth.dto';
import { OtpService } from './otp.service';
import { toUserDto } from './presenters';
import { TokenService } from './token.service';

const ARGON_OPTS: argon2.Options = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };
// Verified against when the email does not exist, so response time does not reveal accounts.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= argon2.hash('emcom-timing-equaliser', ARGON_OPTS));

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
  ) {}

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON_OPTS);
  }

  async register(dto: RegisterDto, meta: RequestMeta): Promise<AuthResultDto> {
    await this.rateLimit.consume(`register:${meta.ip}`, 10, 3600);
    const passwordHash = await AuthService.hashPassword(dto.password);
    let user;
    try {
      user = await this.prisma.user.create({
        data: { fullName: dto.fullName, email: dto.email, phone: dto.phone, passwordHash },
      });
    } catch (err) {
      if (isUniqueViolation(err, 'email')) {
        throw Errors.conflict('EMAIL_TAKEN', 'An account with this email already exists');
      }
      throw err;
    }
    await this.audit.record({
      action: AuditAction.USER_REGISTERED,
      entityType: 'user',
      entityId: user.id,
      actorId: user.id,
      meta,
    });
    await this.sendVerification(user.id, user.email);
    const tokens = await this.tokens.issueForNewSession(user.id, meta.userAgent);
    return { ...tokens, user: toUserDto(user) };
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResultDto> {
    await this.rateLimit.consume(`login:ip:${meta.ip}`, 30, 900);
    await this.rateLimit.consume(`login:email:${dto.email}`, 10, 900);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const ok = await argon2.verify(user?.passwordHash ?? (await getDummyHash()), dto.password).catch(() => false);
    if (!user || !ok) throw Errors.unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
    if (user.status !== 'ACTIVE') throw Errors.unauthorized('Account unavailable', 'ACCOUNT_UNAVAILABLE');
    const tokens = await this.tokens.issueForNewSession(user.id, meta.userAgent);
    return { ...tokens, user: toUserDto(user) };
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthResultDto> {
    await this.rateLimit.consume(`refresh:${meta.ip}`, 120, 900);
    const { userId, tokens } = await this.tokens.rotate(refreshToken, meta.userAgent);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.status !== 'ACTIVE') throw Errors.unauthorized('Account unavailable', 'ACCOUNT_UNAVAILABLE');
    return { ...tokens, user: toUserDto(user) };
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revokeByToken(refreshToken);
  }

  async me(userId: string): Promise<UserDto> {
    return toUserDto(await this.prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: dto.fullName, phone: dto.phone },
    });
    return toUserDto(user);
  }

  async resendVerification(userId: string): Promise<void> {
    await this.rateLimit.consume(`otp:verify:${userId}`, 5, 3600);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return;
    await this.sendVerification(user.id, user.email);
  }

  async verifyEmail(userId: string, code: string, meta: RequestMeta): Promise<UserDto> {
    await this.rateLimit.consume(`otp:check:${userId}`, 10, 900);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return toUserDto(user);
    await this.otp.consume(userId, 'EMAIL_VERIFICATION', code);
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    await this.audit.record({
      action: AuditAction.USER_EMAIL_VERIFIED,
      entityType: 'user',
      entityId: userId,
      actorId: userId,
      meta,
    });
    return toUserDto(updated);
  }

  /** Always succeeds from the caller's perspective so it cannot be used to discover accounts. */
  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    await this.rateLimit.consume(`forgot:ip:${meta.ip}`, 10, 3600);
    await this.rateLimit.consume(`forgot:email:${email}`, 3, 3600);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') return;
    const code = await this.otp.issue(user.id, 'PASSWORD_RESET');
    await this.mail.send({
      to: user.email,
      subject: 'Reset your EMCOM password',
      text: `Your EMCOM password reset code is ${code}. It expires soon. If you did not request this, ignore this email.`,
    });
  }

  async resetPassword(dto: ResetPasswordDto, meta: RequestMeta): Promise<void> {
    await this.rateLimit.consume(`reset:${dto.email}`, 10, 900);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw Errors.badRequest('INVALID_CODE', 'The code is invalid or has expired');
    await this.otp.consume(user.id, 'PASSWORD_RESET', dto.code);
    await this.prisma.user.update({
      where: { id: user.id },
      // A reset code proves control of the mailbox, so it also verifies the email.
      data: { passwordHash: await AuthService.hashPassword(dto.newPassword), emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    });
    await this.tokens.revokeAllForUser(user.id, 'password_reset');
    await this.audit.record({
      action: AuditAction.USER_PASSWORD_RESET,
      entityType: 'user',
      entityId: user.id,
      actorId: user.id,
      meta,
    });
  }

  async changePassword(userId: string, sessionId: string, dto: ChangePasswordDto, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw Errors.badRequest('INVALID_CREDENTIALS', 'Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await AuthService.hashPassword(dto.newPassword) },
    });
    // Sign out every other session.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, NOT: { familyId: sessionId } },
      data: { revokedAt: new Date(), revokedReason: 'password_changed' },
    });
    await this.audit.record({
      action: AuditAction.USER_PASSWORD_CHANGED,
      entityType: 'user',
      entityId: userId,
      actorId: userId,
      meta,
    });
  }

  private async sendVerification(userId: string, email: string): Promise<void> {
    const code = await this.otp.issue(userId, 'EMAIL_VERIFICATION');
    await this.mail.send({
      to: email,
      subject: 'Verify your EMCOM account',
      text: `Your EMCOM verification code is ${code}. It expires soon.`,
    });
  }
}
