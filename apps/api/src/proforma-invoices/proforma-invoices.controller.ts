import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DocumentKind } from '@prisma/client';
import type { Request, Response } from 'express';
import { ProformaInvoicesService } from './proforma-invoices.service';
import { ProformaPdfService } from './proforma-pdf.service';
import {
  CreateProformaDto,
  EligibleQuotationsQueryDto,
  PROFORMA_UPLOAD_KINDS,
  ProformaSettingsDto,
  ProformaStatusDto,
  QueryProformasDto,
  UpdateProformaDto,
  UploadProformaDocumentDto,
} from './dto/proforma.dto';
import { DocumentsService } from '../documents/documents.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { toCsv } from '../common/utils/csv';
import { sendStoredFile } from '../documents/send-stored-file';
import { contextOf } from '../vendors/vendor-shared';

const uuid = () => new ParseUUIDPipe({ version: '4' });
const fileBody = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary' }, kind: { type: 'string', enum: [...PROFORMA_UPLOAD_KINDS] } },
  },
};
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

@ApiTags('Proforma Invoices')
@ApiBearerAuth()
@Controller('proforma-invoices')
export class ProformaInvoicesController {
  constructor(
    private readonly proformas: ProformaInvoicesService,
    private readonly pdf: ProformaPdfService,
    private readonly documents: DocumentsService,
  ) {}

  // --- Collection routes (before :id) -----------------------------------------

  @Get()
  @RequirePermissions(PERMISSIONS.PROFORMA_READ)
  @ApiOperation({ summary: 'Proforma invoices: server-side search, filters, sorting and pagination' })
  findAll(@Query() query: QueryProformasDto) {
    return this.proformas.findAll(query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.PROFORMA_READ)
  @ApiOperation({ summary: 'Dashboard counts by status (from the database; no payment figures until Payment Management exists)' })
  summary() {
    return this.proformas.summary();
  }

  @Get('assignees')
  @RequirePermissions(PERMISSIONS.PROFORMA_READ)
  @ApiOperation({ summary: 'Active employees a PI can be assigned to' })
  assignees() {
    return this.proformas.assignees();
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.PROFORMA_EXPORT)
  @ApiOperation({ summary: 'Export the filtered PI list as CSV' })
  async export(@Query() query: QueryProformasDto, @Res() response: Response): Promise<void> {
    const rows = await this.proformas.findAllForExport(query);
    const csv = toCsv(
      rows.map((p) => ({
        'PI No.': p.piNumber,
        'PI Date': day(p.piDate),
        'Payment Due': day(p.dueDate),
        Customer: p.customer.name,
        'Customer Code': p.customer.customerCode,
        Quotation: p.quotation.quotationNumber,
        'Quotation Revision': p.quotationRevision.revisionNumber,
        'Assigned To': p.assignedTo?.fullName ?? '',
        Status: p.status,
        Currency: p.currency,
        'Grand Total': p.grandTotal.toFixed(2),
        Advance: p.advanceAmount?.toFixed(2) ?? '',
        Issued: day(p.issuedAt),
        Created: day(p.createdAt),
      })),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="proforma-invoices-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send('﻿' + csv);
  }

  @Get('settings')
  @RequirePermissions() // proforma.read or settings.manage, checked in the service
  @ApiOperation({ summary: 'Bank details, default payment instructions and the PI approval switch' })
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.proformas.getSettingsFor(user);
  }

  @Put('settings')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Set the bank details and default payment instructions printed on PIs' })
  updateSettings(@Body() dto: ProformaSettingsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.proformas.updateSettings(dto, user);
  }

  @Get('eligible-quotations')
  @RequirePermissions(PERMISSIONS.PROFORMA_CREATE)
  @ApiOperation({ summary: 'Accepted quotations whose accepted revision has no live PI' })
  eligible(@Query() query: EligibleQuotationsQueryDto) {
    return this.proformas.eligibleQuotations(query);
  }

  @Get('from-quotation/:quotationId')
  @RequirePermissions(PERMISSIONS.PROFORMA_CREATE)
  @ApiOperation({ summary: 'Pre-fill for a new PI from the accepted revision (creates nothing)' })
  fromQuotation(@Param('quotationId', uuid()) quotationId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.proformas.fromQuotation(quotationId, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROFORMA_CREATE)
  @ApiOperation({
    summary: 'Create a draft PI from the accepted revision of a quotation',
    description: 'Lines and amounts are copied from the accepted revision. A second live PI for the same revision returns 409 with the existing PI.',
  })
  create(@Body() dto: CreateProformaDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.proformas.create(dto, user, contextOf(request));
  }

  // --- Single PI ---------------------------------------------------------------

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PROFORMA_READ)
  @ApiOperation({ summary: 'PI with lines, source quotation, status history and documents' })
  findOne(@Param('id', uuid()) id: string) {
    return this.proformas.findOne(id);
  }

  @Get(':id/activity')
  @RequirePermissions(PERMISSIONS.PROFORMA_READ)
  @ApiOperation({ summary: 'Audit history of the PI' })
  activity(@Param('id', uuid()) id: string, @Query() pagination: PaginationQueryDto) {
    return this.proformas.activity(id, pagination);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PROFORMA_UPDATE)
  @ApiOperation({ summary: 'Edit PI-specific details of a draft (never prices, quantities or totals)' })
  update(@Param('id', uuid()) id: string, @Body() dto: UpdateProformaDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.proformas.update(id, dto, user, contextOf(request));
  }

  @Post(':id/status')
  @RequirePermissions(PERMISSIONS.PROFORMA_READ)
  @ApiOperation({ summary: 'Move the PI through its lifecycle (each step checks its own permission)' })
  changeStatus(@Param('id', uuid()) id: string, @Body() dto: ProformaStatusDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.proformas.changeStatus(id, dto, user, contextOf(request));
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PROFORMA_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a never-issued draft PI (issued PIs can only be cancelled)' })
  async remove(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<void> {
    await this.proformas.remove(id, user, contextOf(request));
  }

  @Get(':id/pdf')
  @RequirePermissions(PERMISSIONS.PROFORMA_DOWNLOAD)
  @ApiOperation({ summary: 'A4 PDF (issued: the stored document; otherwise a DRAFT preview)' })
  async downloadPdf(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Res() response: Response): Promise<void> {
    await this.proformas.assertExists(id);
    sendStoredFile(response, await this.pdf.open(id, user));
  }

  @Get(':id/payment-handoff')
  @RequirePermissions(PERMISSIONS.PROFORMA_READ)
  @ApiOperation({ summary: 'Payment Management (Module 7) integration contract (read-only)' })
  paymentHandoff(@Param('id', uuid()) id: string) {
    return this.proformas.paymentHandoff(id);
  }

  // --- Documents ----------------------------------------------------------------

  @Post(':id/documents')
  @RequirePermissions(PERMISSIONS.PROFORMA_UPDATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({ summary: 'Attach a supporting document (type verified from the bytes)' })
  async upload(@Param('id', uuid()) id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadProformaDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.proformas.assertExists(id, { notCancelled: true });
    return this.documents.upload({ buffer: file.buffer, originalFilename: file.originalname, kind: dto.kind ?? DocumentKind.PROFORMA_ATTACHMENT, proformaInvoiceId: id }, user);
  }

  @Post(':id/documents/:documentId/replace')
  @RequirePermissions(PERMISSIONS.PROFORMA_UPDATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({ summary: 'Replace an attached document (old version archived and linked)' })
  async replace(
    @Param('id', uuid()) id: string,
    @Param('documentId', uuid()) documentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadProformaDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.proformas.assertExists(id, { notCancelled: true });
    const current = await this.ownedUpload(id, documentId);
    return this.documents.upload({ buffer: file.buffer, originalFilename: file.originalname, kind: dto.kind ?? DocumentKind.PROFORMA_ATTACHMENT, proformaInvoiceId: id, replacesDocumentId: current.id }, user);
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions(PERMISSIONS.PROFORMA_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an attached document (soft; the generated PI PDF cannot be removed)' })
  async removeDocument(@Param('id', uuid()) id: string, @Param('documentId', uuid()) documentId: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.proformas.assertExists(id, { notCancelled: true });
    await this.ownedUpload(id, documentId);
    await this.documents.archive(documentId, user);
  }

  @Get(':id/documents/:documentId/content')
  @RequirePermissions(PERMISSIONS.PROFORMA_READ, PERMISSIONS.DOCUMENT_DOWNLOAD)
  @ApiQuery({ name: 'preview', required: false, type: Boolean })
  @ApiOperation({ summary: 'Download or preview a PI document' })
  async content(
    @Param('id', uuid()) id: string,
    @Param('documentId', uuid()) documentId: string,
    @Query('preview') preview: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const document = await this.documents.findActive(documentId);
    if (document.proformaInvoiceId !== id) throw new NotFoundException(`Document ${documentId} was not found`);
    if (document.kind === DocumentKind.PROFORMA_PDF && !user.permissions.includes(PERMISSIONS.PROFORMA_DOWNLOAD)) {
      throw new NotFoundException(`Document ${documentId} was not found`);
    }
    sendStoredFile(response, await this.documents.openForDownload(documentId, user, { preview: preview === 'true' }));
  }

  /** Uploaded (not generated) documents of this PI. */
  private async ownedUpload(piId: string, documentId: string) {
    const document = await this.documents.findActive(documentId);
    if (document.proformaInvoiceId !== piId || !(PROFORMA_UPLOAD_KINDS as readonly string[]).includes(document.kind)) {
      throw new NotFoundException(`Document ${documentId} was not found`);
    }
    return document;
  }
}
