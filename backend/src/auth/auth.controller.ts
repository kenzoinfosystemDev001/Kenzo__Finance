import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService, type RequestContext } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  ResetPasswordWithTokenDto,
} from './dto/auth.dto';
import { PasswordResetService } from './password-reset.service';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Public()
  // Tighter than the global limit: login is the brute-force target.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in and receive access/refresh tokens' })
  async login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(
      dto.email,
      dto.password,
      this.contextOf(request),
    );
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(dto.refreshToken, this.contextOf(request));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Public()
  // Strict: each request can send an email. The throttler keys this route by
  // the submitted address (see AppThrottlerGuard), falling back to the client IP.
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email a password reset link (same answer whether or not the account exists)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: Request) {
    return this.passwordResetService.requestReset(dto.email, this.contextOf(request));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password with an emailed reset token; revokes all sessions' })
  async resetPassword(@Body() dto: ResetPasswordWithTokenDto, @Req() request: Request) {
    return this.passwordResetService.resetPassword(dto.token, dto.newPassword, this.contextOf(request));
  }

  @ApiBearerAuth()
  @RequirePermissions()
  @Get('me')
  @ApiOperation({ summary: 'Current user with roles and effective permissions' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }

  @ApiBearerAuth()
  @RequirePermissions()
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change own password and revoke other sessions' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      this.contextOf(request),
    );
  }

  private contextOf(request: Request): RequestContext {
    return {
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    };
  }
}
