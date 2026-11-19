import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import type { Response } from 'express';
import { VendorDocumentsService } from './vendor-documents.service';
import { UploadVendorDocumentDto, VENDOR_DOCUMENT_KINDS } from './dto/vendor-children.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { sendStoredFile } from '../documents/send-stored-file';
import { ALLOWED_UPLOAD_DESCRIPTION } from '../common/utils/file-validation';

const uuid = () => new ParseUUIDPipe({ version: '4' });

const uploadBody = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary' },
      kind: { type: 'string', enum: [...VENDOR_DOCUMENT_KINDS] },
    },
  },
};

@ApiTags('Vendor documents')
@ApiBearerAuth()
@Controller('vendors/:vendorId/documents')
export class VendorDocumentsController {
  constructor(private readonly vendorDocumentsService: VendorDocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VENDOR_READ, PERMISSIONS.DOCUMENT_READ)
  @ApiOperation({ summary: 'List current documents for a vendor' })
  async list(@Param('vendorId', uuid()) vendorId: string) {
    return this.vendorDocumentsService.list(vendorId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_DOCUMENTS)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadBody)
  @ApiOperation({
    summary: 'Upload a vendor document',
    description: `Allowed: ${ALLOWED_UPLOAD_DESCRIPTION}. The type is verified from the file bytes and the file is stored privately.`,
  })
  async upload(
    @Param('vendorId', uuid()) vendorId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadVendorDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vendorDocumentsService.upload(vendorId, file, dto.kind, user);
  }

  @Post(':documentId/replace')
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_DOCUMENTS)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadBody)
  @ApiOperation({
    summary: 'Replace a vendor document with a new version',
    description: 'The previous file is archived (kept for audit) and linked from the new one.',
  })
  async replace(
    @Param('vendorId', uuid()) vendorId: string,
    @Param('documentId', uuid()) documentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadVendorDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vendorDocumentsService.replace(vendorId, documentId, file, dto.kind, user);
  }

  @Delete(':documentId')
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_DOCUMENTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a vendor document',
    description: 'Soft removal: the metadata and stored file are retained for audit.',
  })
  async remove(
    @Param('vendorId', uuid()) vendorId: string,
    @Param('documentId', uuid()) documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.vendorDocumentsService.remove(vendorId, documentId, user);
  }

  @Get(':documentId/content')
  @RequirePermissions(PERMISSIONS.DOCUMENT_DOWNLOAD)
  @ApiOperation({ summary: 'Download or preview a vendor document' })
  @ApiQuery({ name: 'preview', required: false, type: Boolean })
  async content(
    @Param('vendorId', uuid()) vendorId: string,
    @Param('documentId', uuid()) documentId: string,
    @Query('preview') preview: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.vendorDocumentsService.open(
      vendorId,
      documentId,
      user,
      preview === 'true',
    );
    sendStoredFile(response, file);
  }
}
