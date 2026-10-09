import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AuditLogDto, DashboardOverviewDto, Paginated } from '@emcom/shared-types';
import { CommunityRole } from '../../common/auth/decorators';
import { keysetWhere, page, PageQueryDto } from '../../common/http/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';

class OverviewQueryDto {
  @ApiPropertyOptional({ description: "Start of the viewer's local day (ISO). Defaults to UTC midnight." })
  @IsOptional()
  @IsISO8601()
  since?: string;
}

class AuditQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) action?: string;
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller({ path: 'communities/:communityId/admin', version: '1' })
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  /** PRD §22 overview: members, pending requests, active emergencies, alerts today. */
  @Get('overview')
  @CommunityRole('ADMIN')
  async overview(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Query() q: OverviewQueryDto,
  ): Promise<DashboardOverviewDto> {
    const since = q.since ? new Date(q.since) : new Date(new Date().toISOString().slice(0, 10));
    const [memberCount, pendingRequestCount, activeEmergencyCount, alertsToday, pendingReportCount] = await Promise.all([
      this.prisma.communityMembership.count({ where: { communityId, status: 'APPROVED' } }),
      this.prisma.communityMembership.count({ where: { communityId, status: 'PENDING' } }),
      this.prisma.emergency.count({ where: { communityId, status: 'ACTIVE' } }),
      this.prisma.emergencyAlert.count({ where: { communityId, broadcastAt: { gte: since } } }),
      this.prisma.emergency.count({ where: { communityId, status: 'PENDING' } }),
    ]);
    return { memberCount, pendingRequestCount, activeEmergencyCount, alertsToday, pendingReportCount };
  }

  @Get('audit-logs')
  @CommunityRole('ADMIN')
  async auditLogs(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Query() q: AuditQueryDto,
  ): Promise<Paginated<AuditLogDto>> {
    const limit = q.limit ?? 20;
    const rows = await this.prisma.auditLog.findMany({
      where: { communityId, action: q.action, AND: [keysetWhere(q.cursor)] },
      include: { actor: { select: { id: true, fullName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const p = page(rows, limit);
    return {
      items: p.items.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actor: r.actor,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: p.nextCursor,
    };
  }
}
