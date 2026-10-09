import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthResultDto, UserDto } from '@emcom/shared-types';
import { CurrentUser, Meta, Public, RequestMeta } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyEmailDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @Meta() meta: RequestMeta): Promise<AuthResultDto> {
    return this.auth.register(dto, meta);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Meta() meta: RequestMeta): Promise<AuthResultDto> {
    return this.auth.login(dto, meta);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Meta() meta: RequestMeta): Promise<AuthResultDto> {
    return this.auth.refresh(dto.refreshToken, meta);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@CurrentUser() user: AuthUser, @Body() dto: VerifyEmailDto, @Meta() meta: RequestMeta): Promise<UserDto> {
    return this.auth.verifyEmail(user.id, dto.code, meta);
  }

  @ApiBearerAuth()
  @Post('resend-verification')
  @HttpCode(202)
  async resend(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.resendVerification(user.id);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  async forgot(@Body() dto: ForgotPasswordDto, @Meta() meta: RequestMeta): Promise<void> {
    await this.auth.forgotPassword(dto.email, meta);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  async reset(@Body() dto: ResetPasswordDto, @Meta() meta: RequestMeta): Promise<void> {
    await this.auth.resetPassword(dto, meta);
  }
}

@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.auth.me(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<UserDto> {
    return this.auth.updateProfile(user.id, dto);
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Meta() meta: RequestMeta) {
    await this.auth.changePassword(user.id, user.sessionId, dto, meta);
  }
}
