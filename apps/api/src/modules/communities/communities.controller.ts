import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CommunityMembership } from '@prisma/client';
import type { CommunityDto, CommunityPreviewDto, MembershipDto, MyCommunityDto } from '@emcom/shared-types';
import type { AuthUser } from '../../common/auth/auth.types';
import {
  CommunityRole,
  CurrentMembership,
  CurrentUser,
  Meta,
  RequestMeta,
  RequireVerifiedEmail,
} from '../../common/auth/decorators';
import { CommunitiesService } from './communities.service';
import {
  CreateCommunityDto,
  JoinCommunityDto,
  PreviewQueryDto,
  SetIdentificationFieldDto,
  UpdateCommunityDto,
} from './dto/community.dto';

@ApiTags('communities')
@ApiBearerAuth()
@Controller({ path: 'communities', version: '1' })
export class CommunitiesController {
  constructor(private readonly communities: CommunitiesService) {}

  @Post()
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Create a community; the creator becomes its Owner' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCommunityDto, @Meta() meta: RequestMeta): Promise<MyCommunityDto> {
    return this.communities.create(user, dto, meta);
  }

  @Get('mine')
  @ApiOperation({ summary: 'All communities the caller belongs to or has requested to join' })
  mine(@CurrentUser() user: AuthUser): Promise<MyCommunityDto[]> {
    return this.communities.mine(user.id);
  }

  @Get('preview')
  @ApiOperation({ summary: 'Preview a community by code before requesting to join (PRD §9 step 2)' })
  preview(@CurrentUser() user: AuthUser, @Query() q: PreviewQueryDto): Promise<CommunityPreviewDto> {
    return this.communities.preview(user.id, q.code);
  }

  @Post('join')
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Request to join with a community code; status becomes PENDING' })
  join(@CurrentUser() user: AuthUser, @Body() dto: JoinCommunityDto, @Meta() meta: RequestMeta): Promise<MembershipDto> {
    return this.communities.join(user, dto, meta);
  }

  @Get(':communityId')
  @CommunityRole('MEMBER')
  get(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @CurrentMembership() membership: CommunityMembership,
  ): Promise<CommunityDto> {
    return this.communities.get(communityId, membership);
  }

  @Patch(':communityId')
  @CommunityRole('ADMIN')
  @ApiOperation({ summary: 'Update settings. Admin: description, WhatsApp link. Owner: also name/type/location.' })
  update(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @CurrentMembership() membership: CommunityMembership,
    @Body() dto: UpdateCommunityDto,
    @Meta() meta: RequestMeta,
  ): Promise<CommunityDto> {
    return this.communities.update(communityId, membership, dto, meta);
  }

  @Put(':communityId/identification-field')
  @CommunityRole('OWNER')
  setIdentificationField(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @CurrentMembership() membership: CommunityMembership,
    @Body() dto: SetIdentificationFieldDto,
    @Meta() meta: RequestMeta,
  ): Promise<CommunityDto> {
    return this.communities.setIdentificationField(communityId, membership, dto, meta);
  }

  @Post(':communityId/invite-code/rotate')
  @HttpCode(200)
  @CommunityRole('OWNER')
  @ApiOperation({ summary: 'Regenerate the community code. Existing members are unaffected.' })
  rotate(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @CurrentMembership() membership: CommunityMembership,
    @Meta() meta: RequestMeta,
  ): Promise<CommunityDto> {
    return this.communities.rotateCode(communityId, membership, meta);
  }
}
