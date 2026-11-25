import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { contextOf } from '../vendors/vendor-shared';
import { PROFILE_PHOTO_MAX_BYTES, ProfilePhotoService, type StoredPhoto } from './profile-photo.service';

const uuid = () => new ParseUUIDPipe({ version: '4' });

/**
 * Serves a stored photo with headers that keep it correct after a replacement:
 * `private` (never a shared cache), `no-cache` (revalidate every time), and an
 * ETag from the content hash, so unchanged photos answer 304 with no body.
 */
function sendPhoto(request: Request, response: Response, photo: StoredPhoto): void {
  const etag = `"${photo.sha256}"`;
  response.setHeader('Content-Type', photo.mimeType);
  response.setHeader('Content-Length', String(photo.data.length));
  response.setHeader('Cache-Control', 'private, no-cache');
  response.setHeader('ETag', etag);
  response.setHeader('X-Content-Type-Options', 'nosniff');

  if (request.headers['if-none-match'] === etag) {
    response.status(304).end();
    return;
  }
  response.status(200).end(photo.data);
}

@ApiTags('Profile photo')
@ApiBearerAuth()
@Controller()
export class ProfilePhotoController {
  constructor(private readonly photos: ProfilePhotoService) {}

  // ---- Own photo (any signed-in user) ---------------------------------------

  @Get('account/photo')
  @RequirePermissions()
  @ApiOperation({ summary: 'Your profile photo (404 when none is set)' })
  async getOwn(@CurrentUser() user: AuthenticatedUser, @Req() req: Request, @Res() res: Response): Promise<void> {
    sendPhoto(req, res, await this.photos.read(user.id, user));
  }

  @Put('account/photo')
  @RequirePermissions()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PROFILE_PHOTO_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload or replace your profile photo (JPG/PNG/WEBP, max 2 MB)' })
  async uploadOwn(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.photos.upload(user.id, file, user, contextOf(req));
  }

  @Delete('account/photo')
  @RequirePermissions()
  @ApiOperation({ summary: 'Remove your profile photo and go back to initials' })
  async removeOwn(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.photos.remove(user.id, user, contextOf(req));
  }

  // ---- Another user's photo (own view, or an administrator) -----------------

  @Get('users/:id/photo')
  @RequirePermissions()
  @ApiOperation({ summary: "A user's profile photo. Requires user.read unless it is your own." })
  async getFor(
    @Param('id', uuid()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    sendPhoto(req, res, await this.photos.read(id, user));
  }

  @Put('users/:id/photo')
  @RequirePermissions()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PROFILE_PHOTO_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: "Set another user's profile photo (requires user.update)" })
  async uploadFor(
    @Param('id', uuid()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.photos.upload(id, file, user, contextOf(req));
  }

  @Delete('users/:id/photo')
  @RequirePermissions()
  @ApiOperation({ summary: "Remove another user's profile photo (requires user.update)" })
  async removeFor(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.photos.remove(id, user, contextOf(req));
  }
}
