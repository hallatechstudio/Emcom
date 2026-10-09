import { Injectable } from '@nestjs/common';
import type { OtpPurpose } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';
import { Errors } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';

const MAX_ATTEMPTS = 5;

/** Six-digit one-time codes, stored as HMACs, single use, attempt-limited. */
@Injectable()
export class OtpService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(userId: string, purpose: OtpPurpose): Promise<string> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction([
      // Only the newest code is valid.
      this.prisma.otpCode.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.otpCode.create({
        data: {
          userId,
          purpose,
          codeHash: hash(code),
          expiresAt: new Date(Date.now() + env().OTP_TTL_MINUTES * 60_000),
        },
      }),
    ]);
    return code;
  }

  async consume(userId: string, purpose: OtpPurpose, code: string): Promise<void> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { userId, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const invalid = Errors.badRequest('INVALID_CODE', 'The code is invalid or has expired');
    if (!otp || otp.expiresAt < new Date() || otp.attempts >= MAX_ATTEMPTS) throw invalid;

    const ok = safeEqual(otp.codeHash, hash(code));
    if (!ok) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw invalid;
    }
    const claimed = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalid;
  }
}

function hash(code: string): string {
  return createHmac('sha256', env().JWT_ACCESS_SECRET).update(code).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
