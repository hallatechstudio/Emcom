import { Body, Controller, Get, HttpCode, Injectable, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { DevicePlatform, PushProviderName } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { DeviceTokenDto } from '@emcom/shared-types';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { Errors } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';

class RegisterDeviceDto {
  @ApiProperty() @IsString() @Length(8, 4096) token: string;
  @ApiProperty({ enum: DevicePlatform }) @IsEnum(DevicePlatform) platform: DevicePlatform;
  @ApiProperty({ enum: PushProviderName }) @IsEnum(PushProviderName) provider: PushProviderName;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) appVersion?: string;
}

class UnregisterDeviceDto {
  @ApiProperty() @IsString() @Length(8, 4096) token: string;
}

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert by token. A token is bound to exactly one user: if the device is now signed in as a
   * different account, ownership moves (the previous user stops receiving pushes on it).
   * Re-registering also clears a previous invalidation (token refresh).
   */
  async register(userId: string, dto: RegisterDeviceDto): Promise<DeviceTokenDto> {
    if (dto.provider === 'MOCK' && env().NODE_ENV === 'production') {
      throw Errors.badRequest('PROVIDER_NOT_ALLOWED', 'Mock push tokens are not accepted in production');
    }
    const t = await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { userId, token: dto.token, platform: dto.platform, provider: dto.provider, appVersion: dto.appVersion },
      update: {
        userId,
        platform: dto.platform,
        provider: dto.provider,
        appVersion: dto.appVersion,
        lastSeenAt: new Date(),
        invalidatedAt: null,
        invalidReason: null,
      },
    });
    return { id: t.id, platform: t.platform, provider: t.provider, lastSeenAt: t.lastSeenAt.toISOString() };
  }

  async unregister(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { token, userId } });
  }

  async list(userId: string): Promise<DeviceTokenDto[]> {
    const rows = await this.prisma.deviceToken.findMany({ where: { userId, invalidatedAt: null }, orderBy: { lastSeenAt: 'desc' } });
    return rows.map((t) => ({ id: t.id, platform: t.platform, provider: t.provider, lastSeenAt: t.lastSeenAt.toISOString() }));
  }
}

@ApiTags('devices')
@ApiBearerAuth()
@Controller({ path: 'devices', version: '1' })
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto): Promise<DeviceTokenDto> {
    return this.devices.register(user.id, dto);
  }

  @Post('unregister')
  @HttpCode(204)
  async unregister(@CurrentUser() user: AuthUser, @Body() dto: UnregisterDeviceDto): Promise<void> {
    await this.devices.unregister(user.id, dto.token);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<DeviceTokenDto[]> {
    return this.devices.list(user.id);
  }
}
