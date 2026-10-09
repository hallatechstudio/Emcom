import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import type { NotificationDto, Paginated } from '@emcom/shared-types';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { PageQueryDto } from '../../common/http/pagination';
import { NotificationsService } from './notifications.service';

class InboxQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() communityId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;
}

class ReadAllQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() communityId?: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: InboxQueryDto): Promise<Paginated<NotificationDto>> {
    return this.notifications.list(user.id, q);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser, @Query() q: ReadAllQueryDto) {
    return this.notifications.markAllRead(user.id, q.communityId);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<NotificationDto> {
    return this.notifications.markRead(user.id, id);
  }
}
