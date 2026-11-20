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
import { DocumentKind, PaymentStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import { PaymentReceiptService } from './payment-receipt.service';
import {
  CreatePaymentDto,
  EligibleInvoicesQueryDto,
  PAYMENT_UPLOAD_KINDS,
  PaymentReasonDto,
  PaymentReportQueryDto,
  PaymentSettingsDto,
  QueryPaymentsDto,
  UpdatePaymentDto,
  UploadPaymentDocumentDto,
} from './dto/payment.dto';
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
  schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' }, kind: { type: 'string', enum: [...PAYMENT_UPLOAD_KINDS] } } },
};
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly receipts: PaymentReceiptService,
    private readonly documents: DocumentsService,
  ) {}

  // --- Collection routes (before :id) -----------------------------------------

  @Get()
  @RequirePermissions(PERMISSIONS.PAYMENT_READ)
  @ApiOperation({ summary: 'Payment register: search, filters, sorting and pagination' })
  findAll(@Query() query: QueryPaymentsDto) {
    return this.payments.findAll(query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.PAYMENT_READ)
  @ApiOperation({ summary: 'Dashboard figures from verified payments and invoice positions (per currency)' })
  summary() {
    return this.payments.summary();
  }

  @Get('reports')
  @RequirePermissions(PERMISSIONS.PAYMENT_REPORTS)
  @ApiOperation({ summary: 'Daily / monthly / customer / invoice / method reports, pending, rejected, outstanding and overdue lists' })
  reports(@Query() query: PaymentReportQueryDto) {
    return this.payments.reports(query);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.PAYMENT_EXPORT)
  @ApiOperation({ summary: 'Export the filtered payment register as CSV' })
  async export(@Query() query: QueryPaymentsDto, @Res() response: Response): Promise<void> {
    const rows = await this.payments.findAllForExport(query);
    const csv = toCsv(
      rows.map((p) => ({
        'Receipt No.': p.receiptNumber,
        'Payment Date': day(p.paymentDate),
        Customer: p.customer.name,
        'Customer Code': p.customer.customerCode,
        Invoice: p.allocations.map((a) => a.finalInvoice.invoiceNumber).join(' '),
        Method: p.method,
        'Transaction Ref.': p.transactionReference ?? '',
        Status: p.status,
        Currency: p.currency,
        Amount: p.amount.toFixed(2),
        'Received By': p.receivedBy?.fullName ?? '',
        Recorded: day(p.createdAt),
        Verified: day(p.verifiedAt),
      })),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="payments-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send('﻿' + csv);
  }

  @Get('settings')
  @RequirePermissions() // payment.read or settings.manage, checked below
  @ApiOperation({ summary: 'Payment methods and auto-verification settings' })
  settings(@CurrentUser() user: AuthenticatedUser) {
    if (!user.permissions.includes(PERMISSIONS.PAYMENT_READ) && !user.permissions.includes(PERMISSIONS.SETTINGS_MANAGE)) {
      throw new NotFoundException('Not found');
    }
    return this.payments.getSettings();
  }

  @Put('settings')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Configure accepted payment methods and which (if any) are verified automatically' })
  updateSettings(@Body() dto: PaymentSettingsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.updateSettings(dto, user);
  }

  @Get('eligible-invoices')
  @RequirePermissions(PERMISSIONS.PAYMENT_CREATE)
  @ApiOperation({ summary: "The customer's issued invoices that still have a balance" })
  eligible(@Query() query: EligibleInvoicesQueryDto) {
    return this.payments.eligibleInvoices(query.customerId);
  }

  @Get('customers/:customerId/history')
  @RequirePermissions(PERMISSIONS.PAYMENT_READ)
  @ApiOperation({ summary: 'Customer payment history: totals, invoice positions and payments' })
  customerHistory(@Param('customerId', uuid()) customerId: string) {
    return this.payments.customerHistory(customerId);
  }

  @Get('invoices/:finalInvoiceId/history')
  @RequirePermissions(PERMISSIONS.PAYMENT_READ)
  @ApiOperation({ summary: 'Invoice payment history' })
  invoiceHistory(@Param('finalInvoiceId', uuid()) finalInvoiceId: string) {
    return this.payments.invoiceHistory(finalInvoiceId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PAYMENT_CREATE)
  @ApiOperation({
    summary: 'Record a payment against one final invoice',
    description: 'Recorded as Pending Verification (unless its method is set to auto-verify). A duplicate transaction reference returns 409 requiresConfirmation.',
  })
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.payments.create(dto, user, contextOf(request));
  }

  // --- Single payment -------------------------------------------------------------

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PAYMENT_READ)
  @ApiOperation({ summary: 'Payment with its invoice summary, status history and documents' })
  findOne(@Param('id', uuid()) id: string) {
    return this.payments.findOne(id);
  }

  @Get(':id/activity')
  @RequirePermissions(PERMISSIONS.PAYMENT_READ)
  @ApiOperation({ summary: 'Audit history of the payment' })
  activity(@Param('id', uuid()) id: string, @Query() pagination: PaginationQueryDto) {
    return this.payments.activity(id, pagination);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PAYMENT_UPDATE)
  @ApiOperation({ summary: 'Edit a payment that is still pending verification' })
  update(@Param('id', uuid()) id: string, @Body() dto: UpdatePaymentDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.payments.update(id, dto, user, contextOf(request));
  }

  @Post(':id/verify')
  @RequirePermissions(PERMISSIONS.PAYMENT_VERIFY)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify: the payment now counts towards the invoice (balance recalculated)' })
  verify(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.payments.verify(id, user, contextOf(request));
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.PAYMENT_REJECT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending payment (reason required; kept on record)' })
  reject(@Param('id', uuid()) id: string, @Body() dto: PaymentReasonDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.payments.reject(id, dto, user, contextOf(request));
  }

  @Post(':id/reverse')
  @RequirePermissions(PERMISSIONS.PAYMENT_REVERSE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reverse a verified payment (reason required; history kept, balance recalculated)' })
  reverse(@Param('id', uuid()) id: string, @Body() dto: PaymentReasonDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.payments.reverse(id, dto, user, contextOf(request));
  }

  @Get(':id/receipt')
  @RequirePermissions(PERMISSIONS.PAYMENT_DOWNLOAD)
  @ApiOperation({ summary: 'Receipt PDF (verified: the stored snapshot; otherwise the current status, clearly marked)' })
  async receipt(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Res() response: Response): Promise<void> {
    await this.payments.assertExists(id);
    sendStoredFile(response, await this.receipts.open(id, user));
  }

  // --- Documents (payment proof) ---------------------------------------------------

  @Post(':id/documents')
  @RequirePermissions(PERMISSIONS.PAYMENT_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({ summary: 'Attach payment proof (type verified from the bytes)' })
  async upload(@Param('id', uuid()) id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadPaymentDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.assertAttachable(id);
    return this.documents.upload({ buffer: file.buffer, originalFilename: file.originalname, kind: dto.kind ?? DocumentKind.PAYMENT_PROOF, paymentId: id }, user);
  }

  @Post(':id/documents/:documentId/replace')
  @RequirePermissions(PERMISSIONS.PAYMENT_UPDATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({ summary: 'Replace payment proof (old version archived and linked)' })
  async replace(@Param('id', uuid()) id: string, @Param('documentId', uuid()) documentId: string, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.assertAttachable(id);
    const current = await this.ownedUpload(id, documentId);
    return this.documents.upload({ buffer: file.buffer, originalFilename: file.originalname, kind: DocumentKind.PAYMENT_PROOF, paymentId: id, replacesDocumentId: current.id }, user);
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions(PERMISSIONS.PAYMENT_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove payment proof (only while the payment is pending verification)' })
  async removeDocument(@Param('id', uuid()) id: string, @Param('documentId', uuid()) documentId: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const payment = await this.payments.assertExists(id);
    if (payment.status !== PaymentStatus.PENDING_VERIFICATION) throw new BadRequestException('Proof of a verified, rejected or reversed payment is kept for the record.');
    await this.ownedUpload(id, documentId);
    await this.documents.archive(documentId, user);
  }

  @Get(':id/documents/:documentId/content')
  @RequirePermissions(PERMISSIONS.PAYMENT_READ, PERMISSIONS.DOCUMENT_DOWNLOAD)
  @ApiQuery({ name: 'preview', required: false, type: Boolean })
  @ApiOperation({ summary: 'Download or preview a payment document' })
  async content(@Param('id', uuid()) id: string, @Param('documentId', uuid()) documentId: string, @Query('preview') preview: string | undefined, @CurrentUser() user: AuthenticatedUser, @Res() response: Response): Promise<void> {
    const document = await this.documents.findActive(documentId);
    if (document.paymentId !== id) throw new NotFoundException(`Document ${documentId} was not found`);
    if (document.kind === DocumentKind.PAYMENT_RECEIPT && !user.permissions.includes(PERMISSIONS.PAYMENT_DOWNLOAD)) throw new NotFoundException(`Document ${documentId} was not found`);
    sendStoredFile(response, await this.documents.openForDownload(documentId, user, { preview: preview === 'true' }));
  }

  /** Proof may be added while pending or after verification (e.g. a bank confirmation), never to rejected/reversed records. */
  private async assertAttachable(id: string) {
    const payment = await this.payments.assertExists(id);
    if (payment.status === PaymentStatus.REJECTED || payment.status === PaymentStatus.REVERSED) throw new BadRequestException('Documents cannot be added to a rejected or reversed payment.');
  }

  private async ownedUpload(paymentId: string, documentId: string) {
    const document = await this.documents.findActive(documentId);
    if (document.paymentId !== paymentId || !(PAYMENT_UPLOAD_KINDS as readonly string[]).includes(document.kind)) throw new NotFoundException(`Document ${documentId} was not found`);
    return document;
  }
}
