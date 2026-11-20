import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { readSpecifications } from '../../products/product-specs';

/**
 * Shared A4 renderer for customer-facing commercial documents (quotations,
 * proforma invoices). It draws only what it is given - always a stored
 * snapshot - so later master-data changes never alter an issued document.
 *
 * Layout guarantees: the item table header repeats on every page, long item
 * text is split across pages at word boundaries (never drawn over the next
 * row), totals rows advance by their measured height, and every page carries
 * a footer with the document reference and "Page x of y".
 */

export type PdfAddress = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
} | null;

export type PdfCustomerSnapshot = {
  customerCode?: string;
  name?: string;
  contactName?: string | null;
  contactDesignation?: string | null;
  phone?: string | null;
  email?: string | null;
  billingAddress?: PdfAddress;
  shippingAddress?: PdfAddress;
  gstin?: string | null;
  pan?: string | null;
  taxRegistrationNumber?: string | null;
};

export type PdfCompanyProfile = { name?: string; address?: string; phone?: string; email?: string; website?: string; gstin?: string; pan?: string };
export type PdfTaxGroup = { label: string; rate: string; taxable: string; tax: string };

export interface PdfItem {
  productName: string;
  modelName: string | null;
  brandName: string;
  modelNumber: string | null;
  productCode: string;
  description: string | null;
  specifications: Prisma.JsonValue | null;
  remarks: string | null;
  quantity: number;
  unit: string;
  unitPrice: Prisma.Decimal;
  discountType: string;
  discountValue: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxLabel: string | null;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

export interface PdfTotals {
  subtotal: Prisma.Decimal;
  itemDiscountTotal: Prisma.Decimal;
  taxableAmount: Prisma.Decimal;
  taxBreakdown: Prisma.JsonValue | null;
  otherChargesLabel: string | null;
  otherCharges: Prisma.Decimal;
  additionalDiscount: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
}

export interface CommercialPdfInput {
  /** Big heading on the letterhead, e.g. "QUOTATION". */
  heading: string;
  /** Short reference for continuation headers and footers, e.g. "Quotation KI/QT/00001 · Revision 2". */
  reference: string;
  /** PDF metadata title. */
  pdfTitle: string;
  subject: string | null;
  /** Label/value rows printed under the heading. */
  meta: Array<[string, string]>;
  company: PdfCompanyProfile;
  customer: PdfCustomerSnapshot;
  currency: string;
  items: PdfItem[];
  totals: PdfTotals;
  /** Extra rows after the grand total (e.g. advance payable). */
  afterTotals?: Array<[string, string]>;
  /** Label/value blocks after the totals (e.g. payment details). */
  blocks?: Array<{ title: string; rows: Array<[string, string]> }>;
  /** Free-text sections (terms); empty ones are skipped. */
  sections: Array<[string, string | null]>;
  /** Watermark and footer marker for a document that was never issued. */
  draft: boolean;
  draftLabel?: string;
}

// A4 in points, 40pt margins.
const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
const BOTTOM = PAGE.height - PAGE.margin - 24; // room for the footer
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

/** Exact digit grouping from a fixed 2-dp string (no float conversion); Indian grouping for INR. */
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

/** dd-mm-yyyy of a date-only value. */
export const pdfDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10).split('-').reverse().join('-') : '—');

const addressLines = (a: PdfAddress) =>
  a ? [a.addressLine1, a.addressLine2, [a.city, a.state, a.postalCode].filter(Boolean).join(', '), a.country].filter((v): v is string => Boolean(v && v.trim())) : [];

export function renderCommercialPdf(input: CommercialPdfInput): Promise<Buffer> {
  const { company, customer, currency, totals } = input;

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin },
    bufferPages: true,
    info: { Title: input.pdfTitle, Author: company.name ?? '', Subject: input.subject ?? '' },
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
    text(input.reference, left + CONTENT_WIDTH / 2, y, { size: 9, width: CONTENT_WIDTH / 2, align: 'right', color: COLORS.muted });
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
  let rightY = text(input.heading, metaX, y, { size: 16, bold: true, width: metaWidth, align: 'right' });
  rightY += 4;
  for (const [k, v] of input.meta) {
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

  if (input.subject) {
    y = text(`Subject: ${input.subject}`, left, y, { size: 9.5, bold: true, width: CONTENT_WIDTH }) + 8;
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

  // First row position on a continuation page: continuationHeader (28) + table header (18).
  const freshTop = PAGE.margin + 28 + 18;
  /** Largest block drawn in one piece; anything taller is split at word boundaries. */
  const maxPiece = (BOTTOM - freshTop) / 3;
  /**
   * Splits text into paragraphs, and a paragraph taller than maxPiece into
   * word-wrapped chunks, so every piece fits on a page. Without this PDFKit
   * pages long text by itself while the table keeps drawing at the old y,
   * producing overlapping rows.
   */
  const splitText = (value: string, width: number, size: number, bold = false): string[] => {
    const out: string[] = [];
    for (const paragraph of value.split(/\r?\n/)) {
      const para = paragraph || ' ';
      if (heightOf(para, width, size, bold) <= maxPiece) {
        out.push(para);
        continue;
      }
      let buffer = '';
      for (const word of para.split(/(\s+)/)) {
        const next = buffer + word;
        if (buffer.trim() && heightOf(next, width, size, bold) > maxPiece) {
          out.push(buffer.trimEnd());
          buffer = word.trimStart();
        } else {
          buffer = next;
        }
      }
      if (buffer.trim()) out.push(buffer);
    }
    return out;
  };
  type Piece = { value: string; size: number; bold: boolean; color: string; height: number };

  input.items.forEach((item, index) => {
    const itemWidth = COLUMNS[1].width - 8;
    const title = `${item.productName}${item.modelName ? ` — ${item.modelName}` : ''}`;
    const sub = [
      [item.brandName, item.modelNumber && `Model no. ${item.modelNumber}`, item.productCode].filter(Boolean).join(' · '),
      item.description ?? '',
      readSpecifications(item.specifications).map((s) => `${s.name}: ${s.value}`).join('; '),
      item.remarks ?? '',
    ].filter(Boolean);
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
    const cellsHeight = Math.max(...COLUMNS.filter((c) => c.key !== 'item').map((c) => heightOf(cells[c.key], c.width - 8, 8.5)));

    // Layout pass: split the item cell into page-sized segments.
    const pieces: Piece[] = [
      ...splitText(title, itemWidth, 8.5, true).map((value) => ({ value, size: 8.5, bold: true, color: COLORS.ink, height: 0 })),
      ...sub.flatMap((part) => splitText(part, itemWidth, 7.5).map((value) => ({ value, size: 7.5, bold: false, color: COLORS.muted, height: 0 }))),
    ];
    for (const piece of pieces) piece.height = heightOf(piece.value, itemWidth, piece.size, piece.bold) + 1;

    const startOnNewPage = y + Math.max(cellsHeight, pieces[0].height) + 10 > BOTTOM;
    const segments: Array<{ pieces: Piece[]; height: number }> = [];
    let top = startOnNewPage ? freshTop : y;
    let current = { pieces: [] as Piece[], height: 10 };
    for (const piece of pieces) {
      if (current.pieces.length && top + current.height + piece.height > BOTTOM) {
        segments.push(current);
        top = freshTop;
        current = { pieces: [], height: 10 };
      }
      current.pieces.push(piece);
      current.height += piece.height;
    }
    segments.push(current);
    segments[0].height = Math.max(segments[0].height, cellsHeight + 10);

    // Draw pass. The numeric cells appear once, on the item's first segment.
    segments.forEach((segment, segmentIndex) => {
      if (segmentIndex > 0 || startOnNewPage) {
        doc.addPage();
        continuationHeader();
        tableHeader();
      }
      if (index % 2 === 1) doc.rect(left, y, CONTENT_WIDTH, segment.height).fill(COLORS.zebra);
      let x = left;
      for (const col of COLUMNS) {
        if (col.key === 'item') {
          let iy = y + 5;
          for (const piece of segment.pieces) {
            text(piece.value, x + 4, iy, { size: piece.size, bold: piece.bold, color: piece.color, width: itemWidth });
            iy += piece.height;
          }
        } else if (segmentIndex === 0) {
          text(cells[col.key], x + 4, y + 5, { size: 8.5, width: col.width - 8, align: col.align });
        }
        x += col.width;
      }
      y += segment.height;
      doc.moveTo(left, y).lineTo(right, y).strokeColor(COLORS.line).lineWidth(0.5).stroke();
    });
  });
  y += 10;

  // --- Totals -----------------------------------------------------------------
  const breakdown = (Array.isArray(totals.taxBreakdown) ? totals.taxBreakdown : []) as unknown as PdfTaxGroup[];
  const rows: Array<[string, string, boolean]> = [
    ['Subtotal', formatMoney(totals.subtotal, currency), false],
    ...(!totals.itemDiscountTotal.isZero() ? ([['Item discounts', `- ${formatMoney(totals.itemDiscountTotal, currency)}`, false]] as Array<[string, string, boolean]>) : []),
    ['Taxable amount', formatMoney(totals.taxableAmount, currency), false],
    ...breakdown.map((g) => [`${g.label} @ ${g.rate}% on ${formatMoney(g.taxable, currency)}`, formatMoney(g.tax, currency), false] as [string, string, boolean]),
    ...(!totals.otherCharges.isZero() ? ([[totals.otherChargesLabel ?? 'Other charges', formatMoney(totals.otherCharges, currency), false]] as Array<[string, string, boolean]>) : []),
    ...(!totals.additionalDiscount.isZero() ? ([['Additional discount', `- ${formatMoney(totals.additionalDiscount, currency)}`, false]] as Array<[string, string, boolean]>) : []),
    [`Grand total (${currency})`, formatMoney(totals.grandTotal, currency), true],
    ...(input.afterTotals ?? []).map(([k, v]) => [k, v, false] as [string, string, boolean]),
  ];
  const totalsX = left + CONTENT_WIDTH * 0.45;
  const totalsWidth = CONTENT_WIDTH * 0.55;
  // Each row advances by its measured height, so a wrapped label (a long
  // tax or charges label) never overprints the next row.
  const labelWidth = totalsWidth * 0.62 - 6;
  const valueWidth = totalsWidth * 0.38 - 6;
  const totalsRows = rows.map(([k, v, strong]) => {
    const size = strong ? 10 : 8.5;
    const height = Math.max(heightOf(k, labelWidth, size, strong), heightOf(v, valueWidth, size, strong)) + (strong ? 8 : 4);
    return { k, v, strong, size, height };
  });
  // Keep the totals block together when it fits on one page.
  ensureSpace(Math.min(totalsRows.reduce((h, r) => h + r.height, 0) + 10, BOTTOM - freshTop));
  for (const { k, v, strong, size, height } of totalsRows) {
    ensureSpace(height);
    if (strong) {
      doc.rect(totalsX, y - 2, totalsWidth, height).fill('#eef2ff');
      y += 2;
    }
    text(k, totalsX + 6, y, { size, bold: strong, width: labelWidth });
    text(v, totalsX + totalsWidth * 0.62, y, { size, bold: strong, width: valueWidth, align: 'right' });
    y += strong ? height - 2 : height;
  }
  y += 10;

  // --- Label/value blocks (e.g. payment details) ---------------------------------
  for (const block of input.blocks ?? []) {
    if (!block.rows.length) continue;
    const keyWidth = CONTENT_WIDTH * 0.28;
    const valWidth = CONTENT_WIDTH - keyWidth - 8;
    const measured = block.rows.map(([k, v]) => ({ k, v, h: Math.max(heightOf(k, keyWidth, 8.5), heightOf(v, valWidth, 8.5, true)) + 3 }));
    ensureSpace(Math.min(16 + measured.reduce((h, r) => h + r.h, 0), BOTTOM - freshTop));
    y = text(block.title, left, y, { size: 9, bold: true }) + 3;
    for (const { k, v, h } of measured) {
      ensureSpace(h);
      text(k, left, y, { size: 8.5, color: COLORS.muted, width: keyWidth });
      text(v, left + keyWidth + 8, y, { size: 8.5, bold: true, width: valWidth });
      y += h;
    }
    y += 8;
  }

  // --- Terms ------------------------------------------------------------------
  for (const [title, body] of input.sections) {
    if (!body) continue;
    ensureSpace(14 + Math.min(heightOf(body, CONTENT_WIDTH, 8.5), 60));
    y = text(title, left, y, { size: 9, bold: true }) + 2;
    // Long text flows across pages line by line.
    for (const paragraph of splitText(body, CONTENT_WIDTH, 8.5)) {
      ensureSpace(heightOf(paragraph, CONTENT_WIDTH, 8.5));
      y = text(paragraph, left, y, { size: 8.5, width: CONTENT_WIDTH });
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
    if (input.draft) {
      doc.save();
      doc.rotate(-35, { origin: [PAGE.width / 2, PAGE.height / 2] });
      doc.font('Helvetica-Bold').fontSize(96).fillColor('#9ca3af').fillOpacity(0.18)
        .text('DRAFT', 0, PAGE.height / 2 - 48, { width: PAGE.width, align: 'center', lineBreak: false });
      doc.restore();
      doc.fillOpacity(1);
    }
    const footerY = PAGE.height - PAGE.margin - 12;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted);
    doc.text(`${input.reference}${input.draft ? ` · ${input.draftLabel ?? 'DRAFT — not issued'}` : ''}`, left, footerY, { width: CONTENT_WIDTH * 0.7, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, left + CONTENT_WIDTH * 0.7, footerY, { width: CONTENT_WIDTH * 0.3, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
