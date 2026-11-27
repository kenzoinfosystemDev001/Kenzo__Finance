import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Put,
  Req,
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
import type { Request, Response } from 'express';
import { BrandingService } from './branding.service';
import { BRAND_LOGO_MAX_BYTES, BrandLogoService, requireLogo, type StoredLogo } from './brand-logo.service';
import { contextOf } from '../vendors/vendor-shared';
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
  constructor(
    private readonly brandingService: BrandingService,
    private readonly brandLogo: BrandLogoService,
  ) {}

  // ---- Company logo ---------------------------------------------------------

  /** Public: the sign-in page shows the logo before anyone is signed in. */
  @Get('logo')
  @Public()
  @ApiOperation({ summary: 'The company logo (public; 404 when the default is in use)' })
  async getLogo(@Req() request: Request, @Res() response: Response): Promise<void> {
    sendLogo(request, response, requireLogo(await this.brandLogo.get()));
  }

  @Put('logo')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: BRAND_LOGO_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Replace the company logo (PNG/JPG/WEBP, max 2 MB)' })
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.brandLogo.upload(file, user, contextOf(request));
  }

  @Delete('logo')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Restore the default company logo' })
  async restoreLogo(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    await this.brandLogo.remove(user, contextOf(request));
  }

  // ---- Sign-in page (public, read-only) -------------------------------------

  @Get('login')
  @Public()
  @ApiOperation({ summary: 'Public sign-in page branding (support email)' })
  async getLogin() {
    return this.brandingService.getLoginBranding();
  }

  @Patch('login')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update the sign-in page support email' })
  async updateLogin(@Body() dto: UpdateLoginBrandingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.brandingService.setSupportEmail(dto.supportEmail, user);
  }
}

/** Serves the logo; revalidated on every use so a replaced logo shows at once. */
function sendLogo(request: Request, response: Response, logo: StoredLogo): void {
  const etag = `"${logo.sha256}"`;
  response.setHeader('Content-Type', logo.mimeType);
  response.setHeader('Cache-Control', 'public, no-cache');
  response.setHeader('ETag', etag);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.headers['if-none-match'] === etag) {
    response.status(304).end();
    return;
  }
  response.status(200).end(logo.data);
}
