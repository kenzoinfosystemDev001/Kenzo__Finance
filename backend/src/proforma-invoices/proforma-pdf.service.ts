import { Injectable, Logger } from '@nestjs/common';
import { DocumentKind, Prisma } from '@prisma/client';
import { PassThrough, type Readable } from 'node:stream';
import { PrismaService } from '../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { BRANDING_SETTING_KEYS, SettingsService } from '../settings/settings.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import {
  formatMoney,
  pdfDay,
  renderCommercialPdf,
  type PdfCompanyProfile,
  type PdfCustomerSnapshot,
} from '../common/pdf/commercial-pdf';

export const proformaForPdf = {
  items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  quotation: { select: { quotationNumber: true, enquiry: { select: { enquiryNumber: true } } } },
  quotationRevision: { select: { revisionNumber: true } },
} satisfies Prisma.ProformaInvoiceInclude;
type ProformaForPdf = Prisma.ProformaInvoiceGetPayload<{ include: typeof proformaForPdf }>;

export type BankDetails = { bankName?: string; accountName?: string; accountNumber?: string; ifsc?: string; swift?: string; branch?: string };

const fileBase = (pi: { piNumber: string }) => `Proforma-Invoice_${pi.piNumber.replace(/[\\/]/g, '-')}`;

/**
 * A4 proforma invoice PDF, built only from the PI's own snapshot (customer,
 * lines, totals, terms and bank details as stored on the PI).
 *
 * An issued PI is rendered once and stored as a PROFORMA_PDF document; every
 * later download returns those exact bytes, so a later change to the company
 * profile or bank settings never alters an issued document. A PI that was
 * never issued renders on demand with a DRAFT watermark and is not stored.
 */
@Injectable()
export class ProformaPdfService {
  private readonly logger = new Logger(ProformaPdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
    private readonly settingsService: SettingsService,
  ) {}

  async open(id: string, actor: AuthenticatedUser): Promise<{ stream: Readable; filename: string; mimeType: string; sizeBytes: number; inline: boolean }> {
    const pi = await this.prisma.proformaInvoice.findUniqueOrThrow({ where: { id }, include: proformaForPdf });
    const issued = Boolean(pi.issuedAt);
    const filename = `${fileBase(pi)}${issued ? '' : '-DRAFT'}${pi.status === 'CANCELLED' && !issued ? '-CANCELLED' : ''}.pdf`;

    if (issued) {
      const documentId = pi.pdfDocumentId ?? (await this.storeIssued(pi, actor));
      const file = await this.documentsService.openForDownload(documentId, actor, { preview: false });
      return { ...file, filename };
    }

    const buffer = await this.render(pi, true);
    const stream = new PassThrough();
    stream.end(buffer);
    return { stream, filename, mimeType: 'application/pdf', sizeBytes: buffer.length, inline: false };
  }

  /** Stores the PDF of an issued PI; safe to call more than once (first stored copy wins). */
  async storeIssued(pi: ProformaForPdf, actor: AuthenticatedUser): Promise<string> {
    const buffer = await this.render(pi, false);
    const document = await this.documentsService.upload(
      { buffer, originalFilename: `${fileBase(pi)}.pdf`, kind: DocumentKind.PROFORMA_PDF, proformaInvoiceId: pi.id },
      actor,
    );
    const linked = await this.prisma.proformaInvoice.updateMany({ where: { id: pi.id, pdfDocumentId: null }, data: { pdfDocumentId: document.id } });
    if (linked.count === 0) {
      await this.documentsService.archive(document.id, actor);
      const current = await this.prisma.proformaInvoice.findUniqueOrThrow({ where: { id: pi.id }, select: { pdfDocumentId: true } });
      return current.pdfDocumentId!;
    }
    return document.id;
  }

  /** Called right after issue; a failure only defers storing to the first download. */
  async storeIssuedById(id: string, actor: AuthenticatedUser): Promise<void> {
    try {
      const pi = await this.prisma.proformaInvoice.findUnique({ where: { id }, include: proformaForPdf });
      if (pi?.issuedAt && !pi.pdfDocumentId) await this.storeIssued(pi, actor);
    } catch (error) {
      this.logger.warn(`Could not store the PDF for proforma invoice ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async render(pi: ProformaForPdf, draft: boolean): Promise<Buffer> {
    const company = ((await this.settingsService.get<PdfCompanyProfile | null>(BRANDING_SETTING_KEYS.COMPANY_PROFILE)) ?? {}) as PdfCompanyProfile;
    const bank = (pi.bankDetails ?? {}) as BankDetails;
    const bankRows: Array<[string, string]> = (
      [
        ['Bank', bank.bankName],
        ['Account name', bank.accountName],
        ['Account number', bank.accountNumber],
        ['IFSC', bank.ifsc],
        ['SWIFT / BIC', bank.swift],
        ['Branch', bank.branch],
      ] as Array<[string, string | undefined]>
    ).filter((row): row is [string, string] => Boolean(row[1]));

    const afterTotals: Array<[string, string]> = [];
    if (pi.advanceAmount && !pi.advanceAmount.isZero()) {
      afterTotals.push([`Advance payable (${pi.currency})`, formatMoney(pi.advanceAmount, pi.currency)]);
      afterTotals.push([`Balance (${pi.currency})`, formatMoney(pi.grandTotal.minus(pi.advanceAmount), pi.currency)]);
    }

    const cancelled = pi.status === 'CANCELLED';
    return renderCommercialPdf({
      heading: 'PROFORMA INVOICE',
      reference: `Proforma Invoice ${pi.piNumber}`,
      pdfTitle: `Proforma Invoice ${pi.piNumber}`,
      subject: pi.subject,
      meta: [
        ['PI No.', pi.piNumber],
        ['PI date', pdfDay(pi.piDate)],
        ...(pi.dueDate ? ([['Payment due', pdfDay(pi.dueDate)]] as Array<[string, string]>) : []),
        ['Quotation', `${pi.quotation.quotationNumber} (Rev. ${pi.quotationRevision.revisionNumber})`],
        ...(pi.quotation.enquiry ? ([['Enquiry', pi.quotation.enquiry.enquiryNumber]] as Array<[string, string]>) : []),
        ...(pi.referenceNumber ? ([['Your reference', pi.referenceNumber]] as Array<[string, string]>) : []),
        ['Currency', pi.currency],
      ],
      company,
      customer: (pi.customerSnapshot ?? {}) as PdfCustomerSnapshot,
      currency: pi.currency,
      items: pi.items,
      totals: pi,
      afterTotals,
      blocks: [{ title: 'Payment details', rows: bankRows }],
      sections: [
        ['Payment instructions', pi.paymentInstructions],
        ['Payment terms', pi.paymentTerms],
        ['Delivery terms', pi.deliveryTerms],
        ['Warranty', pi.warrantyTerms],
        ['Terms and conditions', pi.termsAndConditions],
        ['Notes', pi.notes],
      ],
      // Watermark follows issuance, not status: a PI cancelled after issue keeps its real PDF.
      draft: draft || !pi.issuedAt,
      draftLabel: cancelled ? 'CANCELLED — never issued' : 'DRAFT — not issued',
    });
  }
}
