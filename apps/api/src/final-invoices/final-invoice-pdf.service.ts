import { Injectable, Logger } from '@nestjs/common';
import { DocumentKind, Prisma } from '@prisma/client';
import { PassThrough, type Readable } from 'node:stream';
import { PrismaService } from '../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { BRANDING_SETTING_KEYS, SettingsService } from '../settings/settings.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { pdfDay, renderCommercialPdf, type PdfCompanyProfile, type PdfCustomerSnapshot } from '../common/pdf/commercial-pdf';

const invoiceForPdf = {
  items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  proformaInvoice: { select: { piNumber: true, piDate: true } },
  quotation: { select: { quotationNumber: true } },
} satisfies Prisma.FinalInvoiceInclude;
type InvoiceForPdf = Prisma.FinalInvoiceGetPayload<{ include: typeof invoiceForPdf }>;
type Bank = { bankName?: string; accountName?: string; accountNumber?: string; ifsc?: string; swift?: string; branch?: string };

const fileBase = (inv: { invoiceNumber: string | null; id: string }) => (inv.invoiceNumber ?? `invoice-draft-${inv.id.slice(0, 8)}`).replace(/[\\/]/g, '-');

/**
 * A4 invoice PDF built only from the invoice's own snapshot. An issued
 * invoice is rendered once and stored (FINAL_INVOICE_PDF); every download
 * returns those bytes, so later changes to company or customer data never
 * rewrite an issued invoice. An unissued invoice renders on demand with a
 * DRAFT watermark and is not stored.
 */
@Injectable()
export class FinalInvoicePdfService {
  private readonly logger = new Logger(FinalInvoicePdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
    private readonly settingsService: SettingsService,
  ) {}

  async open(id: string, actor: AuthenticatedUser): Promise<{ stream: Readable; filename: string; mimeType: string; sizeBytes: number; inline: boolean }> {
    const inv = await this.prisma.finalInvoice.findUniqueOrThrow({ where: { id }, include: invoiceForPdf });
    const filename = `${fileBase(inv)}${inv.issuedAt ? '' : '-DRAFT'}.pdf`;
    if (inv.issuedAt) {
      const documentId = inv.pdfDocumentId ?? (await this.storeIssued(inv, actor));
      const file = await this.documentsService.openForDownload(documentId, actor, { preview: false });
      return { ...file, filename };
    }
    const buffer = await this.render(inv);
    const stream = new PassThrough();
    stream.end(buffer);
    return { stream, filename, mimeType: 'application/pdf', sizeBytes: buffer.length, inline: false };
  }

  /** Stores the PDF of an issued invoice; safe to call more than once (first stored copy wins). */
  async storeIssued(inv: InvoiceForPdf, actor: AuthenticatedUser): Promise<string> {
    const buffer = await this.render(inv);
    const document = await this.documentsService.upload({ buffer, originalFilename: `${fileBase(inv)}.pdf`, kind: DocumentKind.FINAL_INVOICE_PDF, finalInvoiceId: inv.id }, actor);
    const linked = await this.prisma.finalInvoice.updateMany({ where: { id: inv.id, pdfDocumentId: null }, data: { pdfDocumentId: document.id } });
    if (linked.count === 0) {
      await this.documentsService.archive(document.id, actor);
      const current = await this.prisma.finalInvoice.findUniqueOrThrow({ where: { id: inv.id }, select: { pdfDocumentId: true } });
      return current.pdfDocumentId!;
    }
    return document.id;
  }

  async storeIssuedById(id: string, actor: AuthenticatedUser): Promise<void> {
    try {
      const inv = await this.prisma.finalInvoice.findUnique({ where: { id }, include: invoiceForPdf });
      if (inv?.issuedAt && !inv.pdfDocumentId) await this.storeIssued(inv, actor);
    } catch (error) {
      this.logger.warn(`Could not store the PDF for final invoice ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async render(inv: InvoiceForPdf): Promise<Buffer> {
    const company = ((await this.settingsService.get<PdfCompanyProfile | null>(BRANDING_SETTING_KEYS.COMPANY_PROFILE)) ?? {}) as PdfCompanyProfile;
    const bank = (inv.bankDetails ?? {}) as Bank;
    const bankRows = ([
      ['Bank', bank.bankName],
      ['Account name', bank.accountName],
      ['Account number', bank.accountNumber],
      ['IFSC', bank.ifsc],
      ['SWIFT / BIC', bank.swift],
      ['Branch', bank.branch],
    ] as Array<[string, string | undefined]>).filter((row): row is [string, string] => Boolean(row[1]));
    // Watermark follows issuance, not status: an invoice cancelled after issue keeps its real (issued) PDF.
    const draft = !inv.issuedAt;
    const number = inv.invoiceNumber ?? 'Not yet issued';
    return renderCommercialPdf({
      heading: 'INVOICE',
      reference: `Invoice ${number}`,
      pdfTitle: `Invoice ${number}`,
      subject: inv.subject,
      meta: [
        ['Invoice No.', number],
        ['Invoice date', pdfDay(inv.invoiceDate)],
        ...(inv.dueDate ? ([['Due date', pdfDay(inv.dueDate)]] as Array<[string, string]>) : []),
        ...(inv.purchaseOrderNumber ? ([['Your PO No.', inv.purchaseOrderNumber]] as Array<[string, string]>) : []),
        ['Proforma inv.', `${inv.proformaInvoice.piNumber} (${pdfDay(inv.proformaInvoice.piDate)})`],
        ['Quotation', inv.quotation.quotationNumber],
        ['Currency', inv.currency],
      ],
      company,
      customer: (inv.customerSnapshot ?? {}) as PdfCustomerSnapshot,
      currency: inv.currency,
      items: inv.items,
      totals: inv,
      blocks: [{ title: 'Payment details', rows: bankRows }],
      sections: [
        ['Payment instructions', inv.paymentInstructions],
        ['Payment terms', inv.paymentTerms],
        ['Delivery terms', inv.deliveryTerms],
        ['Warranty', inv.warrantyTerms],
        ['Terms and conditions', inv.termsAndConditions],
        ['Notes', inv.notes],
      ],
      draft,
      draftLabel: inv.status === 'CANCELLED' ? 'CANCELLED — never issued' : 'DRAFT — not issued',
    });
  }
}
