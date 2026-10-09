import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { CommunityMembership } from '@prisma/client';
import type { MemberListItemDto, MembershipDto, Paginated } from '@emcom/shared-types';
import type { AuthUser } from '../../common/auth/auth.types';
import { CommunityRole, CurrentMembership, CurrentUser, Meta, RequestMeta } from '../../common/auth/decorators';
import { Errors } from '../../common/errors/app-error';
import { ListMembersQueryDto, MembershipAction, MembershipActions, SetRoleDto } from './dto/membership.dto';
import { MembershipsService } from './memberships.service';

@ApiTags('memberships')
@ApiBearerAuth()
@Controller({ path: 'communities/:communityId', version: '1' })
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get('membership')
  @ApiOperation({ summary: "Caller's own membership in any status (pending/rejected/...)" })
  mine(@Param('communityId', ParseUUIDPipe) communityId: string, @CurrentUser() user: AuthUser): Promise<MembershipDto> {
    return this.memberships.mine(communityId, user.id);
  }

  @Post('leave')
  @HttpCode(200)
  @ApiOperation({ summary: 'Leave the community or withdraw a pending join request' })
  leave(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @CurrentUser() user: AuthUser,
    @Meta() meta: RequestMeta,
  ): Promise<MembershipDto> {
    return this.memberships.leave(communityId, user.id, meta);
  }

  @Get('members')
  @CommunityRole('ADMIN')
  list(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Query() q: ListMembersQueryDto,
  ): Promise<Paginated<MemberListItemDto>> {
    return this.memberships.list(communityId, q);
  }

  // Declared before the generic ':action' route so 'role' is not captured as an action.
  @Post('members/:membershipId/role')
  @HttpCode(200)
  @CommunityRole('OWNER')
  @ApiOperation({ summary: 'Owner: add or remove an Admin' })
  setRole(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: SetRoleDto,
    @CurrentMembership() actor: CommunityMembership,
    @Meta() meta: RequestMeta,
  ): Promise<MemberListItemDto> {
    return this.memberships.setRole(communityId, actor, membershipId, dto.role, meta);
  }

  @Post('members/:membershipId/:action')
  @HttpCode(200)
  @CommunityRole('ADMIN')
  @ApiParam({ name: 'action', enum: MembershipActions })
  @ApiOperation({ summary: 'approve | reject | suspend | reinstate | remove' })
  act(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Param('action') action: string,
    @CurrentMembership() actor: CommunityMembership,
    @Meta() meta: RequestMeta,
  ): Promise<MemberListItemDto> {
    if (!(MembershipActions as readonly string[]).includes(action)) throw Errors.notFound('Action');
    return this.memberships.act(communityId, actor, membershipId, action as MembershipAction, meta);
  }
}
