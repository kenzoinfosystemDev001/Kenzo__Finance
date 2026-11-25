import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DocumentKind } from '@prisma/client';
import type { Request, Response } from 'express';
import { DeliveriesService } from './deliveries.service';
import { DeliveryPdfService } from './delivery-pdf.service';
import {
  AmendPodDto,
  CancelDeliveryDto,
  ConfirmDeliveryDto,
  CreateDeliveryDto,
  DELIVERY_UPLOAD_KINDS,
  DeliveryReportQueryDto,
  DeliveryStatusDto,
  DispatchDeliveryDto,
  EligibleInvoicesQueryDto,
  FailureDto,
  PackagesDto,
  QueryDeliveriesDto,
  ScheduleDeliveryDto,
  TrackingDto,
  UpdateDeliveryDto,
  UploadDeliveryDocumentDto,
} from './dto/delivery.dto';
import { DocumentsService } from '../documents/documents.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { toCsv } from '../common/utils/csv';
import { sendStoredFile } from '../documents/send-stored-file';
import { contextOf } from '../vendors/vendor-shared';

const uuid = () => new ParseUUIDPipe({ version: '4' });
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');
const fileBody = { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' }, kind: { type: 'string', enum: [...DELIVERY_UPLOAD_KINDS] } } } };

@ApiTags('Deliveries')
@ApiBearerAuth()
@Controller('deliveries')
export class DeliveriesController {
  constructor(
    private readonly deliveries: DeliveriesService,
    private readonly pdf: DeliveryPdfService,
    private readonly documents: DocumentsService,
  ) {}

  // --- Collection routes (before :id) -----------------------------------------

  @Get()
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  @ApiOperation({ summary: 'Delivery register: search, filters, sorting and pagination' })
  findAll(@Query() query: QueryDeliveriesDto) {
    return this.deliveries.findAll(query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  @ApiOperation({ summary: 'Dashboard counts by status (delayed = expected date passed, not delivered)' })
  summary() {
    return this.deliveries.summary();
  }

  @Get('reports')
  @RequirePermissions(PERMISSIONS.DELIVERY_REPORTS)
  @ApiOperation({ summary: 'Daily dispatch, monthly, customer-, invoice- and transporter-wise reports; scheduled / in-transit / delivered / delayed / failed / partial lists' })
  reports(@Query() query: DeliveryReportQueryDto) {
    return this.deliveries.reports(query);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.DELIVERY_EXPORT)
  @ApiOperation({ summary: 'Export the filtered delivery register as CSV' })
  async export(@Query() query: QueryDeliveriesDto, @Res() response: Response): Promise<void> {
    const rows = await this.deliveries.findAllForExport(query);
    const csv = toCsv(
      rows.map((d) => ({
        'Delivery No.': d.deliveryNumber,
        'Delivery Date': day(d.deliveryDate),
        'Expected Date': day(d.expectedDate),
        'Dispatch Date': day(d.dispatchDate),
        'Delivered On': day(d.actualDeliveryDate),
        Customer: d.customer.name,
        Invoice: d.finalInvoice.invoiceNumber ?? '',
        Status: d.status,
        Delayed: d.delayed ? 'Yes' : '',
        'Transport Mode': d.transportMode ?? '',
        Transporter: d.courierCompany ?? d.transporterName ?? '',
        'Tracking No.': d.trackingNumber ?? '',
        Quantity: d.totalQuantity,
        Address: d.deliveryAddress,
      })),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="deliveries-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send('﻿' + csv);
  }

  @Get('eligible-invoices')
  @RequirePermissions(PERMISSIONS.DELIVERY_CREATE)
  @ApiOperation({ summary: "The customer's issued invoices with quantity left to deliver (payment is not required)" })
  eligible(@Query() query: EligibleInvoicesQueryDto) {
    return this.deliveries.eligibleInvoices(query.customerId);
  }

  @Get('invoices/:finalInvoiceId/items')
  @RequirePermissions(PERMISSIONS.DELIVERY_CREATE)
  @ApiOperation({ summary: 'Invoice items with invoiced, allocated, delivered and remaining quantities' })
  invoiceItems(@Param('finalInvoiceId', uuid()) finalInvoiceId: string) {
    return this.deliveries.invoiceItems(finalInvoiceId);
  }

  @Get('invoices/:finalInvoiceId/history')
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  @ApiOperation({ summary: 'Delivery position of an invoice (never changes invoice amounts or payments)' })
  invoiceHistory(@Param('finalInvoiceId', uuid()) finalInvoiceId: string) {
    return this.deliveries.invoiceHistory(finalInvoiceId);
  }

  @Get('customers/:customerId/history')
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  @ApiOperation({ summary: 'Customer delivery history' })
  customerHistory(@Param('customerId', uuid()) customerId: string) {
    return this.deliveries.customerHistory(customerId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DELIVERY_CREATE)
  @ApiOperation({ summary: 'Create a draft delivery (quantities checked against what is left, under a lock on the invoice)' })
  create(@Body() dto: CreateDeliveryDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.deliveries.create(dto, user, contextOf(request));
  }

  // --- Single delivery ------------------------------------------------------------

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  @ApiOperation({ summary: 'Delivery with items, invoice positions, dispatch, tracking, packages, proof of delivery and documents' })
  findOne(@Param('id', uuid()) id: string) {
    return this.deliveries.findOne(id);
  }

  @Get(':id/activity')
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  @ApiOperation({ summary: 'Audit history of the delivery' })
  activity(@Param('id', uuid()) id: string, @Query() pagination: PaginationQueryDto) {
    return this.deliveries.activity(id, pagination);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DELIVERY_UPDATE)
  @ApiOperation({ summary: 'Edit a delivery before dispatch' })
  update(@Param('id', uuid()) id: string, @Body() dto: UpdateDeliveryDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.deliveries.update(id, dto, user, contextOf(request));
  }

  @Put(':id/packages')
  @RequirePermissions(PERMISSIONS.DELIVERY_UPDATE)
  @ApiOperation({ summary: 'Replace the packages (packing list) of a delivery before dispatch' })
  setPackages(@Param('id', uuid()) id: string, @Body() dto: PackagesDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.deliveries.setPackages(id, dto, user, contextOf(request));
  }

  @Post(':id/schedule')
  @RequirePermissions(PERMISSIONS.DELIVERY_SCHEDULE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Schedule (or reschedule after a failure) with an expected date' })
  schedule(@Param('id', uuid()) id: string, @Body() dto: ScheduleDeliveryDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.deliveries.schedule(id, dto, user, contextOf(request));
  }

  @Post(':id/status')
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ready for dispatch / in transit / returned (each checks its own permission)' })
  changeStatus(@Param('id', uuid()) id: string, @Body() dto: DeliveryStatusDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.deliveries.changeStatus(id, dto, user, contextOf(request));
  }

  @Post(':id/dispatch')
  @RequirePermissions(PERMISSIONS.DELIVERY_DISPATCH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dispatch (fields required depend on the transport mode); stores the challan and packing list' })
  dispatch(@Param('id', uuid()) id: string, @Body() dto: DispatchDeliveryDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.deliveries.dispatch(id, dto, user, contextOf(request));
  }

  @Post(':id/tracking')
  @RequirePermissions(PERMISSIONS.DELIVERY_TRACK)
  @ApiOperation({ summary: 'Add a manual tracking update' })
  track(@Param('id', uuid()) id: string, @Body() dto: TrackingDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.deliveries.track(id, dto, user, contextOf(request));
  }

  @Post(':id/failure')
  @RequirePermissions(PERMISSIONS.DELIVERY_TRACK)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a failed delivery attempt' })
  fail(@Param('id', uuid()) id: string, @Body() dto: FailureDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.deliveries.fail(id, dto, user, contextOf(request));
  }

  @Post(':id/confirm')
  @RequirePermissions(PERMISSIONS.DELIVERY_CONFIRM)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm with proof of delivery (received quantities decide delivered vs partially delivered)' })
  confirm(@Param('id', uuid()) id: string, @Body() dto: ConfirmDeliveryDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.deliveries.confirm(id, dto, user, contextOf(request));
  }

  @Post(':id/pod/amend')
  @RequirePermissions(PERMISSIONS.DELIVERY_CONFIRM)
  @ApiOperation({ summary: 'Correct the proof of delivery by adding an amendment (the original is kept)' })
  amendPod(@Param('id', uuid()) id: string, @Body() dto: AmendPodDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.deliveries.amendPod(id, dto, user, contextOf(request));
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.DELIVERY_CANCEL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a delivery that has not been dispatched (reason required; quantities are released)' })
  cancel(@Param('id', uuid()) id: string, @Body() dto: CancelDeliveryDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.deliveries.cancel(id, dto, user, contextOf(request));
  }

  @Get(':id/challan')
  @RequirePermissions(PERMISSIONS.DELIVERY_DOWNLOAD)
  @ApiOperation({ summary: 'Delivery challan PDF (dispatched: the stored document; otherwise a DRAFT preview)' })
  async challan(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Res() response: Response): Promise<void> {
    sendStoredFile(response, await this.pdf.open(id, 'challan', user));
  }

  @Get(':id/packing-list')
  @RequirePermissions(PERMISSIONS.DELIVERY_DOWNLOAD)
  @ApiOperation({ summary: 'Packing list PDF (dispatched: the stored document; otherwise a DRAFT preview)' })
  async packingList(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Res() response: Response): Promise<void> {
    sendStoredFile(response, await this.pdf.open(id, 'packing', user));
  }

  // --- Proof of delivery documents --------------------------------------------------

  @Post(':id/documents')
  @RequirePermissions(PERMISSIONS.DELIVERY_UPLOAD_POD)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({ summary: 'Upload POD, signature, photo or supporting document (type verified from the bytes)' })
  async upload(@Param('id', uuid()) id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadDeliveryDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    const d = await this.deliveries.assertExists(id);
    if (d.status === 'CANCELLED') throw new BadRequestException('Documents cannot be added to a cancelled delivery.');
    return this.documents.upload({ buffer: file.buffer, originalFilename: file.originalname, kind: dto.kind ?? DocumentKind.DELIVERY_ATTACHMENT, deliveryId: id }, user);
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions(PERMISSIONS.DELIVERY_UPLOAD_POD)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an uploaded document (only before the delivery is confirmed)' })
  async removeDocument(@Param('id', uuid()) id: string, @Param('documentId', uuid()) documentId: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.deliveries.assertDocumentsEditable(id);
    const document = await this.documents.findActive(documentId);
    if (document.deliveryId !== id || !(DELIVERY_UPLOAD_KINDS as readonly string[]).includes(document.kind)) throw new NotFoundException(`Document ${documentId} was not found`);
    await this.documents.archive(documentId, user);
  }

  @Get(':id/documents/:documentId/content')
  @RequirePermissions(PERMISSIONS.DELIVERY_READ, PERMISSIONS.DOCUMENT_DOWNLOAD)
  @ApiQuery({ name: 'preview', required: false, type: Boolean })
  @ApiOperation({ summary: 'Download or preview a delivery document' })
  async content(@Param('id', uuid()) id: string, @Param('documentId', uuid()) documentId: string, @Query('preview') preview: string | undefined, @CurrentUser() user: AuthenticatedUser, @Res() response: Response): Promise<void> {
    const document = await this.documents.findActive(documentId);
    if (document.deliveryId !== id) throw new NotFoundException(`Document ${documentId} was not found`);
    if ((document.kind === DocumentKind.DELIVERY_CHALLAN || document.kind === DocumentKind.PACKING_LIST) && !user.permissions.includes(PERMISSIONS.DELIVERY_DOWNLOAD)) {
      throw new NotFoundException(`Document ${documentId} was not found`);
    }
    sendStoredFile(response, await this.documents.openForDownload(documentId, user, { preview: preview === 'true' }));
  }
}
