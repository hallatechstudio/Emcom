import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CommunityMembership } from '@prisma/client';
import type {
  AckRecipientDto,
  AckSummaryDto,
  CriticalAlertResultDto,
  EmergencyDto,
  EmergencyEventDto,
  EmergencyUpdateDto,
  Paginated,
  ReminderResultDto,
} from '@emcom/shared-types';
import { CommunityRole, CurrentMembership, IdempotencyKey, Meta, RequestMeta } from '../../common/auth/decorators';
import { AcknowledgmentsService } from './acknowledgments.service';
import { CriticalAlertsService } from './critical-alerts.service';
import {
  AckRecipientsQueryDto,
  ConfirmEmergencyDto,
  DismissEmergencyDto,
  ListEmergenciesQueryDto,
  PostUpdateDto,
  ReportEmergencyDto,
  ResolveEmergencyDto,
  TriggerCriticalAlertDto,
} from './dto/emergency.dto';
import { EmergenciesService, viewerOf } from './emergencies.service';

const idemHeader = ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description: 'Client-generated unique key; retries with the same key return the original result',
});

@ApiTags('emergencies')
@ApiBearerAuth()
@Controller({ path: 'communities/:communityId', version: '1' })
export class EmergenciesController {
  constructor(
    private readonly emergencies: EmergenciesService,
    private readonly critical: CriticalAlertsService,
    private readonly acks: AcknowledgmentsService,
  ) {}

  // ---- member commands

  @Post('emergencies')
  @CommunityRole('MEMBER')
  @idemHeader
  @ApiOperation({ summary: 'Report an emergency (PRD §11). Becomes PENDING until an admin confirms.' })
  report(
    @Param('communityId', ParseUUIDPipe) _c: string,
    @CurrentMembership() m: CommunityMembership,
    @Body() dto: ReportEmergencyDto,
    @IdempotencyKey() key: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<EmergencyDto> {
    return this.emergencies.report(m, dto, key, meta);
  }

  @Post('critical-alerts')
  @CommunityRole('MEMBER')
  @idemHeader
  @ApiOperation({
    summary: 'Send a Critical Alert (PRD §13). No category, no admin approval. Call only after the user confirmed.',
  })
  trigger(
    @Param('communityId', ParseUUIDPipe) _c: string,
    @CurrentMembership() m: CommunityMembership,
    @Body() dto: TriggerCriticalAlertDto,
    @IdempotencyKey() key: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<CriticalAlertResultDto> {
    return this.critical.trigger(m, dto, key, meta);
  }

  @Post('emergencies/:emergencyId/acknowledge')
  @HttpCode(200)
  @CommunityRole('MEMBER')
  @ApiOperation({ summary: 'Acknowledge a broadcast alert. Idempotent: once per member.' })
  acknowledge(
    @Param('communityId', ParseUUIDPipe) _c: string,
    @Param('emergencyId', ParseUUIDPipe) id: string,
    @CurrentMembership() m: CommunityMembership,
  ) {
    return this.acks.acknowledge(m, id);
  }

  // ---- reads

  @Get('emergencies')
  @CommunityRole('MEMBER')
  list(
    @Param('communityId', ParseUUIDPipe) _c: string,
    @CurrentMembership() m: CommunityMembership,
    @Query() q: ListEmergenciesQueryDto,
  ): Promise<Paginated<EmergencyDto>> {
    return this.emergencies.list(viewerOf(m), q);
  }

  @Get('emergencies/:emergencyId')
  @CommunityRole('MEMBER')
  get(
    @Param('communityId', ParseUUIDPipe) _c: string,
    @Param('emergencyId', ParseUUIDPipe) id: string,
    @CurrentMembership() m: CommunityMembership,
  ): Promise<EmergencyDto> {
    return this.emergencies.getOne(viewerOf(m), id);
  }

  @Get('emergencies/:emergencyId/updates')
  @CommunityRole('MEMBER')
  updates(
    @Param('communityId', ParseUUIDPipe) _c: string,
    @Param('emergencyId', ParseUUIDPipe) id: string,
    @CurrentMembership() m: CommunityMembership,
  ): Promise<EmergencyUpdateDto[]> {
    return this.emergencies.updates(viewerOf(m), id);
  }

  @Get('emergencies/:emergencyId/timeline')
  @CommunityRole('MEMBER')
  timeline(
    @Param('communityId', ParseUUIDPipe) _c: string,
    @Param('emergencyId', ParseUUIDPipe) id: string,
    @CurrentMembership() m: CommunityMembership,
  ): Promise<EmergencyEventDto[]> {
    return this.emergencies.timeline(viewerOf(m), id);
  }

  // ---- admin commands (state transitions are commands, never a free-form status PATCH)

  @Post('emergencies/:emergencyId/confirm')
  @HttpCode(200)
  @CommunityRole('ADMIN')
  @ApiOperation({ summary: 'CONFIRM & BROADCAST a pending report (PENDING → ACTIVE)' })
  confirm(
    @Param('communityId', ParseUUIDPipe) _c: string,
    @Param('emergencyId', ParseUUIDPipe) id: string,
    @CurrentMembership() m: CommunityMembership,
    @Body() dto: ConfirmEmergencyDto,
    @Meta() meta: RequestMeta,
  ): Promise<EmergencyDto> {
    return this.emergencies.confirm(m, id, dto, meta);
  }

  @Post('emergencies/:emergencyId/dismiss')
  @HttpCode(200)
  @CommunityRole('ADMIN')
  @ApiOperation({ summary: 'DISMISS a pending report (PENDING → DISMISSED). Stays in admin history.' })
  dismiss(
    @Param('communityId', ParseUUIDPipe) _c: string,
    @Param('emergencyId', ParseUUIDPipe) id: string,
    @CurrentMembership() m: CommunityMembership,
    @Body() dto: DismissEmergencyDto,
    @Meta() meta: RequestMeta,
  ): Promise<EmergencyDto> {
    return this.emergencies.dismiss(m, id, dto, meta);
  }

  @Post('emergencies/:emergencyId/updates')
  @CommunityRole('ADMIN')
  @idemHeader
  postUpdate(
    @Param('communityId', ParseUUIDPipe) _c: string,
    @Param('emergencyId', ParseUUIDPipe) id: string,
    @CurrentMembership() m: CommunityMembership,
    @Body() dto: PostUpdateDto,
    @IdempotencyKey() key: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<EmergencyUpdateDto> {
    return this.emergencies.postUpdate(m, id, dto, key, meta);
  }

  @Post('emergencies/:emergencyId/resolve')
  @HttpCode(200)
  @CommunityRole('ADMIN')
  @ApiOperation({ summary: 'RESOLVE with a required resolution message (ACTIVE → RESOLVED)' })
  resolve(
    @Param('communityId', ParseUUIDPipe) _c: string,
    @Param('emergencyId', ParseUUIDPipe) id: string,
    @CurrentMembership() m: CommunityMembership,
    @Body() dto: ResolveEmergencyDto,
    @Meta() meta: RequestMeta,
  ): Promise<EmergencyDto> {
    return this.emergencies.resolve(m, id, dto, meta);
  }

  @Post('emergencies/:emergencyId/remind')
  @HttpCode(200)
  @CommunityRole('ADMIN')
  @ApiOperation({ summary: 'Re-notify approved recipients who have not acknowledged (max once per 2 minutes)' })
  remind(
    @Param('communityId', ParseUUIDPipe) _c: string,
    @Param('emergencyId', ParseUUIDPipe) id: string,
    @CurrentMembership() m: CommunityMembership,
    @Meta() meta: RequestMeta,
  ): Promise<ReminderResultDto> {
    return this.emergencies.remind(m, id, meta);
  }

  @Get('emergencies/:emergencyId/acknowledgments')
  @CommunityRole('ADMIN')
  ackSummary(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('emergencyId', ParseUUIDPipe) id: string,
  ): Promise<AckSummaryDto> {
    return this.acks.summary(communityId, id);
  }

  @Get('emergencies/:emergencyId/acknowledgments/recipients')
  @CommunityRole('ADMIN')
  ackRecipients(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('emergencyId', ParseUUIDPipe) id: string,
    @Query() q: AckRecipientsQueryDto,
  ): Promise<Paginated<AckRecipientDto>> {
    return this.acks.recipients(communityId, id, q);
  }
}
