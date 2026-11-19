import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { DocumentKind, OcrStatus } from '@prisma/client';
import { OcrService } from './ocr.service';
import { DocumentsService } from '../documents/documents.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

@ApiTags('OCR')
@ApiBearerAuth()
@Controller('ocr')
export class OcrController {
  constructor(
    private readonly ocrService: OcrService,
    private readonly documentsService: DocumentsService,
  ) {}

  @Post('vendor-documents')
  @RequirePermissions(PERMISSIONS.OCR_SUBMIT, PERMISSIONS.DOCUMENT_UPLOAD)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a vendor document and extract a reviewable draft',
    description:
      'Stores the original, runs extraction and returns a draft. No vendor ' +
      'is created here - the user must review the values and confirm by ' +
      'posting to /vendors with the returned ocrJobId.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadAndExtract(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');

    const document = await this.documentsService.upload(
      {
        buffer: file.buffer,
        originalFilename: file.originalname,
        kind: DocumentKind.VENDOR_ONBOARDING,
      },
      user,
    );

    const job = await this.ocrService.submitVendorDocument(document.id, user);

    return {
      ...job,
      // Flat values the review form can bind to directly.
      prefill: this.ocrService.extractPrefillValues(job.normalizedResult),
    };
  }

  @Post('documents/:documentId/extract')
  @RequirePermissions(PERMISSIONS.OCR_SUBMIT)
  @ApiOperation({ summary: 'Re-run extraction for an already stored document' })
  async extractExisting(
    @Param('documentId', new ParseUUIDPipe({ version: '4' })) documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const job = await this.ocrService.submitVendorDocument(documentId, user);
    return {
      ...job,
      prefill: this.ocrService.extractPrefillValues(job.normalizedResult),
    };
  }

  @Get('jobs')
  @RequirePermissions(PERMISSIONS.OCR_READ)
  @ApiOperation({ summary: 'List OCR jobs' })
  @ApiQuery({ name: 'status', required: false, enum: OcrStatus })
  @ApiQuery({ name: 'unconsumedOnly', required: false, type: Boolean })
  async findAll(
    @Query() pagination: PaginationQueryDto,
    @Query('status') status?: OcrStatus,
    @Query('unconsumedOnly') unconsumedOnly?: string,
  ) {
    if (status && !Object.values(OcrStatus).includes(status)) {
      throw new BadRequestException('Unknown OCR status.');
    }

    return this.ocrService.findAll({
      page: pagination.page,
      pageSize: pagination.pageSize,
      skip: pagination.skip,
      take: pagination.take,
      status,
      unconsumedOnly: unconsumedOnly === 'true',
    });
  }

  @Get('jobs/:id')
  @RequirePermissions(PERMISSIONS.OCR_READ)
  @ApiOperation({ summary: 'OCR job with its extracted draft' })
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    const job = await this.ocrService.findOne(id);
    return {
      ...job,
      prefill: this.ocrService.extractPrefillValues(job.normalizedResult),
    };
  }
}
