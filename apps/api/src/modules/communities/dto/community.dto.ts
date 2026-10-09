import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidateIf,
} from 'class-validator';
import { CommunityType } from '@prisma/client';
import { isValidWhatsAppGroupUrl, Limits } from '@emcom/shared-types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

@ValidatorConstraint({ name: 'whatsappUrl' })
class WhatsAppUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && value.length <= 200 && isValidWhatsAppGroupUrl(value);
  }
  defaultMessage(): string {
    return 'whatsappUrl must be an https://chat.whatsapp.com/<invite> group link';
  }
}

export class IdentificationFieldDto {
  @ApiProperty({ example: 'Block / Apartment' })
  @Transform(trim)
  @IsString()
  @Length(Limits.identificationLabel.min, Limits.identificationLabel.max)
  label: string;

  @ApiProperty()
  @IsBoolean()
  required: boolean;
}

export class CreateCommunityDto {
  @ApiProperty({ example: 'Jacob Mews' })
  @Transform(trim)
  @IsString()
  @Length(Limits.communityName.min, Limits.communityName.max)
  name: string;

  @ApiProperty({ enum: CommunityType })
  @IsEnum(CommunityType)
  type: CommunityType;

  @ApiProperty({ example: 'Lagos, Nigeria' })
  @Transform(trim)
  @IsString()
  @Length(Limits.location.min, Limits.location.max)
  location: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(Limits.description.max)
  description?: string;

  @ApiPropertyOptional({ type: IdentificationFieldDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IdentificationFieldDto)
  identificationField?: IdentificationFieldDto;

  @ApiPropertyOptional({ example: 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOp' })
  @Transform(trim)
  @IsOptional()
  @Validate(WhatsAppUrlConstraint)
  whatsappUrl?: string;
}

/** Owner may change everything; admins may change description and WhatsApp link only. */
export class UpdateCommunityDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(Limits.communityName.min, Limits.communityName.max)
  name?: string;

  @ApiPropertyOptional({ enum: CommunityType })
  @IsOptional()
  @IsEnum(CommunityType)
  type?: CommunityType;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(Limits.location.min, Limits.location.max)
  location?: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(Limits.description.max)
  description?: string;

  @ApiPropertyOptional({ nullable: true, description: 'null clears the link' })
  @Transform(trim)
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Validate(WhatsAppUrlConstraint)
  whatsappUrl?: string | null;
}

export class SetIdentificationFieldDto {
  @ApiPropertyOptional({ type: IdentificationFieldDto, nullable: true, description: 'null removes the field' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => IdentificationFieldDto)
  field: IdentificationFieldDto | null;
}

export class JoinCommunityDto {
  @ApiProperty({ example: 'JACOB7KQ2M' })
  @IsString()
  @Length(4, 20)
  code: string;

  @ApiPropertyOptional({ example: 'B12' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(Limits.identificationValue.max)
  identificationValue?: string;
}

export class PreviewQueryDto {
  @ApiProperty()
  @IsString()
  @Length(4, 20)
  code: string;
}
