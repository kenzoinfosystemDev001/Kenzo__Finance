import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
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
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
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

    if (kind && !Object.values(DocumentKind).includes(kind)) {
      throw new BadRequestException('Unknown document kind.');
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
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
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
    await this.assertGenericAccess(id);
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
    const document = await this.assertGenericAccess(id);
    if (GENERATED_KINDS.includes(document.kind)) throw new BadRequestException('A generated document cannot be archived.');
    return this.documentsService.archive(id, user);
  }

  /**
   * Documents of customers, enquiries, quotations, proforma invoices and
   * invoices are served only by their module routes, which check that
   * module's permissions; the generic routes must not bypass them.
   */
  private async assertGenericAccess(id: string) {
    const document = await this.documentsService.findActive(id);
    if (document.customerId || document.enquiryId || document.quotationId || document.proformaInvoiceId || document.finalInvoiceId || document.paymentId) {
      throw new NotFoundException(`Document ${id} was not found`);
    }
    return document;
  }
}

const GENERATED_KINDS: DocumentKind[] = [DocumentKind.QUOTATION_PDF, DocumentKind.PROFORMA_PDF, DocumentKind.FINAL_INVOICE_PDF, DocumentKind.PAYMENT_RECEIPT];
