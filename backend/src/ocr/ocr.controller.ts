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
  ApiTags,
} from '@nestjs/swagger';
import { DocumentKind, OcrStatus } from '@prisma/client';
import { OcrService } from './ocr.service';
import {
  UploadVendorDocumentDto,
  VENDOR_DOCUMENT_KINDS,
} from '../vendors/dto/vendor-children.dto';
import { DocumentsService } from '../documents/documents.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

/**
 * The whole query string is validated against one DTO (forbidNonWhitelisted),
 * so the filters must be declared here - separate @Query('status') params
 * were rejected as "property status should not exist".
 */
class OcrJobsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OcrStatus })
  @IsOptional()
  @IsEnum(OcrStatus, { message: 'Unknown OCR status.' })
  status?: OcrStatus;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unconsumedOnly?: boolean;
}
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
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: [...VENDOR_DOCUMENT_KINDS] },
      },
    },
  })
  async uploadAndExtract(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadVendorDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');

    const document = await this.documentsService.upload(
      {
        buffer: file.buffer,
        originalFilename: file.originalname,
        // What the source is (visiting card, GST certificate...) is kept so
        // it lands in the right place on the vendor's document list.
        kind: dto.kind ?? DocumentKind.VENDOR_ONBOARDING,
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

  @Get('status')
  @RequirePermissions(PERMISSIONS.OCR_READ)
  @ApiOperation({ summary: 'Which OCR engine is active and whether it reads scanned files' })
  status() {
    return this.ocrService.status();
  }

  @Get('jobs')
  @RequirePermissions(PERMISSIONS.OCR_READ)
  @ApiOperation({ summary: 'List OCR jobs' })
  async findAll(@Query() query: OcrJobsQueryDto) {
    return this.ocrService.findAll({
      page: query.page,
      pageSize: query.pageSize,
      skip: query.skip,
      take: query.take,
      status: query.status,
      unconsumedOnly: query.unconsumedOnly === true,
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
