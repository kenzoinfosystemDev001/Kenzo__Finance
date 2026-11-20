import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { DeliveryStatus, DocumentKind } from '@prisma/client';
import { DeliveriesService } from './deliveries.service';
import { CancelDeliveryDto, ConfirmDeliveryDto, CreateDeliveryDto, DispatchDeliveryDto, FailureDto, QueryDeliveriesDto, ScheduleDeliveryDto, TrackingDto, UpdateDeliveryDto } from './dto/delivery.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { contextOf } from '../vendors/vendor-shared';
import { DocumentsService } from '../documents/documents.service';
import { sendStoredFile } from '../documents/send-stored-file';
import { toCsv } from '../common/utils/csv';
import { DeliveryPdfService } from './delivery-pdf.service';

const uuid=()=>new ParseUUIDPipe({version:'4'});

@ApiTags('Deliveries')
@ApiBearerAuth()
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries:DeliveriesService, private readonly documents:DocumentsService, private readonly pdf:DeliveryPdfService){}

  @Get()
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  findAll(@Query() query:QueryDeliveriesDto){ return this.deliveries.findAll(query); }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  summary(){ return this.deliveries.summary(); }

  @Get('reports')
  @RequirePermissions(PERMISSIONS.DELIVERY_REPORTS)
  reports(){ return this.deliveries.reports(); }

  @Get('eligible-invoices')
  @RequirePermissions(PERMISSIONS.DELIVERY_CREATE)
  eligible(@Query('customerId',uuid()) customerId:string){ return this.deliveries.eligibleInvoices(customerId); }

  @Get('export')
  @RequirePermissions(PERMISSIONS.DELIVERY_EXPORT)
  async export(@Query() query:QueryDeliveriesDto,@Res() response:Response){
    const exportQuery=Object.assign(new QueryDeliveriesDto(),query,{page:1,pageSize:100});
    const result=await this.deliveries.findAll(exportQuery);
    const csv=toCsv(result.items.map((d:any)=>({
      'Delivery No':d.deliveryNumber,'Delivery Date':d.deliveryDate?.toISOString?.().slice(0,10)??'',Customer:d.customer?.name??'',Invoice:d.finalInvoice?.invoiceNumber??'',Status:d.status,
      'Transporter':d.transporterName??'',Tracking:d.trackingNumber??'',Expected:d.expectedDate?.toISOString?.().slice(0,10)??'',Actual:d.actualDeliveryDate?.toISOString?.().slice(0,10)??'',
    })));
    response.setHeader('Content-Type','text/csv; charset=utf-8');
    response.setHeader('Content-Disposition','attachment; filename="deliveries.csv"');
    response.send('\ufeff'+csv);
  }

  @Get('customers/:customerId/history')
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  customerHistory(@Param('customerId',uuid()) customerId:string){ return this.deliveries.customerHistory(customerId); }

  @Get('invoices/:finalInvoiceId/history')
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  invoiceHistory(@Param('finalInvoiceId',uuid()) finalInvoiceId:string){ return this.deliveries.invoiceHistory(finalInvoiceId); }

  @Post()
  @RequirePermissions(PERMISSIONS.DELIVERY_CREATE)
  create(@Body() dto:CreateDeliveryDto,@CurrentUser() user:AuthenticatedUser,@Req() request:Request){ return this.deliveries.create(dto,user,contextOf(request)); }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  findOne(@Param('id',uuid()) id:string){ return this.deliveries.findOne(id); }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DELIVERY_UPDATE)
  update(@Param('id',uuid()) id:string,@Body() dto:UpdateDeliveryDto,@CurrentUser() user:AuthenticatedUser,@Req() request:Request){ return this.deliveries.update(id,dto,user,contextOf(request)); }

  @Post(':id/schedule')
  @RequirePermissions(PERMISSIONS.DELIVERY_SCHEDULE)
  schedule(@Param('id',uuid()) id:string,@Body() dto:ScheduleDeliveryDto,@CurrentUser() user:AuthenticatedUser,@Req() request:Request){ return this.deliveries.schedule(id,dto,user,contextOf(request)); }

  @Post(':id/dispatch')
  @RequirePermissions(PERMISSIONS.DELIVERY_DISPATCH)
  dispatch(@Param('id',uuid()) id:string,@Body() dto:DispatchDeliveryDto,@CurrentUser() user:AuthenticatedUser,@Req() request:Request){ return this.deliveries.dispatch(id,dto,user,contextOf(request)); }

  @Post(':id/tracking')
  @RequirePermissions(PERMISSIONS.DELIVERY_TRACK)
  tracking(@Param('id',uuid()) id:string,@Body() dto:TrackingDto,@CurrentUser() user:AuthenticatedUser,@Req() request:Request){ return this.deliveries.tracking(id,dto,user,contextOf(request)); }

  @Post(':id/failure')
  @RequirePermissions(PERMISSIONS.DELIVERY_TRACK)
  failure(@Param('id',uuid()) id:string,@Body() dto:FailureDto,@CurrentUser() user:AuthenticatedUser,@Req() request:Request){ return this.deliveries.failure(id,dto,user,contextOf(request)); }

  @Post(':id/confirm')
  @RequirePermissions(PERMISSIONS.DELIVERY_CONFIRM)
  confirm(@Param('id',uuid()) id:string,@Body() dto:ConfirmDeliveryDto,@CurrentUser() user:AuthenticatedUser,@Req() request:Request){ return this.deliveries.confirm(id,dto,user,contextOf(request)); }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.DELIVERY_CANCEL)
  cancel(@Param('id',uuid()) id:string,@Body() dto:CancelDeliveryDto,@CurrentUser() user:AuthenticatedUser,@Req() request:Request){ return this.deliveries.cancel(id,dto,user,contextOf(request)); }

  @Post(':id/challan')
  @RequirePermissions(PERMISSIONS.DELIVERY_DOWNLOAD)
  challan(@Param('id',uuid()) id:string,@CurrentUser() user:AuthenticatedUser){ return this.pdf.challan(id,user); }

  @Post(':id/packing-list')
  @RequirePermissions(PERMISSIONS.DELIVERY_DOWNLOAD)
  packingList(@Param('id',uuid()) id:string,@CurrentUser() user:AuthenticatedUser){ return this.pdf.packing(id,user); }

  @Post(':id/pod')
  @RequirePermissions(PERMISSIONS.DELIVERY_UPLOAD_POD)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPod(@Param('id',uuid()) id:string,@UploadedFile() file:Express.Multer.File,@CurrentUser() user:AuthenticatedUser){
    if(!file) throw new BadRequestException('A POD file is required');
    return this.documents.upload({buffer:file.buffer,originalFilename:file.originalname,kind:DocumentKind.DELIVERY_POD,deliveryId:id},user);
  }

  @Get(':id/documents/:documentId')
  @RequirePermissions(PERMISSIONS.DELIVERY_DOWNLOAD)
  async document(@Param('id',uuid()) id:string,@Param('documentId',uuid()) documentId:string,@Res() response:Response,@CurrentUser() user:AuthenticatedUser){
    const doc=await this.documents.findActive(documentId);
    if(doc.deliveryId!==id) throw new BadRequestException('Document is not attached to this delivery');
    sendStoredFile(response,await this.documents.openForDownload(documentId,user,{preview:true}));
  }
}
