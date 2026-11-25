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
import { FinalInvoicesService } from './final-invoices.service';
import { FinalInvoicePdfService } from './final-invoice-pdf.service';
import {
  CreateFinalInvoiceDto,
  EligibleProformasQueryDto,
  FINAL_INVOICE_UPLOAD_KINDS,
  FinalInvoiceStatusDto,
  InvoiceNumberingDto,
  QueryFinalInvoicesDto,
  ReportQueryDto,
  UpdateFinalInvoiceDto,
  UploadFinalInvoiceDocumentDto,
} from './dto/final-invoice.dto';
import { UpdateInvoiceDueDateDto } from './dto/final-invoice.dto';
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
    properties: { file: { type: 'string', format: 'binary' }, kind: { type: 'string', enum: [...FINAL_INVOICE_UPLOAD_KINDS] } },
  },
};
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

@ApiTags('Final Invoices')
@ApiBearerAuth()
@Controller('final-invoices')
export class FinalInvoicesController {
  constructor(
    private readonly invoices: FinalInvoicesService,
    private readonly pdf: FinalInvoicePdfService,
    private readonly documents: DocumentsService,
  ) {}

  // --- Collection routes (before :id) -----------------------------------------

  @Get()
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'Final invoices: server-side search, filters, sorting and pagination' })
  findAll(@Query() query: QueryFinalInvoicesDto) {
    return this.invoices.findAll(query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'Dashboard figures from the database (no payment figures until Payment Management exists)' })
  summary() {
    return this.invoices.summary();
  }

  @Get('reports')
  @RequirePermissions(PERMISSIONS.INVOICE_REPORTS)
  @ApiOperation({ summary: 'Issued-invoice register by month and customer, tax summary and past-due list' })
  reports(@Query() query: ReportQueryDto) {
    return this.invoices.reports(query);
  }

  @Get('assignees')
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'Active employees an invoice can be assigned to' })
  assignees() {
    return this.invoices.assignees();
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.INVOICE_EXPORT)
  @ApiOperation({ summary: 'Export the filtered invoice register as CSV' })
  async export(@Query() query: QueryFinalInvoicesDto, @Res() response: Response): Promise<void> {
    const rows = await this.invoices.findAllForExport(query);
    const csv = toCsv(
      rows.map((r) => ({
        'Invoice No.': r.invoiceNumber ?? '(draft)',
        'Invoice Date': day(r.invoiceDate),
        'Due Date': day(r.dueDate),
        Overdue: r.pastDue ? 'Yes' : '',
        Customer: r.customer.name,
        'Customer Code': r.customer.customerCode,
        'PO No.': r.purchaseOrderNumber ?? '',
        'Proforma Invoice': r.proformaInvoice.piNumber,
        Quotation: r.quotation.quotationNumber,
        'Assigned To': r.assignedTo?.fullName ?? '',
        Status: r.status,
        Currency: r.currency,
        'Tax Total': r.taxTotal.toFixed(2),
        'Grand Total': r.grandTotal.toFixed(2),
        'Received (verified)': r.amountReceived.toFixed(2),
        Outstanding: r.outstanding,
        'Payment Status': r.paymentState,
        Issued: day(r.issuedAt),
      })),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="invoices-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send('﻿' + csv);
  }

  @Get('settings')
  @RequirePermissions() // invoice.read or settings.manage, checked in the service
  @ApiOperation({ summary: 'Approval switch and invoice numbering (with the next number preview)' })
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.invoices.getSettingsFor(user);
  }

  @Put('settings/numbering')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Set the invoice number prefix, padding and financial-year series' })
  updateNumbering(@Body() dto: InvoiceNumberingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.updateNumbering(dto, user);
  }

  @Get('eligible-proformas')
  @RequirePermissions(PERMISSIONS.INVOICE_CREATE)
  @ApiOperation({ summary: 'Issued proforma invoices without a live final invoice' })
  eligible(@Query() query: EligibleProformasQueryDto) {
    return this.invoices.eligibleProformas(query);
  }

  @Get('from-proforma/:proformaInvoiceId')
  @RequirePermissions(PERMISSIONS.INVOICE_CREATE)
  @ApiOperation({ summary: 'Pre-fill for a new invoice from an issued PI (creates nothing)' })
  fromProforma(@Param('proformaInvoiceId', uuid()) proformaInvoiceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.fromProforma(proformaInvoiceId, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INVOICE_CREATE)
  @ApiOperation({
    summary: 'Create a draft final invoice from an issued proforma invoice',
    description: 'Lines and amounts are copied from the PI. A second live invoice for the same PI returns 409 with the existing invoice. The number is allocated at issue.',
  })
  create(@Body() dto: CreateFinalInvoiceDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.invoices.create(dto, user, contextOf(request));
  }

  // --- Single invoice -------------------------------------------------------------

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'Invoice with lines, PI / quotation references, status history and documents' })
  findOne(@Param('id', uuid()) id: string) {
    return this.invoices.findOne(id);
  }

  @Get(':id/activity')
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'Audit history of the invoice' })
  activity(@Param('id', uuid()) id: string, @Query() pagination: PaginationQueryDto) {
    return this.invoices.activity(id, pagination);
  }

  @Patch(':id/due-date')
  @RequirePermissions(PERMISSIONS.INVOICE_UPDATE)
  @ApiOperation({ summary: 'Change the payment due date of an issued invoice (payment alerts recalculate)' })
  updateDueDate(@Param('id', uuid()) id: string, @Body() dto: UpdateInvoiceDueDateDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.invoices.updateDueDate(id, dto, user, contextOf(request));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.INVOICE_UPDATE)
  @ApiOperation({ summary: 'Edit invoice-specific details of a draft (never prices, quantities or totals)' })
  update(@Param('id', uuid()) id: string, @Body() dto: UpdateFinalInvoiceDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.invoices.update(id, dto, user, contextOf(request));
  }

  @Post(':id/status')
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'Move the invoice through its lifecycle (each step checks its own permission; issuing allocates the number)' })
  changeStatus(@Param('id', uuid()) id: string, @Body() dto: FinalInvoiceStatusDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.invoices.changeStatus(id, dto, user, contextOf(request));
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.INVOICE_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a never-issued draft (issued invoices can only be cancelled)' })
  async remove(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<void> {
    await this.invoices.remove(id, user, contextOf(request));
  }

  @Get(':id/pdf')
  @RequirePermissions(PERMISSIONS.INVOICE_DOWNLOAD)
  @ApiOperation({ summary: 'A4 PDF (issued: the stored document; otherwise a DRAFT preview)' })
  async downloadPdf(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Res() response: Response): Promise<void> {
    await this.invoices.assertExists(id);
    sendStoredFile(response, await this.pdf.open(id, user));
  }

  @Get(':id/payment-handoff')
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'Payment Management integration contract (read-only)' })
  paymentHandoff(@Param('id', uuid()) id: string) {
    return this.invoices.paymentHandoff(id);
  }

  // --- Documents ----------------------------------------------------------------

  @Post(':id/documents')
  @RequirePermissions(PERMISSIONS.INVOICE_UPDATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({ summary: 'Attach a supporting document (type verified from the bytes)' })
  async upload(@Param('id', uuid()) id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadFinalInvoiceDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.invoices.assertExists(id, { notCancelled: true });
    return this.documents.upload({ buffer: file.buffer, originalFilename: file.originalname, kind: dto.kind ?? DocumentKind.FINAL_INVOICE_ATTACHMENT, finalInvoiceId: id }, user);
  }

  @Post(':id/documents/:documentId/replace')
  @RequirePermissions(PERMISSIONS.INVOICE_UPDATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({ summary: 'Replace an attached document (old version archived and linked)' })
  async replace(
    @Param('id', uuid()) id: string,
    @Param('documentId', uuid()) documentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadFinalInvoiceDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.invoices.assertExists(id, { notCancelled: true });
    const current = await this.ownedUpload(id, documentId);
    return this.documents.upload({ buffer: file.buffer, originalFilename: file.originalname, kind: dto.kind ?? DocumentKind.FINAL_INVOICE_ATTACHMENT, finalInvoiceId: id, replacesDocumentId: current.id }, user);
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions(PERMISSIONS.INVOICE_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an attached document (soft; the generated invoice PDF cannot be removed)' })
  async removeDocument(@Param('id', uuid()) id: string, @Param('documentId', uuid()) documentId: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.invoices.assertExists(id, { notCancelled: true });
    await this.ownedUpload(id, documentId);
    await this.documents.archive(documentId, user);
  }

  @Get(':id/documents/:documentId/content')
  @RequirePermissions(PERMISSIONS.INVOICE_READ, PERMISSIONS.DOCUMENT_DOWNLOAD)
  @ApiQuery({ name: 'preview', required: false, type: Boolean })
  @ApiOperation({ summary: 'Download or preview an invoice document' })
  async content(
    @Param('id', uuid()) id: string,
    @Param('documentId', uuid()) documentId: string,
    @Query('preview') preview: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const document = await this.documents.findActive(documentId);
    if (document.finalInvoiceId !== id) throw new NotFoundException(`Document ${documentId} was not found`);
    if (document.kind === DocumentKind.FINAL_INVOICE_PDF && !user.permissions.includes(PERMISSIONS.INVOICE_DOWNLOAD)) {
      throw new NotFoundException(`Document ${documentId} was not found`);
    }
    sendStoredFile(response, await this.documents.openForDownload(documentId, user, { preview: preview === 'true' }));
  }

  private async ownedUpload(invoiceId: string, documentId: string) {
    const document = await this.documents.findActive(documentId);
    if (document.finalInvoiceId !== invoiceId || !(FINAL_INVOICE_UPLOAD_KINDS as readonly string[]).includes(document.kind)) {
      throw new NotFoundException(`Document ${documentId} was not found`);
    }
    return document;
  }
}
