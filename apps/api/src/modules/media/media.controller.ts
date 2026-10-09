import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { CommunityMembership } from '@prisma/client';
import { IsInt, IsString, Max, Min } from 'class-validator';
import type { PresignedUploadDto } from '@emcom/shared-types';
import { CommunityRole, CurrentMembership, Meta, RequestMeta } from '../../common/auth/decorators';
import { MediaService } from './media.service';

class CreateUploadDto {
  @ApiProperty({ example: 'image/jpeg' }) @IsString() contentType: string;
  @ApiProperty({ example: 524288 }) @IsInt() @Min(1) @Max(100 * 1024 * 1024) sizeBytes: number;
}

@ApiTags('media')
@ApiBearerAuth()
@Controller({ path: 'communities/:communityId/media', version: '1' })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads')
  @CommunityRole('MEMBER')
  createUpload(
    @Param('communityId', ParseUUIDPipe) _communityId: string,
    @CurrentMembership() membership: CommunityMembership,
    @Body() dto: CreateUploadDto,
  ): Promise<PresignedUploadDto> {
    return this.media.createUpload(membership, dto.contentType, dto.sizeBytes);
  }

  @Get(':mediaId')
  @CommunityRole('MEMBER')
  download(
    @Param('communityId', ParseUUIDPipe) _communityId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentMembership() membership: CommunityMembership,
    @Meta() meta: RequestMeta,
  ) {
    return this.media.getDownloadUrl(membership, mediaId, meta);
  }
}
