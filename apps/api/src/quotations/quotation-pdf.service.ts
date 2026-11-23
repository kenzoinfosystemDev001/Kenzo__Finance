import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { DocumentKind, Prisma } from '@prisma/client';
import { PassThrough, type Readable } from 'node:stream';
import { PrismaService } from '../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { BRANDING_SETTING_KEYS, SettingsService } from '../settings/settings.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import {
  pdfDay,
  renderCommercialPdf,
  type PdfCompanyProfile,
  type PdfCustomerSnapshot,
} from '../common/pdf/commercial-pdf';

export { formatMoney } from '../common/pdf/commercial-pdf';

/** Filename for a quotation revision's PDF, used by both the download and the email attachment. */
export function quotationPdfFilename(quotationNumber: string, revisionNumber: number, draft: boolean): string {
  const safeNumber = quotationNumber.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'quotation';
  return `Quotation-${safeNumber}-R${revisionNumber}${draft ? '-DRAFT' : ''}.pdf`;
}

const revisionForPdf = {
  items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  quotation: { select: { id: true, quotationNumber: true, currency: true, subject: true, referenceNumber: true, enquiry: { select: { enquiryNumber: true } }, assignedTo: { select: { fullName: true } } } },
} satisfies Prisma.QuotationRevisionInclude;
type RevisionForPdf = Prisma.QuotationRevisionGetPayload<{ include: typeof revisionForPdf }>;

/**
 * Server-side A4 quotation PDF built only from a revision's stored snapshot
 * (customer details, item names, prices and totals as they were issued), so
 * later master-data changes never alter an issued quotation. Layout is the
 * shared commercial-document renderer (also used by proforma invoices).
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
    const filename = quotationPdfFilename(revision.quotation.quotationNumber, revision.revisionNumber, !revision.issuedAt);

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

  /**
   * The exact stored PDF of an issued revision, as bytes. The email attachment
   * uses this, so the attached file is the same document as the download.
   */
  async issuedBuffer(quotationId: string, revisionNumber: number, actor: AuthenticatedUser): Promise<Buffer> {
    const revision = await this.load(quotationId, revisionNumber);
    if (!revision.issuedAt) {
      throw new UnprocessableEntityException('Only issued quotation revisions have a stored PDF.');
    }
    const documentId = revision.pdfDocumentId ?? (await this.storeIssued(revision, actor));
    const file = await this.documentsService.openForDownload(documentId, actor, { preview: false });
    const chunks: Buffer[] = [];
    for await (const chunk of file.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
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

  async render(revision: RevisionForPdf, draft: boolean): Promise<Buffer> {
    const company = ((await this.settingsService.get<PdfCompanyProfile | null>(BRANDING_SETTING_KEYS.COMPANY_PROFILE)) ?? {}) as PdfCompanyProfile;
    const { quotationNumber, currency } = revision.quotation;
    return renderCommercialPdf({
      heading: 'QUOTATION',
      reference: `Quotation ${quotationNumber} · Revision ${revision.revisionNumber}`,
      pdfTitle: `Quotation ${quotationNumber} R${revision.revisionNumber}`,
      subject: revision.quotation.subject,
      meta: [
        ['Quotation No.', quotationNumber],
        ['Revision', String(revision.revisionNumber)],
        ['Date', pdfDay(revision.quotationDate)],
        ['Valid until', pdfDay(revision.validUntil)],
        ...(revision.quotation.enquiry ? ([['Enquiry', revision.quotation.enquiry.enquiryNumber]] as Array<[string, string]>) : []),
        ...(revision.quotation.referenceNumber ? ([['Your reference', revision.quotation.referenceNumber]] as Array<[string, string]>) : []),
        ['Currency', currency],
      ],
      company,
      customer: (revision.customerSnapshot ?? {}) as PdfCustomerSnapshot,
      currency,
      items: revision.items,
      totals: revision,
      sections: [
        ['Payment terms', revision.paymentTerms],
        ['Delivery terms', revision.deliveryTerms],
        ['Warranty', revision.warrantyTerms],
        ['Terms and conditions', revision.termsAndConditions],
        ['Notes', revision.notes],
      ],
      draft,
    });
  }
}
