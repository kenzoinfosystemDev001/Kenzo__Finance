import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DocumentKind, Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PassThrough, type Readable } from 'node:stream';
import { PrismaService } from '../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { BRANDING_SETTING_KEYS, SettingsService } from '../settings/settings.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { pdfDay, type PdfCompanyProfile } from '../common/pdf/commercial-pdf';

const deliveryForPdf = {
  customer: { select: { name: true, customerCode: true } },
  finalInvoice: { select: { invoiceNumber: true, invoiceDate: true } },
  items: { orderBy: { productName: 'asc' } },
  packingLists: { orderBy: { packageNumber: 'asc' }, include: { items: { include: { deliveryItem: { select: { productName: true, modelName: true, modelNumber: true, unit: true } } } } } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.DeliveryInclude;
type DeliveryForPdf = Prisma.DeliveryGetPayload<{ include: typeof deliveryForPdf }>;
type Kind = 'challan' | 'packing';

const PAGE = { w: 595.28, h: 841.89, m: 40 };
const W = PAGE.w - PAGE.m * 2;
const BOTTOM = PAGE.h - PAGE.m - 24;
const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#d1d5db';

/**
 * Delivery Challan and Packing List. Built only from the delivery record.
 * Rendered once when the delivery is dispatched and stored as the historical
 * dispatch document; before dispatch a DRAFT preview is rendered on demand.
 * Neither document is a tax invoice and neither says so.
 */
@Injectable()
export class DeliveryPdfService {
  private readonly logger = new Logger(DeliveryPdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly settings: SettingsService,
  ) {}

  async open(id: string, kind: Kind, actor: AuthenticatedUser): Promise<{ stream: Readable; filename: string; mimeType: string; sizeBytes: number; inline: boolean }> {
    const d = await this.load(id);
    const base = `${kind === 'challan' ? 'delivery-challan' : 'packing-list'}-${d.deliveryNumber.replace(/[\\/]/g, '-')}`;
    const storedId = kind === 'challan' ? d.challanDocumentId : d.packingDocumentId;
    if (d.dispatchedAt) {
      const documentId = storedId ?? (await this.store(d, kind, actor));
      const file = await this.documents.openForDownload(documentId, actor, { preview: false });
      return { ...file, filename: `${base}.pdf` };
    }
    const buffer = await this.render(d, kind, true);
    const stream = new PassThrough();
    stream.end(buffer);
    return { stream, filename: `${base}-DRAFT.pdf`, mimeType: 'application/pdf', sizeBytes: buffer.length, inline: false };
  }

  /** After dispatch: store both documents once (first stored copy wins). Failure only defers to the first download. */
  async storeDispatchDocuments(id: string, actor: AuthenticatedUser) {
    try {
      const d = await this.load(id);
      if (!d.dispatchedAt) return;
      if (!d.challanDocumentId) await this.store(d, 'challan', actor);
      if (!d.packingDocumentId) await this.store(d, 'packing', actor);
    } catch (error) {
      this.logger.warn(`Could not store dispatch documents for delivery ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async load(id: string) {
    const d = await this.prisma.delivery.findUnique({ where: { id }, include: deliveryForPdf });
    if (!d) throw new NotFoundException(`Delivery ${id} was not found`);
    return d;
  }

  private async store(d: DeliveryForPdf, kind: Kind, actor: AuthenticatedUser): Promise<string> {
    const buffer = await this.render(d, kind, false);
    const document = await this.documents.upload(
      { buffer, originalFilename: `${kind === 'challan' ? 'delivery-challan' : 'packing-list'}-${d.deliveryNumber.replace(/[\\/]/g, '-')}.pdf`, kind: kind === 'challan' ? DocumentKind.DELIVERY_CHALLAN : DocumentKind.PACKING_LIST, deliveryId: d.id },
      actor,
    );
    const field = kind === 'challan' ? 'challanDocumentId' : 'packingDocumentId';
    const linked = await this.prisma.delivery.updateMany({ where: { id: d.id, [field]: null }, data: { [field]: document.id } });
    if (linked.count === 0) {
      await this.documents.archive(document.id, actor);
      const current = await this.prisma.delivery.findUniqueOrThrow({ where: { id: d.id }, select: { challanDocumentId: true, packingDocumentId: true } });
      return (kind === 'challan' ? current.challanDocumentId : current.packingDocumentId)!;
    }
    return document.id;
  }

  async render(d: DeliveryForPdf, kind: Kind, draft: boolean): Promise<Buffer> {
    const company = ((await this.settings.get<PdfCompanyProfile | null>(BRANDING_SETTING_KEYS.COMPANY_PROFILE)) ?? {}) as PdfCompanyProfile;
    const doc = new PDFDocument({ size: 'A4', margins: { top: PAGE.m, bottom: PAGE.m, left: PAGE.m, right: PAGE.m }, bufferPages: true, info: { Title: `${kind === 'challan' ? 'Delivery Challan' : 'Packing List'} ${d.deliveryNumber}`, Author: company.name ?? '' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    const left = PAGE.m;
    let y = PAGE.m;
    const text = (value: string, x: number, top: number, o: PDFKit.Mixins.TextOptions & { size?: number; bold?: boolean; color?: string } = {}) => {
      const { size = 9, bold = false, color = INK, ...rest } = o;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color).text(value, x, top, rest);
      return doc.y;
    };
    const height = (value: string, width: number, size = 9, bold = false) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).heightOfString(value || ' ', { width });
    const heading = kind === 'challan' ? 'DELIVERY CHALLAN' : 'PACKING LIST';
    const reference = `${kind === 'challan' ? 'Delivery Challan' : 'Packing List'} ${d.deliveryNumber}`;
    const newPage = () => {
      doc.addPage();
      y = PAGE.m;
      text(company.name ?? '', left, y, { size: 10, bold: true, width: W / 2 });
      text(reference, left + W / 2, y, { size: 9, width: W / 2, align: 'right', color: MUTED });
      y += 18;
      doc.moveTo(left, y).lineTo(left + W, y).strokeColor(LINE).lineWidth(0.5).stroke();
      y += 10;
    };
    const ensure = (needed: number, onNew?: () => void) => {
      if (y + needed <= BOTTOM) return;
      newPage();
      onNew?.();
    };

    // Letterhead
    let ly = y;
    if (company.name) ly = text(company.name, left, ly, { size: 15, bold: true, width: W * 0.58 });
    for (const line of [company.address, [company.phone, company.email].filter(Boolean).join(' · '), [company.gstin && `GSTIN: ${company.gstin}`, company.pan && `PAN: ${company.pan}`].filter(Boolean).join(' · ')]) {
      if (line) ly = text(line, left, ly + 1, { size: 8.5, color: MUTED, width: W * 0.58 });
    }
    const mx = left + W * 0.6;
    const mw = W * 0.4;
    let ry = text(heading, mx, y, { size: 16, bold: true, width: mw, align: 'right' }) + 4;
    const meta: Array<[string, string]> = [
      ['Delivery No.', d.deliveryNumber],
      ['Delivery date', pdfDay(d.deliveryDate)],
      ...(d.dispatchDate ? ([['Dispatch date', `${pdfDay(d.dispatchDate)}${d.dispatchTime ? ` ${d.dispatchTime}` : ''}`]] as Array<[string, string]>) : []),
      ['Invoice No.', `${d.finalInvoice.invoiceNumber ?? '—'} (${pdfDay(d.finalInvoice.invoiceDate)})`],
    ];
    for (const [k, v] of meta) {
      text(k, mx, ry, { size: 8.5, color: MUTED, width: mw * 0.45 });
      ry = text(v, mx + mw * 0.45, ry, { size: 8.5, bold: true, width: mw * 0.55, align: 'right' });
    }
    y = Math.max(ly, ry) + 10;
    doc.moveTo(left, y).lineTo(left + W, y).strokeColor(INK).lineWidth(1).stroke();
    y += 10;

    // Consignee + transport
    const half = (W - 16) / 2;
    text('DELIVER TO', left, y, { size: 8, bold: true, color: MUTED });
    text('TRANSPORT', left + half + 16, y, { size: 8, bold: true, color: MUTED });
    y += 12;
    let cy = text(d.customer.name, left, y, { size: 10, bold: true, width: half });
    cy = text(`Customer code ${d.customer.customerCode}`, left, cy, { size: 8.5, color: MUTED, width: half });
    cy = text(d.deliveryAddress, left, cy + 2, { size: 8.5, width: half });
    if (d.contactPerson || d.contactNumber) cy = text([d.contactPerson, d.contactNumber].filter(Boolean).join(' · '), left, cy + 2, { size: 8.5, width: half });
    const transport = [
      d.transportMode && `Mode: ${d.transportMode.replace('_', ' ').toLowerCase()}`,
      d.transporterName && `Transporter: ${d.transporterName}`,
      d.courierCompany && `Courier: ${d.courierCompany}`,
      d.trackingNumber && `Tracking no.: ${d.trackingNumber}`,
      d.lrGrNumber && `LR / GR no.: ${d.lrGrNumber}`,
      d.vehicleNumber && `Vehicle: ${d.vehicleNumber}`,
      d.driverName && `Driver: ${d.driverName}${d.driverContact ? ` (${d.driverContact})` : ''}`,
    ].filter((v): v is string => Boolean(v));
    let ty = y;
    for (const line of transport.length ? transport : ['Not dispatched yet']) ty = text(line, left + half + 16, ty, { size: 8.5, width: half });
    y = Math.max(cy, ty) + 14;

    // Table
    type Col = { title: string; width: number; align: 'left' | 'right' };
    const cols: Col[] = kind === 'challan'
      ? [{ title: '#', width: 24, align: 'left' }, { title: 'Item', width: W - 24 - 70 - 60 - 110, align: 'left' }, { title: 'Quantity', width: 70, align: 'right' }, { title: 'Packages', width: 60, align: 'right' }, { title: 'Remarks', width: 110, align: 'left' }]
      : [{ title: 'Pkg', width: 34, align: 'left' }, { title: 'Item', width: W - 34 - 70 - 70 - 90, align: 'left' }, { title: 'Quantity', width: 70, align: 'right' }, { title: 'Weight', width: 70, align: 'right' }, { title: 'Dimensions', width: 90, align: 'left' }];
    const header = () => {
      doc.rect(left, y, W, 18).fill('#1e293b');
      let x = left;
      for (const c of cols) {
        text(c.title, x + 4, y + 5, { size: 8, bold: true, color: '#ffffff', width: c.width - 8, align: c.align });
        x += c.width;
      }
      y += 18;
    };
    header();
    const row = (cells: string[], index: number) => {
      const h = Math.max(...cells.map((c, i) => height(c, cols[i].width - 8, 8.5))) + 10;
      ensure(h, header);
      if (index % 2 === 1) doc.rect(left, y, W, h).fill('#f8fafc');
      let x = left;
      cells.forEach((c, i) => {
        text(c, x + 4, y + 5, { size: 8.5, width: cols[i].width - 8, align: cols[i].align });
        x += cols[i].width;
      });
      y += h;
      doc.moveTo(left, y).lineTo(left + W, y).strokeColor(LINE).lineWidth(0.5).stroke();
    };
    const itemText = (i: { productName: string; modelName: string | null; modelNumber: string | null; brandName?: string; description?: string | null }) =>
      [`${i.productName}${i.modelName ? ` — ${i.modelName}` : ''}`, [i.brandName, i.modelNumber && `Model no. ${i.modelNumber}`].filter(Boolean).join(' · '), i.description ?? ''].filter(Boolean).join('\n');
    if (kind === 'challan') {
      d.items.forEach((i, n) => row([String(n + 1), itemText(i), `${i.quantity} ${i.unit}`, i.packageCount ? String(i.packageCount) : '—', i.remarks ?? ''], n));
      const total = d.items.reduce((s, i) => s + i.quantity, 0);
      ensure(20);
      y += 6;
      text(`Total quantity: ${total} (${d.items.length} line${d.items.length === 1 ? '' : 's'})`, left, y, { size: 9, bold: true, width: W, align: 'right' });
      y += 16;
    } else if (!d.packingLists.length) {
      row(['—', 'No packages were recorded for this delivery.', '', '', ''], 0);
    } else {
      let n = 0;
      for (const p of d.packingLists) {
        const pkgLines = p.items.length ? p.items : [];
        pkgLines.forEach((line, i) =>
          row([i === 0 ? String(p.packageNumber) : '', `${itemText(line.deliveryItem)}${i === 0 && p.description ? `\nPackage: ${p.description}` : ''}${i === 0 && p.remarks ? `\n${p.remarks}` : ''}`, `${line.quantity} ${line.deliveryItem.unit}`, i === 0 ? p.weight ?? '—' : '', i === 0 ? p.dimensions ?? '—' : ''], n++),
        );
      }
      ensure(20);
      y += 6;
      text(`${d.packingLists.length} package(s)`, left, y, { size: 9, bold: true, width: W, align: 'right' });
      y += 16;
    }

    if (d.dispatchRemarks) {
      ensure(30);
      y = text('Remarks', left, y, { size: 9, bold: true }) + 2;
      y = text(d.dispatchRemarks, left, y, { size: 8.5, width: W }) + 8;
    }

    // Signatures and customer acknowledgment
    ensure(120);
    y += 14;
    const third = W / 3;
    const sign = (title: string, sub: string, x: number) => {
      doc.moveTo(x + 10, y + 50).lineTo(x + third - 10, y + 50).strokeColor(INK).lineWidth(0.5).stroke();
      text(title, x + 10, y + 54, { size: 8.5, bold: true, width: third - 20 });
      text(sub, x + 10, y + 66, { size: 8, color: MUTED, width: third - 20 });
    };
    sign('Prepared by', d.createdBy?.fullName ?? '', left);
    sign(company.name ? `For ${company.name}` : 'For the company', 'Authorised signatory', left + third);
    sign('Received in good condition', 'Customer name, signature, date and seal', left + 2 * third);
    y += 90;

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      if (draft) {
        doc.save();
        doc.rotate(-35, { origin: [PAGE.w / 2, PAGE.h / 2] });
        doc.font('Helvetica-Bold').fontSize(90).fillColor('#9ca3af').fillOpacity(0.18).text('DRAFT', 0, PAGE.h / 2 - 45, { width: PAGE.w, align: 'center', lineBreak: false });
        doc.restore();
        doc.fillOpacity(1);
      }
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
      doc.text(`${reference}${draft ? ' · DRAFT — not dispatched' : ''}`, left, PAGE.h - PAGE.m - 12, { width: W * 0.7, lineBreak: false });
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, left + W * 0.7, PAGE.h - PAGE.m - 12, { width: W * 0.3, align: 'right', lineBreak: false });
    }
    doc.end();
    return done;
  }
}
