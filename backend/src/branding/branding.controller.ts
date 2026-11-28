import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  APPEARANCE_KINDS,
  BACKGROUND_MAX_BYTES,
  type AppearanceKind,
  BrandingService,
  isAppearanceKind,
} from './branding.service';
import { pipeStoredFile } from '../documents/send-stored-file';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

function parseKind(value: string): AppearanceKind {
  if (!isAppearanceKind(value)) {
    throw new BadRequestException(`Unknown appearance type. Use one of: ${APPEARANCE_KINDS.join(', ')}.`);
  }
  return value;
}

/** Multer rejects anything over the cap before it is buffered in full. */
const UPLOAD_OPTIONS = { limits: { fileSize: BACKGROUND_MAX_BYTES, files: 1 } };
const FILE_BODY = {
  schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
};

/**
 * Background images for the sign-in page, sidebar and main workspace.
 * Reading: the login image is public, the others need a session. Changing any
 * of them needs settings.manage.
 */
@ApiTags('Branding')
@Controller('branding')
export class BrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  // ---- Sign-in page (public, read-only) -------------------------------------

  @Get('login')
  @Public()
  @ApiOperation({ summary: 'Public sign-in page branding (current background id)' })
  async getLogin() {
    return this.brandingService.getLoginBranding();
  }

  @Get('login/background')
  @Public()
  @ApiOperation({ summary: 'The configured sign-in background image (public, 404 when none)' })
  async background(@Res() response: Response): Promise<void> {
    await this.sendImage('login', response, 'public, max-age=86400');
  }

  @Post('login/background')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @UseInterceptors(FileInterceptor('file', UPLOAD_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiOperation({ summary: 'Upload or replace the sign-in background (PNG/JPEG/WEBP, max 5 MB)' })
  async uploadBackground(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.brandingService.setBackground('login', file, user);
    return this.brandingService.getLoginBranding();
  }

  @Delete('login/background')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Remove the sign-in background (restores the default)' })
  async removeBackground(@CurrentUser() user: AuthenticatedUser) {
    await this.brandingService.removeBackground('login', user);
    return this.brandingService.getLoginBranding();
  }

  // ---- Application appearance (authenticated) --------------------------------

  /** Any signed-in user may read the active images (they are shown to everyone). */
  @Get('appearance')
  @ApiBearerAuth()
  // Empty permission list: any signed-in user. The JWT guard still applies.
  @RequirePermissions()
  @ApiOperation({ summary: 'Active sidebar, workspace and login background images' })
  async getAppearance() {
    return this.brandingService.getAppearance();
  }

  @Get('appearance/:kind/image')
  @ApiBearerAuth()
  @RequirePermissions()
  @ApiOperation({ summary: 'The active background image of a kind (signed-in users)' })
  async appearanceImage(@Param('kind') kind: string, @Res() response: Response): Promise<void> {
    await this.sendImage(parseKind(kind), response, 'private, max-age=86400');
  }

  @Post('appearance/:kind')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @UseInterceptors(FileInterceptor('file', UPLOAD_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiOperation({ summary: 'Set the sidebar, workspace or login background (PNG/JPEG/WEBP, max 5 MB)' })
  async setAppearance(
    @Param('kind') kind: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.brandingService.setBackground(parseKind(kind), file, user);
  }

  @Delete('appearance/:kind')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Remove the background of a kind (restores the default)' })
  async restoreAppearance(@Param('kind') kind: string, @CurrentUser() user: AuthenticatedUser) {
    return this.brandingService.removeBackground(parseKind(kind), user);
  }

  private async sendImage(kind: AppearanceKind, response: Response, cacheControl: string): Promise<void> {
    const file = await this.brandingService.openBackground(kind);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.sizeBytes);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Callers version the URL with the document id, so a replaced image never
    // comes from cache.
    response.setHeader('Cache-Control', cacheControl);
    pipeStoredFile(file.stream, response, 'appearance background');
  }
}
