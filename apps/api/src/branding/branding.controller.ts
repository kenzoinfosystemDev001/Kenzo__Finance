import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { BrandingService } from './branding.service';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

export class UpdateLoginBrandingDto {
  @ApiPropertyOptional({ nullable: true, description: 'Empty or null hides "Contact Administrator".' })
  @IsOptional()
  @IsEmail({}, { message: 'Support email must be a valid email address' })
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() || null : value))
  supportEmail?: string | null;
}

@ApiTags('Branding')
@Controller('branding')
export class BrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  @Get('login')
  @Public()
  @ApiOperation({ summary: 'Public sign-in page branding (background id, support email)' })
  async getLogin() {
    return this.brandingService.getLoginBranding();
  }

  @Get('login/background')
  @Public()
  @ApiOperation({ summary: 'The configured sign-in background image (public, 404 when none)' })
  async background(@Res() response: Response): Promise<void> {
    const file = await this.brandingService.openLoginBackground();
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.sizeBytes);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Callers version the URL with the document id, so it can be cached.
    response.setHeader('Cache-Control', 'public, max-age=86400');
    file.stream.pipe(response);
  }

  @Post('login/background')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload or replace the sign-in background (PNG/JPEG/WEBP, max 5 MB)' })
  async uploadBackground(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.brandingService.setLoginBackground(file, user);
  }

  @Delete('login/background')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Remove the sign-in background (reverts to the plain navy panel)' })
  async removeBackground(@CurrentUser() user: AuthenticatedUser) {
    return this.brandingService.removeLoginBackground(user);
  }

  @Patch('login')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update the sign-in page support email' })
  async updateLogin(@Body() dto: UpdateLoginBrandingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.brandingService.setSupportEmail(dto.supportEmail, user);
  }
}
