import { Injectable, Logger } from '@nestjs/common';
import { DocumentKind, Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PassThrough, type Readable } from 'node:stream';
import { PrismaService } from '../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { BRANDING_SETTING_KEYS, SettingsService } from '../settings/settings.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { readSpecifications } from '../products/product-specs';

type Address = { addressLine1?: string | null; addressLine2?: string | null; city?: string | null; state?: string | null; postalCode?: string | null; country?: string | null } | null;
type Snapshot = {
  customerCode?: string;
  name?: string;
  contactName?: string | null;
  contactDesignation?: string | null;
  phone?: string | null;
  email?: string | null;
  billingAddress?: Address;
  shippingAddress?: Address;
  gstin?: string | null;
  pan?: string | null;
  taxRegistrationNumber?: string | null;
};
type CompanyProfile = { name?: string; address?: string; phone?: string; email?: string; website?: string; gstin?: string; pan?: string };
type TaxGroup = { label: string; rate: string; taxable: string; tax: string };

const revisionForPdf = {
  items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  quotation: { select: { id: true, quotationNumber: true, currency: true, subject: true, referenceNumber: true, enquiry: { select: { enquiryNumber: true } }, assignedTo: { select: { fullName: true } } } },
} satisfies Prisma.QuotationRevisionInclude;
type RevisionForPdf = Prisma.QuotationRevisionGetPayload<{ include: typeof revisionForPdf }>;

// A4 in points, 40pt margins.
const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
const BOTTOM = PAGE.height - PAGE.margin - 24; // room for the footer
/**
 * Tallest item row that still fits on a fresh page under the continuation
 * header and the repeated table header. A row is never split across pages,
 * so a taller one (a long description plus a long spec list) used to spill
 * off the page with its price columns stranded on the previous one.
 */
const MAX_ROW_HEIGHT = BOTTOM - PAGE.margin - 120;

/**
 * Keeps an item's secondary lines within `budget` points: lines are kept in
 * order while they fit, and the first that does not is shortened with an
 * ellipsis. The full text stays on the quotation record.
 */
function fitItemText(lines: string[], budget: number, measure: (s: string) => number): string[] {
  const kept: string[] = [];
  let remaining = budget;
  for (const line of lines) {
    const height = measure(line);
    if (height <= remaining) {
      kept.push(line);
      remaining -= height;
      continue;
    }
    // Longest prefix that fits, found by bisection on the character count.
    let low = 0;
    let high = line.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (measure(`${line.slice(0, mid).trimEnd()}…`) <= remaining) low = mid;
      else high = mid - 1;
    }
    if (low > 0) kept.push(`${line.slice(0, low).trimEnd()}…`);
    break;
  }
  return kept;
}
const COLORS = { ink: '#111827', muted: '#6b7280', line: '#d1d5db', head: '#1e293b', headText: '#ffffff', zebra: '#f8fafc' };

/** Columns of the item table; widths sum to CONTENT_WIDTH. */
const COLUMNS = [
  { key: 'no', title: '#', width: 22, align: 'left' as const },
  { key: 'item', title: 'Item & description', width: 191, align: 'left' as const },
  { key: 'qty', title: 'Qty', width: 40, align: 'right' as const },
  { key: 'rate', title: 'Unit price', width: 68, align: 'right' as const },
  { key: 'disc', title: 'Discount', width: 56, align: 'right' as const },
  { key: 'tax', title: 'Tax', width: 66, align: 'right' as const },
  { key: 'amount', title: 'Amount', width: CONTENT_WIDTH - 22 - 191 - 40 - 68 - 56 - 66, align: 'right' as const },
];

/** Exact digit grouping from a fixed 2-dp string (no float conversion). */
export function formatMoney(value: Prisma.Decimal | string, currency: string): string {
  const fixed = typeof value === 'string' ? new Prisma.Decimal(value).toFixed(2) : value.toFixed(2);
  const negative = fixed.startsWith('-');
  const [intPart, frac] = fixed.replace('-', '').split('.');
  let grouped: string;
  if (currency === 'INR' && intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = `${rest},${last3}`;
  } else {
    grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  return `${negative ? '-' : ''}${grouped}.${frac}`;
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10).split('-').reverse().join('-') : '—');
const addressLines = (a: Address) =>
  a ? [a.addressLine1, a.addressLine2, [a.city, a.state, a.postalCode].filter(Boolean).join(', '), a.country].filter((v): v is string => Boolean(v && v.trim())) : [];

/**
 * Server-side A4 quotation PDF built only from a revision's stored snapshot
 * (customer details, item names, prices and totals as they were issued), so
 * later master-data changes never alter an issued quotation.
 *
 * Issued revisions are rendered once and stored as a QUOTATION_PDF document;
 * every later download returns those exact bytes. Revisions that were never
 * issued are rendered on demand with a DRAFT watermark and not stored.
 */
@Injectable()
export class QuotationPdfService {
  private readonly logger = new Logger(QuotationPdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
    private readonly settingsService: SettingsService,
  ) {}

  async open(quotationId: string, revisionNumber: number, actor: AuthenticatedUser): Promise<{ stream: Readable; filename: string; mimeType: string; sizeBytes: number; inline: boolean }> {
    const revision = await this.load(quotationId, revisionNumber);
    const filename = `${revision.quotation.quotationNumber.replace(/[\\/]/g, '-')}-R${revision.revisionNumber}${revision.issuedAt ? '' : '-DRAFT'}.pdf`;

    if (revision.issuedAt) {
      const documentId = revision.pdfDocumentId ?? (await this.storeIssued(revision, actor));
      const file = await this.documentsService.openForDownload(documentId, actor, { preview: false });
      return { ...file, filename };
    }

    const buffer = await this.render(revision, true);
    const stream = new PassThrough();
    stream.end(buffer);
    return { stream, filename, mimeType: 'application/pdf', sizeBytes: buffer.length, inline: false };
  }

  /** Stores the PDF of an issued revision; safe to call more than once. */
  async storeIssued(revision: RevisionForPdf, actor: AuthenticatedUser): Promise<string> {
    const buffer = await this.render(revision, false);
    const document = await this.documentsService.upload(
      {
        buffer,
        originalFilename: `${revision.quotation.quotationNumber.replace(/[\\/]/g, '-')}-R${revision.revisionNumber}.pdf`,
        kind: DocumentKind.QUOTATION_PDF,
        quotationId: revision.quotationId,
      },
      actor,
    );
    // Guarded link: if a concurrent request stored one first, keep theirs.
    const linked = await this.prisma.quotationRevision.updateMany({ where: { id: revision.id, pdfDocumentId: null }, data: { pdfDocumentId: document.id } });
    if (linked.count === 0) {
      await this.documentsService.archive(document.id, actor);
      const current = await this.prisma.quotationRevision.findUniqueOrThrow({ where: { id: revision.id }, select: { pdfDocumentId: true } });
      return current.pdfDocumentId!;
    }
    return document.id;
  }

  /** Called after a revision is issued; failure only defers storing to the first download. */
  async storeIssuedById(revisionId: string, actor: AuthenticatedUser): Promise<void> {
    try {
      const revision = await this.prisma.quotationRevision.findUnique({ where: { id: revisionId }, include: revisionForPdf });
      if (revision?.issuedAt && !revision.pdfDocumentId) await this.storeIssued(revision, actor);
    } catch (error) {
      this.logger.warn(`Could not store the PDF for revision ${revisionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async load(quotationId: string, revisionNumber: number) {
    return this.prisma.quotationRevision.findUniqueOrThrow({
      where: { quotationId_revisionNumber: { quotationId, revisionNumber } },
      include: revisionForPdf,
    });
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  async render(revision: RevisionForPdf, draft: boolean): Promise<Buffer> {
    const company = ((await this.settingsService.get<CompanyProfile | null>(BRANDING_SETTING_KEYS.COMPANY_PROFILE)) ?? {}) as CompanyProfile;
    const customer = (revision.customerSnapshot ?? {}) as Snapshot;
    const currency = revision.quotation.currency;
    const quotationNumber = revision.quotation.quotationNumber;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin },
      bufferPages: true,
      info: { Title: `Quotation ${quotationNumber} R${revision.revisionNumber}`, Author: company.name ?? '', Subject: revision.quotation.subject ?? '' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const left = PAGE.margin;
    const right = PAGE.width - PAGE.margin;
    let y = PAGE.margin;

    const text = (value: string, x: number, top: number, options: PDFKit.Mixins.TextOptions & { size?: number; bold?: boolean; color?: string } = {}) => {
      const { size = 9, bold = false, color = COLORS.ink, ...rest } = options;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color).text(value, x, top, { lineBreak: true, ...rest });
      return doc.y;
    };
    const heightOf = (value: string, width: number, size = 9, bold = false) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).heightOfString(value, { width });

    // Compact header repeated on continuation pages.
    const continuationHeader = () => {
      y = PAGE.margin;
      text(company.name ?? '', left, y, { size: 10, bold: true, width: CONTENT_WIDTH / 2 });
      text(`Quotation ${quotationNumber} · Revision ${revision.revisionNumber}`, left + CONTENT_WIDTH / 2, y, { size: 9, width: CONTENT_WIDTH / 2, align: 'right', color: COLORS.muted });
      y += 18;
      doc.moveTo(left, y).lineTo(right, y).strokeColor(COLORS.line).lineWidth(0.5).stroke();
      y += 10;
    };
    const ensureSpace = (needed: number, onNewPage?: () => void) => {
      if (y + needed <= BOTTOM) return;
      doc.addPage();
      continuationHeader();
      onNewPage?.();
    };

    // --- Letterhead ---------------------------------------------------------
    const headWidth = CONTENT_WIDTH * 0.58;
    let leftY = y;
    if (company.name) leftY = text(company.name, left, leftY, { size: 15, bold: true, width: headWidth });
    for (const line of [company.address, [company.phone, company.email].filter(Boolean).join(' · '), company.website, [company.gstin && `GSTIN: ${company.gstin}`, company.pan && `PAN: ${company.pan}`].filter(Boolean).join(' · ')]) {
      if (line) leftY = text(line, left, leftY + 1, { size: 8.5, width: headWidth, color: COLORS.muted });
    }
    const metaX = left + headWidth + 10;
    const metaWidth = CONTENT_WIDTH - headWidth - 10;
    let rightY = text('QUOTATION', metaX, y, { size: 16, bold: true, width: metaWidth, align: 'right' });
    const meta: Array<[string, string]> = [
      ['Quotation No.', quotationNumber],
      ['Revision', String(revision.revisionNumber)],
      ['Date', day(revision.quotationDate)],
      ['Valid until', day(revision.validUntil)],
      ...(revision.quotation.enquiry ? ([['Enquiry', revision.quotation.enquiry.enquiryNumber]] as Array<[string, string]>) : []),
      ...(revision.quotation.referenceNumber ? ([['Your reference', revision.quotation.referenceNumber]] as Array<[string, string]>) : []),
      ['Currency', currency],
    ];
    rightY += 4;
    for (const [k, v] of meta) {
      text(k, metaX, rightY, { size: 8.5, width: metaWidth * 0.45, color: COLORS.muted });
      rightY = text(v, metaX + metaWidth * 0.45, rightY, { size: 8.5, bold: true, width: metaWidth * 0.55, align: 'right' });
    }
    y = Math.max(leftY, rightY) + 10;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(COLORS.ink).lineWidth(1).stroke();
    y += 10;

    // --- Customer -------------------------------------------------------------
    const half = (CONTENT_WIDTH - 16) / 2;
    const billTo = [
      customer.name ?? '',
      ...(customer.customerCode ? [`Customer code: ${customer.customerCode}`] : []),
      ...addressLines(customer.billingAddress ?? null),
      ...[customer.gstin && `GSTIN: ${customer.gstin}`, customer.pan && `PAN: ${customer.pan}`, customer.taxRegistrationNumber && `Tax reg.: ${customer.taxRegistrationNumber}`].filter((v): v is string => Boolean(v)),
    ];
    const attention = [
      ...(customer.contactName ? [`${customer.contactName}${customer.contactDesignation ? `, ${customer.contactDesignation}` : ''}`] : []),
      ...(customer.phone ? [customer.phone] : []),
      ...(customer.email ? [customer.email] : []),
      ...(customer.shippingAddress ? ['', 'Ship to:', ...addressLines(customer.shippingAddress)] : []),
    ];
    text('BILL TO', left, y, { size: 8, bold: true, color: COLORS.muted });
    text('ATTENTION', left + half + 16, y, { size: 8, bold: true, color: COLORS.muted });
    y += 12;
    let by = y;
    billTo.forEach((line, i) => (by = text(line, left, by, { size: i === 0 ? 10 : 8.5, bold: i === 0, width: half })));
    let ay = y;
    attention.forEach((line) => (ay = text(line || ' ', left + half + 16, ay, { size: 8.5, width: half })));
    y = Math.max(by, ay) + 10;

    if (revision.quotation.subject) {
      y = text(`Subject: ${revision.quotation.subject}`, left, y, { size: 9.5, bold: true, width: CONTENT_WIDTH }) + 8;
    }

    // --- Items table (header repeats on every page) ---------------------------
    const tableHeader = () => {
      doc.rect(left, y, CONTENT_WIDTH, 18).fill(COLORS.head);
      let x = left;
      for (const col of COLUMNS) {
        text(col.title, x + 4, y + 5, { size: 8, bold: true, color: COLORS.headText, width: col.width - 8, align: col.align });
        x += col.width;
      }
      y += 18;
    };
    tableHeader();

    revision.items.forEach((item, index) => {
      const itemWidth = COLUMNS[1].width - 8;
      const title = `${item.productName}${item.modelName ? ` — ${item.modelName}` : ''}`;
      const sub = fitItemText(
        [
          [item.brandName, item.modelNumber && `Model no. ${item.modelNumber}`, item.productCode].filter(Boolean).join(' · '),
          item.description ?? '',
          readSpecifications(item.specifications).map((s) => `${s.name}: ${s.value}`).join('; '),
          item.remarks ?? '',
        ].filter(Boolean),
        MAX_ROW_HEIGHT - 10 - heightOf(title, itemWidth, 8.5, true),
        (s) => heightOf(s, itemWidth, 7.5) + 1,
      );
      const discount = item.discountAmount.isZero() ? '—' : `${formatMoney(item.discountAmount, currency)}${item.discountType === 'PERCENT' ? `\n(${item.discountValue.toString()}%)` : ''}`;
      const tax = item.taxRate.isZero() ? '—' : `${formatMoney(item.taxAmount, currency)}\n(${item.taxLabel ? `${item.taxLabel} ` : ''}${item.taxRate.toString()}%)`;
      const cells: Record<string, string> = {
        no: String(index + 1),
        qty: `${item.quantity}\n${item.unit}`,
        rate: formatMoney(item.unitPrice, currency),
        disc: discount,
        tax,
        amount: formatMoney(item.lineTotal, currency),
      };
      const rowHeight =
        Math.max(
          heightOf(title, itemWidth, 8.5, true) + sub.reduce((h, s) => h + heightOf(s, itemWidth, 7.5) + 1, 0),
          ...COLUMNS.filter((c) => c.key !== 'item').map((c) => heightOf(cells[c.key], c.width - 8, 8.5)),
        ) + 10;

      ensureSpace(rowHeight, tableHeader);
      if (index % 2 === 1) doc.rect(left, y, CONTENT_WIDTH, rowHeight).fill(COLORS.zebra);
      let x = left;
      for (const col of COLUMNS) {
        if (col.key === 'item') {
          let iy = text(title, x + 4, y + 5, { size: 8.5, bold: true, width: itemWidth });
          for (const s of sub) iy = text(s, x + 4, iy + 1, { size: 7.5, color: COLORS.muted, width: itemWidth });
        } else {
          text(cells[col.key], x + 4, y + 5, { size: 8.5, width: col.width - 8, align: col.align });
        }
        x += col.width;
      }
      y += rowHeight;
      doc.moveTo(left, y).lineTo(right, y).strokeColor(COLORS.line).lineWidth(0.5).stroke();
    });
    y += 10;

    // --- Totals -----------------------------------------------------------------
    const breakdown = (Array.isArray(revision.taxBreakdown) ? revision.taxBreakdown : []) as unknown as TaxGroup[];
    const totals: Array<[string, string, boolean]> = [
      ['Subtotal', formatMoney(revision.subtotal, currency), false],
      ...(!revision.itemDiscountTotal.isZero() ? ([['Item discounts', `- ${formatMoney(revision.itemDiscountTotal, currency)}`, false]] as Array<[string, string, boolean]>) : []),
      ['Taxable amount', formatMoney(revision.taxableAmount, currency), false],
      ...breakdown.map((g) => [`${g.label} @ ${g.rate}% on ${formatMoney(g.taxable, currency)}`, formatMoney(g.tax, currency), false] as [string, string, boolean]),
      ...(!revision.otherCharges.isZero() ? ([[revision.otherChargesLabel ?? 'Other charges', formatMoney(revision.otherCharges, currency), false]] as Array<[string, string, boolean]>) : []),
      ...(!revision.additionalDiscount.isZero() ? ([['Additional discount', `- ${formatMoney(revision.additionalDiscount, currency)}`, false]] as Array<[string, string, boolean]>) : []),
      [`Grand total (${currency})`, formatMoney(revision.grandTotal, currency), true],
    ];
    const totalsX = left + CONTENT_WIDTH * 0.45;
    const totalsWidth = CONTENT_WIDTH * 0.55;
    ensureSpace(totals.length * 15 + 10);
    for (const [k, v, strong] of totals) {
      if (strong) {
        doc.rect(totalsX, y - 2, totalsWidth, 18).fill('#eef2ff');
        y += 2;
      }
      text(k, totalsX + 6, y, { size: strong ? 10 : 8.5, bold: strong, width: totalsWidth * 0.62 - 6 });
      text(v, totalsX + totalsWidth * 0.62, y, { size: strong ? 10 : 8.5, bold: strong, width: totalsWidth * 0.38 - 6, align: 'right' });
      y += strong ? 18 : 14;
    }
    y += 10;

    // --- Terms ------------------------------------------------------------------
    const sections: Array<[string, string | null]> = [
      ['Payment terms', revision.paymentTerms],
      ['Delivery terms', revision.deliveryTerms],
      ['Warranty', revision.warrantyTerms],
      ['Terms and conditions', revision.termsAndConditions],
      ['Notes', revision.notes],
    ];
    for (const [title, body] of sections) {
      if (!body) continue;
      ensureSpace(14 + Math.min(heightOf(body, CONTENT_WIDTH, 8.5), 60));
      y = text(title, left, y, { size: 9, bold: true }) + 2;
      // Long text flows across pages line by line.
      for (const paragraph of body.split(/\r?\n/)) {
        const h = heightOf(paragraph || ' ', CONTENT_WIDTH, 8.5);
        ensureSpace(h);
        y = text(paragraph || ' ', left, y, { size: 8.5, width: CONTENT_WIDTH });
      }
      y += 8;
    }

    // --- Signature ----------------------------------------------------------------
    ensureSpace(70);
    y += 10;
    const sigX = left + CONTENT_WIDTH * 0.6;
    const sigWidth = CONTENT_WIDTH * 0.4;
    text(company.name ? `For ${company.name}` : 'For the company', sigX, y, { size: 9, bold: true, width: sigWidth, align: 'right' });
    y += 42;
    doc.moveTo(sigX + 20, y).lineTo(right, y).strokeColor(COLORS.ink).lineWidth(0.5).stroke();
    text('Authorised signatory', sigX, y + 4, { size: 8.5, width: sigWidth, align: 'right', color: COLORS.muted });

    // --- Footer and watermark on every page -------------------------------------
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      if (draft) {
        doc.save();
        doc.rotate(-35, { origin: [PAGE.width / 2, PAGE.height / 2] });
        doc.font('Helvetica-Bold').fontSize(96).fillColor('#9ca3af').fillOpacity(0.18)
          .text('DRAFT', 0, PAGE.height / 2 - 48, { width: PAGE.width, align: 'center', lineBreak: false });
        doc.restore();
        doc.fillOpacity(1);
      }
      const footerY = PAGE.height - PAGE.margin - 12;
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted);
      doc.text(`${quotationNumber} · Revision ${revision.revisionNumber}${draft ? ' · DRAFT — not issued' : ''}`, left, footerY, { width: CONTENT_WIDTH / 2, lineBreak: false });
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, left + CONTENT_WIDTH / 2, footerY, { width: CONTENT_WIDTH / 2, align: 'right', lineBreak: false });
    }

    doc.end();
    return done;
  }
}
