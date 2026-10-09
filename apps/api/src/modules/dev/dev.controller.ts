import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Development only (not mounted when NODE_ENV=production): the "visible mock delivery mechanism".
 * Shows what the MOCK push transport accepted for the CALLER's own devices — no cross-user data.
 */
@ApiTags('dev')
@ApiBearerAuth()
@Controller({ path: 'dev', version: '1' })
export class DevController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('mock-pushes')
  @ApiOperation({ summary: '[dev] Recent mock push deliveries to your devices' })
  async mockPushes(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    const rows = await this.prisma.notificationDelivery.findMany({
      where: { provider: 'MOCK', deviceToken: { userId: user.id } },
      include: { notification: true, deviceToken: { select: { platform: true, token: true } } },
      orderBy: { queuedAt: 'desc' },
      take: Math.min(Number(limit) || 50, 200),
    });
    return rows.map((d) => ({
      deliveryId: d.id,
      status: d.status,
      attempts: d.attempts,
      queuedAt: d.queuedAt,
      acceptedAt: d.acceptedAt,
      lastError: d.lastError,
      device: { platform: d.deviceToken.platform, tokenSuffix: d.deviceToken.token.slice(-6) },
      notification: {
        id: d.notification.id,
        type: d.notification.type,
        priority: d.notification.priority,
        title: d.notification.title,
        body: d.notification.body,
        communityId: d.notification.communityId,
        emergencyId: d.notification.emergencyId,
      },
    }));
  }
}
