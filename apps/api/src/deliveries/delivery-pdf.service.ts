import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { DocumentKind } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

@Injectable()
export class DeliveryPdfService {
  constructor(private readonly prisma: PrismaService, private readonly documents: DocumentsService) {}

  private render(title:string, heading:string, delivery:any): Promise<Buffer> {
    const doc = new PDFDocument({ size:'A4', margin:40, info:{Title:title} });
    const chunks:Buffer[]=[]; doc.on('data',(c)=>chunks.push(c));
    const done=new Promise<Buffer>((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
    doc.fontSize(18).text(heading,{align:'center'});
    doc.moveDown();
    doc.fontSize(10).text(`Delivery: ${delivery.deliveryNumber}`);
    doc.text(`Final Invoice: ${delivery.finalInvoice?.invoiceNumber ?? ''}`);
    doc.text(`Customer: ${delivery.customer?.name ?? ''}`);
    doc.text(`Delivery Address: ${delivery.deliveryAddress}`);
    if(delivery.transporterName) doc.text(`Transporter: ${delivery.transporterName}`);
    if(delivery.trackingNumber) doc.text(`Tracking: ${delivery.trackingNumber}`);
    doc.moveDown();
    doc.fontSize(11).text('Delivery Items');
    delivery.items?.forEach((item:any,index:number)=>{
      doc.fontSize(9).text(`${index+1}. ${item.productName}${item.modelName?' - '+item.modelName:''} | Qty: ${item.quantity} ${item.unit}${item.packageCount?` | Packages: ${item.packageCount}`:''}`);
    });
    doc.moveDown(2);
    doc.text('Prepared By: __________________________________');
    doc.text('Authorized Signature: __________________________');
    doc.moveDown();
    doc.text('Customer Acknowledgment: _______________________');
    doc.end();
    return done;
  }

  async challan(id:string,actor:AuthenticatedUser){
    const delivery=await this.prisma.delivery.findUnique({where:{id},include:{customer:true,finalInvoice:true,items:true}});
    if(!delivery) throw new Error('Delivery not found');
    const buffer=await this.render(`Delivery Challan ${delivery.deliveryNumber}`,'DELIVERY CHALLAN',delivery);
    return this.documents.upload({buffer,originalFilename:`delivery-challan-${delivery.deliveryNumber}.pdf`,kind:DocumentKind.DELIVERY_CHALLAN,deliveryId:id,finalInvoiceId:delivery.finalInvoiceId,customerId:delivery.customerId},actor);
  }

  async packing(id:string,actor:AuthenticatedUser){
    const delivery=await this.prisma.delivery.findUnique({where:{id},include:{customer:true,finalInvoice:true,items:true,packingLists:true}});
    if(!delivery) throw new Error('Delivery not found');
    const buffer=await this.render(`Packing List ${delivery.deliveryNumber}`,'PACKING LIST',delivery);
    return this.documents.upload({buffer,originalFilename:`packing-list-${delivery.deliveryNumber}.pdf`,kind:DocumentKind.PACKING_LIST,deliveryId:id,finalInvoiceId:delivery.finalInvoiceId,customerId:delivery.customerId},actor);
  }
}
