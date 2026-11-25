import { Injectable, Logger } from '@nestjs/common';
import { DocumentKind, PaymentStatus, Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PassThrough, type Readable } from 'node:stream';
import { PrismaService } from '../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { BRANDING_SETTING_KEYS, SettingsService } from '../settings/settings.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { formatMoney, pdfDay, type PdfCompanyProfile, type PdfCustomerSnapshot } from '../common/pdf/commercial-pdf';
import { DEFAULT_METHODS, type PaymentMethodOption } from './payment-rules';

const receiptInclude = {
  customer: { select: { name: true, customerCode: true } },
  receivedBy: { select: { fullName: true } },
  verifiedBy: { select: { fullName: true } },
  allocations: { include: { finalInvoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, grandTotal: true, customerSnapshot: true } } } },
} satisfies Prisma.PaymentInclude;
type PaymentForReceipt = Prisma.PaymentGetPayload<{ include: typeof receiptInclude }>;

const BANNER: Record<PaymentStatus, { text: string; color: string }> = {
  PENDING_VERIFICATION: { text: 'PENDING VERIFICATION — not a confirmation that funds were received', color: '#b45309' },
  VERIFIED: { text: 'VERIFIED', color: '#15803d' },
  REJECTED: { text: 'REJECTED — this payment was not accepted', color: '#b91c1c' },
  REVERSED: { text: 'REVERSED — this payment no longer counts towards the invoice', color: '#b91c1c' },
};

/**
 * Payment receipts. The banner always states the payment's real status, so
 * a pending or rejected payment can never look verified.
 *
 * When a payment is verified its receipt is rendered once and stored
 * (PAYMENT_RECEIPT) as the historical snapshot, with the invoice balance as it
 * was at that moment. Downloads of a verified payment return those bytes;
 * any other status (pending, rejected, reversed) renders the current state.
 * The stored verified receipt stays available under the payment's documents.
 */
@Injectable()
export class PaymentReceiptService {
  private readonly logger = new Logger(PaymentReceiptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
    private readonly settingsService: SettingsService,
  ) {}

  async open(id: string, actor: AuthenticatedUser): Promise<{ stream: Readable; filename: string; mimeType: string; sizeBytes: number; inline: boolean }> {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id }, include: receiptInclude });
    const base = payment.receiptNumber.replace(/[\\/]/g, '-');
    if (payment.status === PaymentStatus.VERIFIED) {
      const documentId = payment.receiptDocumentId ?? (await this.storeVerified(payment, actor));
      const file = await this.documentsService.openForDownload(documentId, actor, { preview: false });
      return { ...file, filename: `${base}.pdf` };
    }
    const buffer = await this.render(payment);
    const stream = new PassThrough();
    stream.end(buffer);
    return { stream, filename: `${base}-${payment.status}.pdf`, mimeType: 'application/pdf', sizeBytes: buffer.length, inline: false };
  }

  async storeVerified(payment: PaymentForReceipt, actor: AuthenticatedUser): Promise<string> {
    const buffer = await this.render(payment);
    const document = await this.documentsService.upload({ buffer, originalFilename: `${payment.receiptNumber.replace(/[\\/]/g, '-')}.pdf`, kind: DocumentKind.PAYMENT_RECEIPT, paymentId: payment.id }, actor);
    const linked = await this.prisma.payment.updateMany({ where: { id: payment.id, receiptDocumentId: null }, data: { receiptDocumentId: document.id } });
    if (linked.count === 0) {
      await this.documentsService.archive(document.id, actor);
      return (await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, select: { receiptDocumentId: true } })).receiptDocumentId!;
    }
    return document.id;
  }

  /** Called right after verification; a failure only defers storing to the first download. */
  async storeVerifiedById(id: string, actor: AuthenticatedUser): Promise<void> {
    try {
      const payment = await this.prisma.payment.findUnique({ where: { id }, include: receiptInclude });
      if (payment?.status === PaymentStatus.VERIFIED && !payment.receiptDocumentId) await this.storeVerified(payment, actor);
    } catch (error) {
      this.logger.warn(`Could not store the receipt for payment ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async render(payment: PaymentForReceipt): Promise<Buffer> {
    const company = ((await this.settingsService.get<PdfCompanyProfile | null>(BRANDING_SETTING_KEYS.COMPANY_PROFILE)) ?? {}) as PdfCompanyProfile;
    const methods = (await this.settingsService.get<PaymentMethodOption[] | null>(BRANDING_SETTING_KEYS.PAYMENT_METHODS)) ?? DEFAULT_METHODS;
    const allocation = payment.allocations[0];
    const invoice = allocation.finalInvoice;
    const snapshot = (invoice.customerSnapshot ?? {}) as PdfCustomerSnapshot;
    const currency = payment.currency;

    // Verified payments on this invoice other than this one, as of now (or as of
    // verification when the receipt is stored at that moment).
    const others = await this.prisma.paymentAllocation.aggregate({
      where: {
        finalInvoiceId: invoice.id,
        paymentId: { not: payment.id },
        payment: {
          status: PaymentStatus.VERIFIED,
          createdAt: { lt: payment.createdAt },
        },
      },
      _sum: { amount: true },
    });
    const previous = others._sum.amount ?? new Prisma.Decimal(0);
    const counts = payment.status === PaymentStatus.VERIFIED;
    const outstandingAfter = Prisma.Decimal.max(invoice.grandTotal.minus(previous).minus(counts ? allocation.amount : 0), 0);

    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true, info: { Title: `Receipt ${payment.receiptNumber}`, Author: company.name ?? '' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    const W = 595.28 - 80;
    const left = 40;
    const ink = '#111827';
    const muted = '#6b7280';
    let y = 40;
    const text = (value: string, x: number, top: number, opts: PDFKit.Mixins.TextOptions & { size?: number; bold?: boolean; color?: string } = {}) => {
      const { size = 9, bold = false, color = ink, ...rest } = opts;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color).text(value, x, top, rest);
      return doc.y;
    };

    // Letterhead
    if (company.name) y = text(company.name, left, y, { size: 15, bold: true, width: W * 0.6 });
    for (const line of [company.address, [company.phone, company.email].filter(Boolean).join(' · '), company.website, [company.gstin && `GSTIN: ${company.gstin}`, company.pan && `PAN: ${company.pan}`].filter(Boolean).join(' · ')]) {
      if (line) y = text(line, left, y + 1, { size: 8.5, color: muted, width: W * 0.6 });
    }
    text('PAYMENT RECEIPT', left + W * 0.6, 40, { size: 16, bold: true, width: W * 0.4, align: 'right' });
    text(payment.receiptNumber, left + W * 0.6, 62, { size: 10, bold: true, width: W * 0.4, align: 'right' });
    text(`Receipt date ${pdfDay(payment.createdAt)}`, left + W * 0.6, 76, { size: 8.5, color: muted, width: W * 0.4, align: 'right' });
    y = Math.max(y, 92) + 10;
    doc.moveTo(left, y).lineTo(left + W, y).strokeColor(ink).lineWidth(1).stroke();
    y += 10;

    // Status banner (always the real status)
    const banner = BANNER[payment.status];
    const bannerHeight = doc.font('Helvetica-Bold').fontSize(10).heightOfString(banner.text, { width: W - 20 }) + 12;
    doc.rect(left, y, W, bannerHeight).fill(banner.color);
    text(banner.text, left + 10, y + 6, { size: 10, bold: true, color: '#ffffff', width: W - 20 });
    y += bannerHeight + 14;

    // Received from
    y = text('RECEIVED FROM', left, y, { size: 8, bold: true, color: muted });
    y = text(snapshot.name ?? payment.customer.name, left, y + 2, { size: 11, bold: true, width: W });
    const contact = [snapshot.contactName, snapshot.phone, snapshot.email].filter(Boolean).join(' · ');
    if (contact) y = text(contact, left, y + 1, { size: 8.5, color: muted, width: W });
    y = text(`Customer code ${payment.customer.customerCode}`, left, y + 1, { size: 8.5, color: muted, width: W }) + 12;

    // Details table
    const methodLabel = methods.find((m) => m.code === payment.method)?.label ?? payment.method;
    const rows: Array<[string, string]> = [
      ['Amount', `${currency} ${formatMoney(payment.amount, currency)}`],
      ['Payment date', pdfDay(payment.paymentDate)],
      ['Payment method', methodLabel],
      ...(payment.transactionReference ? ([['Transaction reference', payment.transactionReference]] as Array<[string, string]>) : []),
      ...(payment.bankReference ? ([['Bank reference', payment.bankReference]] as Array<[string, string]>) : []),
      ['Against invoice', `${invoice.invoiceNumber ?? '—'} dated ${pdfDay(invoice.invoiceDate)}`],
      ['Invoice total', `${currency} ${formatMoney(invoice.grandTotal, currency)}`],
      ['Previously received (verified)', `${currency} ${formatMoney(previous, currency)}`],
      [counts ? 'Outstanding after this payment' : 'Outstanding (this payment not counted)', `${currency} ${formatMoney(outstandingAfter, currency)}`],
      ['Status', payment.status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())],
      ...(payment.verifiedAt && payment.verifiedBy ? ([['Verified', `${pdfDay(payment.verifiedAt)} by ${payment.verifiedBy.fullName}`]] as Array<[string, string]>) : []),
      ...(payment.receivedBy ? ([['Received by', payment.receivedBy.fullName]] as Array<[string, string]>) : []),
      ...(payment.notes ? ([['Notes', payment.notes]] as Array<[string, string]>) : []),
    ];
    const keyW = W * 0.35;
    for (const [k, v] of rows) {
      const h = Math.max(doc.font('Helvetica').fontSize(9).heightOfString(k, { width: keyW - 8 }), doc.font('Helvetica-Bold').fontSize(9).heightOfString(v, { width: W - keyW - 8 })) + 8;
      if (y + h > 841.89 - 140) {
        doc.addPage();
        y = 40;
      }
      doc.moveTo(left, y).lineTo(left + W, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      text(k, left + 4, y + 4, { size: 9, color: muted, width: keyW - 8 });
      text(v, left + keyW, y + 4, { size: 9, bold: true, width: W - keyW - 8 });
      y += h;
    }
    doc.moveTo(left, y).lineTo(left + W, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

    // Signature
    y += 50;
    const sigX = left + W * 0.6;
    text(company.name ? `For ${company.name}` : 'For the company', sigX, y, { size: 9, bold: true, width: W * 0.4, align: 'right' });
    y += 42;
    doc.moveTo(sigX + 20, y).lineTo(left + W, y).strokeColor(ink).lineWidth(0.5).stroke();
    text('Authorised signatory', sigX, y + 4, { size: 8.5, color: muted, width: W * 0.4, align: 'right' });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(7.5).fillColor(muted);
      doc.text(`Receipt ${payment.receiptNumber} · ${payment.status.replace(/_/g, ' ').toLowerCase()}`, left, 841.89 - 52, { width: W * 0.7, lineBreak: false });
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, left + W * 0.7, 841.89 - 52, { width: W * 0.3, align: 'right', lineBreak: false });
    }
    doc.end();
    return done;
  }
}
