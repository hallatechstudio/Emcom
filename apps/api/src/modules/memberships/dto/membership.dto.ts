import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { PageQueryDto } from '../../../common/http/pagination';

export class ListMembersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @ApiPropertyOptional({ enum: MembershipRole })
  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole;

  @ApiPropertyOptional({ description: 'Search name, email, phone or identification value' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export const MembershipActions = ['approve', 'reject', 'suspend', 'reinstate', 'remove'] as const;
export type MembershipAction = (typeof MembershipActions)[number];

export class SetRoleDto {
  @ApiProperty({ enum: ['ADMIN', 'MEMBER'] })
  @IsIn(['ADMIN', 'MEMBER'])
  role: 'ADMIN' | 'MEMBER';
}
