import {
  BadRequestException,
  ForbiddenException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { DocumentKind } from '@prisma/client';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';
import { sendStoredFile } from './send-stored-file';
import { isUUID } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS, ROLE_CODES } from '../common/authz/permissions';
import { VENDOR_DOCUMENT_KINDS } from '../vendors/dto/vendor-children.dto';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPLOAD)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a document',
    description:
      'The file type is verified from its actual bytes. The stored name and ' +
      'path are generated server-side.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: Object.values(DocumentKind) },
        vendorId: { type: 'string', format: 'uuid' },
      },
    },
  })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('kind') kind: DocumentKind | undefined,
    @Body('vendorId') vendorId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');

    // This endpoint files vendor documents (or unattached vendor-onboarding
    // uploads). Other kinds belong to their own module's upload endpoint,
    // which checks that module's permissions.
    if (kind && !(VENDOR_DOCUMENT_KINDS as readonly DocumentKind[]).includes(kind)) {
      throw new BadRequestException('Unknown or unsupported document kind for this endpoint.');
    }
    if (vendorId) {
      if (!isUUID(vendorId)) throw new BadRequestException('vendorId must be a UUID.');
      const isSuperAdmin = user.roles.includes(ROLE_CODES.SUPER_ADMIN);
      if (!isSuperAdmin && !user.permissions.includes(PERMISSIONS.VENDOR_MANAGE_DOCUMENTS)) {
        throw new ForbiddenException('Attaching documents to a vendor needs the vendor.manage_documents permission.');
      }
    }

    return this.documentsService.upload(
      {
        buffer: file.buffer,
        originalFilename: file.originalname,
        kind,
        vendorId: vendorId || undefined,
      },
      user,
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  @ApiOperation({ summary: 'Document metadata' })
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.documentsService.assertGenericAccess(id, user, 'read');
    return this.documentsService.findOne(id);
  }

  @Get(':id/download')
  @RequirePermissions(PERMISSIONS.DOCUMENT_DOWNLOAD)
  @ApiOperation({
    summary: 'Download (or preview) the stored file',
    description:
      'preview=true serves PDF and raster images inline for an in-browser ' +
      'preview. Every other type is always sent as an attachment.',
  })
  @ApiQuery({ name: 'preview', required: false, type: Boolean })
  async download(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('preview') preview: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    await this.documentsService.assertGenericAccess(id, user, 'read');
    const file = await this.documentsService.openForDownload(id, user, {
      preview: preview === 'true',
    });
    sendStoredFile(response, file);
  }

  @Post(':id/archive')
  @RequirePermissions(PERMISSIONS.DOCUMENT_ARCHIVE)
  @ApiOperation({ summary: 'Archive a document' })
  async archive(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.documentsService.assertGenericAccess(id, user, 'archive');
    return this.documentsService.archive(id, user);
  }
}
