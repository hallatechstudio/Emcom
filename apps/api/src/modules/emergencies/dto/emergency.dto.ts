import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { EmergencyCategory, EmergencyPathway, EmergencyStatus } from '@prisma/client';
import { Limits } from '@emcom/shared-types';
import { PageQueryDto } from '../../../common/http/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ReportEmergencyDto {
  @ApiProperty({ enum: EmergencyCategory })
  @IsEnum(EmergencyCategory)
  category: EmergencyCategory;

  @ApiProperty({ example: 'Block B, near the generator house' })
  @Transform(trim)
  @IsString()
  @Length(2, 160)
  location: string;

  @ApiProperty({ example: 'Smoke coming from the generator house' })
  @Transform(trim)
  @IsString()
  @Length(Limits.emergencyDescription.min, Limits.emergencyDescription.max)
  description: string;

  @ApiPropertyOptional({ type: [String], description: 'Media ids from POST /media/uploads' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Limits.maxMediaPerReport)
  @IsUUID('4', { each: true })
  mediaIds?: string[];
}

/** PRD §13: no category or attachment is required. Location is an optional hint only. */
export class TriggerCriticalAlertDto {
  @ApiPropertyOptional({ example: 'Gate 2' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;
}

export class ConfirmEmergencyDto {
  @ApiPropertyOptional({ example: 'Avoid the area and follow community instructions.' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}

export class DismissEmergencyDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(Limits.dismissalReason.max)
  reason?: string;
}

export class PostUpdateDto {
  @ApiProperty({ example: 'Security personnel have arrived at Gate 2. Please remain indoors.' })
  @Transform(trim)
  @IsString()
  @Length(Limits.updateMessage.min, Limits.updateMessage.max)
  message: string;
}

export class ResolveEmergencyDto {
  @ApiProperty({ example: 'Security personnel responded and the situation has been resolved.' })
  @Transform(trim)
  @IsString()
  @Length(Limits.resolutionMessage.min, Limits.resolutionMessage.max)
  resolutionMessage: string;
}

export class ListEmergenciesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: EmergencyStatus, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsEnum(EmergencyStatus, { each: true })
  status?: EmergencyStatus[];

  @ApiPropertyOptional({ enum: EmergencyPathway })
  @IsOptional()
  @IsEnum(EmergencyPathway)
  pathway?: EmergencyPathway;

  @ApiPropertyOptional({ description: "Only the caller's own reports" })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;
}

export class AckRecipientsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['acknowledged', 'not_acknowledged'] })
  @IsOptional()
  @IsIn(['acknowledged', 'not_acknowledged'])
  filter?: 'acknowledged' | 'not_acknowledged';

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @Type(() => Number)
  override limit?: number = 50;
}
