import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { Limits } from '@emcom/shared-types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class RegisterDto {
  @ApiProperty({ example: 'David Okafor' })
  @Transform(trim)
  @IsString()
  @Length(Limits.fullName.min, Limits.fullName.max)
  fullName: string;

  @ApiProperty({ example: 'david@example.com' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: '+2348012345678', description: 'International format, digits only after +' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value))
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'phone must be a valid phone number' })
  phone: string;

  @ApiProperty({ minLength: Limits.password.min })
  @IsString()
  @MinLength(Limits.password.min)
  @MaxLength(Limits.password.max)
  @Matches(/(?=.*[A-Za-z])(?=.*[0-9])/, { message: 'password must contain letters and numbers' })
  password: string;
}

export class LoginDto {
  @ApiProperty() @Transform(lower) @IsEmail() email: string;
  @ApiProperty() @IsString() @MaxLength(Limits.password.max) password: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() @Length(20, 200) refreshToken: string;
}

export class VerifyEmailDto {
  @ApiProperty({ example: '123456' }) @Matches(/^[0-9]{6}$/) code: string;
}

export class ForgotPasswordDto {
  @ApiProperty() @Transform(lower) @IsEmail() email: string;
}

export class ResetPasswordDto {
  @ApiProperty() @Transform(lower) @IsEmail() email: string;
  @ApiProperty() @Matches(/^[0-9]{6}$/) code: string;

  @ApiProperty()
  @IsString()
  @MinLength(Limits.password.min)
  @MaxLength(Limits.password.max)
  @Matches(/(?=.*[A-Za-z])(?=.*[0-9])/, { message: 'password must contain letters and numbers' })
  newPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @MaxLength(Limits.password.max) currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(Limits.password.min)
  @MaxLength(Limits.password.max)
  @Matches(/(?=.*[A-Za-z])(?=.*[0-9])/, { message: 'password must contain letters and numbers' })
  newPassword: string;
}

export class UpdateProfileDto {
  @ApiProperty({ required: false })
  @Transform(trim)
  @IsString()
  @Length(Limits.fullName.min, Limits.fullName.max)
  fullName?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value))
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'phone must be a valid phone number' })
  phone?: string;
}
