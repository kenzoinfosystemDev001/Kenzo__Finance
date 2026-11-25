import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentKind, Prisma } from '@prisma/client';
// Readable, not fs.ReadStream: a remote storage driver (Cloudinary, S3)
// streams over the network and never opens a file descriptor.
import type { Readable } from 'node:stream';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import {
  ALLOWED_UPLOAD_DESCRIPTION,
  detectFileType,
} from '../common/utils/file-validation';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { PERMISSIONS, ROLE_CODES, type PermissionCode } from '../common/authz/permissions';

export interface UploadInput {
  buffer: Buffer;
  originalFilename: string;
  kind?: DocumentKind;
  /** At most one owner is set; the column keeps referential integrity. */
  vendorId?: string;
  productId?: string;
  customerId?: string;
  enquiryId?: string;
  quotationId?: string;
  proformaInvoiceId?: string;
  finalInvoiceId?: string;
  paymentId?: string;
  deliveryId?: string;
  /** The current document this upload supersedes (replacement flow). */
  replacesDocumentId?: string;
}

/** Types a browser can render safely inline. Everything else downloads. */
const INLINE_PREVIEW_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export function canPreviewInline(mimeType: string): boolean {
  return INLINE_PREVIEW_TYPES.has(mimeType);
}

const documentSummarySelect = {
  id: true,
  kind: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  vendorId: true,
  productId: true,
  customerId: true,
  enquiryId: true,
  quotationId: true,
  proformaInvoiceId: true,
  finalInvoiceId: true,
  paymentId: true,
  deliveryId: true,
  replacesDocumentId: true,
  createdAt: true,
  uploadedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.DocumentSelect;

/** Audit parent for a document: the record it is attached to, if any. */
function parentOf(document: { vendorId: string | null; productId: string | null; customerId?: string | null; enquiryId?: string | null; quotationId?: string | null; proformaInvoiceId?: string | null; finalInvoiceId?: string | null; paymentId?: string | null; deliveryId?: string | null }) {
  if (document.deliveryId) return { parentEntityType: 'Delivery', parentEntityId: document.deliveryId };
  if (document.paymentId) return { parentEntityType: 'Payment', parentEntityId: document.paymentId };
  if (document.finalInvoiceId) return { parentEntityType: 'FinalInvoice', parentEntityId: document.finalInvoiceId };
  if (document.proformaInvoiceId) return { parentEntityType: 'ProformaInvoice', parentEntityId: document.proformaInvoiceId };
  if (document.quotationId) return { parentEntityType: 'Quotation', parentEntityId: document.quotationId };
  if (document.enquiryId) return { parentEntityType: 'Enquiry', parentEntityId: document.enquiryId };
  if (document.customerId) return { parentEntityType: 'Customer', parentEntityId: document.customerId };
  if (document.vendorId) return { parentEntityType: 'Vendor', parentEntityId: document.vendorId };
  if (document.productId) return { parentEntityType: 'Product', parentEntityId: document.productId };
  return {};
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async upload(input: UploadInput, actor: AuthenticatedUser) {
    const maxBytes = this.configService.get<number>('UPLOAD_MAX_BYTES', 10485760);

    if (input.buffer.length === 0) {
      throw new BadRequestException('The uploaded file is empty.');
    }

    if (input.buffer.length > maxBytes) {
      throw new PayloadTooLargeException(
        `File exceeds the maximum size of ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
      );
    }

    // Trust the bytes, not the declared MIME type or extension.
    const detected = detectFileType(input.buffer, input.originalFilename);
    if (!detected) {
      throw new UnsupportedMediaTypeException(
        `Unsupported file type. Allowed: ${ALLOWED_UPLOAD_DESCRIPTION}.`,
      );
    }

    if (input.vendorId) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: input.vendorId },
        select: { id: true },
      });
      if (!vendor) throw new BadRequestException('The referenced vendor does not exist.');
    }

    if (input.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: input.productId },
        select: { id: true },
      });
      if (!product) throw new BadRequestException('The referenced product does not exist.');
    }

    if (input.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true },
      });
      if (!customer) throw new BadRequestException('The referenced customer does not exist.');
    }

    if (input.enquiryId) {
      const enquiry = await this.prisma.enquiry.findUnique({ where: { id: input.enquiryId }, select: { id: true } });
      if (!enquiry) throw new BadRequestException('The referenced enquiry does not exist.');
    }

    if (input.quotationId) {
      const quotation = await this.prisma.quotation.findUnique({ where: { id: input.quotationId }, select: { id: true } });
      if (!quotation) throw new BadRequestException('The referenced quotation does not exist.');
    }

    if (input.proformaInvoiceId) {
      const pi = await this.prisma.proformaInvoice.findUnique({ where: { id: input.proformaInvoiceId }, select: { id: true } });
      if (!pi) throw new BadRequestException('The referenced proforma invoice does not exist.');
    }

    if (input.finalInvoiceId) {
      const inv = await this.prisma.finalInvoice.findUnique({ where: { id: input.finalInvoiceId }, select: { id: true } });
      if (!inv) throw new BadRequestException('The referenced invoice does not exist.');
    }

    if (input.paymentId) {
      const payment = await this.prisma.payment.findUnique({ where: { id: input.paymentId }, select: { id: true } });
      if (!payment) throw new BadRequestException('The referenced payment does not exist.');
    }

    if (input.deliveryId) {
      const delivery = await this.prisma.delivery.findUnique({ where: { id: input.deliveryId }, select: { id: true } });
      if (!delivery) throw new BadRequestException('The referenced delivery does not exist.');
    }

    const stored = await this.storageService.save(input.buffer, {
      folder: input.deliveryId
        ? 'deliveries'
        : input.paymentId
        ? 'payments'
        : input.finalInvoiceId
        ? 'final-invoices'
        : input.proformaInvoiceId
        ? 'proforma-invoices'
        : input.quotationId
        ? 'quotations'
        : input.enquiryId
        ? 'enquiries'
        : input.customerId
        ? 'customers'
        : input.productId
        ? 'products'
        : input.kind === DocumentKind.BRANDING_IMAGE
          ? 'branding'
          : 'vendors',
      originalFilename: `file.${detected.extension}`,
      mimeType: detected.mimeType,
    });

    // The new row, the archiving of a replaced file and the audit entry
    // commit together, so a replacement can never leave two current files.
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          kind: input.kind ?? DocumentKind.VENDOR_OTHER,
          originalFilename: this.sanitizeFilename(input.originalFilename),
          storageKey: stored.storageKey,
          mimeType: detected.mimeType,
          sizeBytes: stored.sizeBytes,
          checksumSha256: stored.checksumSha256,
          vendorId: input.vendorId ?? null,
          productId: input.productId ?? null,
          customerId: input.customerId ?? null,
          enquiryId: input.enquiryId ?? null,
          quotationId: input.quotationId ?? null,
          proformaInvoiceId: input.proformaInvoiceId ?? null,
          finalInvoiceId: input.finalInvoiceId ?? null,
          paymentId: input.paymentId ?? null,
          deliveryId: input.deliveryId ?? null,
          replacesDocumentId: input.replacesDocumentId ?? null,
          uploadedById: actor.id,
        },
        select: documentSummarySelect,
      });

      let replacedName: string | null = null;
      if (input.replacesDocumentId) {
        const replaced = await tx.document.update({
          where: { id: input.replacesDocumentId },
          data: { archivedAt: new Date() },
          select: { originalFilename: true },
        });
        replacedName = replaced.originalFilename;
      }

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: input.replacesDocumentId ? 'document.replace' : 'document.upload',
          entityType: 'Document',
          entityId: document.id,
          ...parentOf(document),
          summary: replacedName
            ? `Replaced ${replacedName} with ${document.originalFilename}`
            : `Uploaded ${document.originalFilename} (${document.kind.replace(/_/g, ' ').toLowerCase()})`,
          after: {
            kind: document.kind,
            mimeType: document.mimeType,
            sizeBytes: document.sizeBytes,
            vendorId: document.vendorId,
            customerId: document.customerId,
            enquiryId: document.enquiryId,
            quotationId: document.quotationId,
            productId: document.productId,
            replacesDocumentId: document.replacesDocumentId,
          },
        },
        tx,
      );

      return document;
    });
  }

  async findOne(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        checksumSha256: true,
        vendorId: true,
        deliveryId: true,
        archivedAt: true,
        createdAt: true,
        uploadedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!document) throw new NotFoundException(`Document ${id} was not found`);
    return document;
  }

  async listForVendor(vendorId: string) {
    return this.prisma.document.findMany({
      where: { vendorId, archivedAt: null },
      select: documentSummarySelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Access rule for the generic /documents endpoints.
   *
   * Every module serves its own documents behind its own permissions
   * (customer.read, quotation.read, ...). The generic endpoints only checked
   * document.*, so a role with document.download but no customer access could
   * fetch a customer's KYC file by id, and document.archive could remove a
   * quotation's issued PDF or the sign-in background. Here the document's
   * owner decides what else is required:
   *
   * - read/download: the owning module's read permission
   * - archive: only unattached uploads, or vendor documents with
   *   vendor.manage_documents; anything else is removed from its own record
   */
  async assertGenericAccess(
    id: string,
    user: AuthenticatedUser,
    action: 'read' | 'archive',
  ): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: {
        kind: true,
        vendorId: true,
        productId: true,
        customerId: true,
        enquiryId: true,
        quotationId: true,
      },
    });
    if (!document) throw new NotFoundException(`Document ${id} was not found`);
    if (user.roles.includes(ROLE_CODES.SUPER_ADMIN)) return;

    const has = (permission: PermissionCode) => user.permissions.includes(permission);

    if (action === 'read') {
      const required: PermissionCode | null = document.vendorId
        ? PERMISSIONS.VENDOR_READ
        : document.productId
          ? PERMISSIONS.PRODUCT_READ
          : document.customerId
            ? PERMISSIONS.CUSTOMER_READ
            : document.enquiryId
              ? PERMISSIONS.ENQUIRY_READ
              : document.quotationId
                ? PERMISSIONS.QUOTATION_READ
                : null;
      // Reported as not found, so the endpoint does not confirm the id exists.
      if (required && !has(required)) throw new NotFoundException(`Document ${id} was not found`);
      return;
    }

    const ownedElsewhere =
      document.productId ||
      document.customerId ||
      document.enquiryId ||
      document.quotationId ||
      document.kind === DocumentKind.BRANDING_IMAGE;
    if (ownedElsewhere) {
      throw new BadRequestException(
        'This document belongs to a record. Remove it from that record’s documents instead.',
      );
    }
    if (document.vendorId && !has(PERMISSIONS.VENDOR_MANAGE_DOCUMENTS)) {
      throw new ForbiddenException('Removing vendor documents needs the vendor.manage_documents permission.');
    }
  }

  /** Current (non-archived) document metadata, used for ownership checks. */
  async findActive(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: { ...documentSummarySelect, archivedAt: true },
    });
    if (!document || document.archivedAt) {
      throw new NotFoundException(`Document ${id} was not found`);
    }
    return document;
  }

  /**
   * Returns a stream for a permission-checked download. Nothing in the storage
   * root is statically served, so this is the only way out of storage.
   */
  async openForDownload(
    id: string,
    actor: AuthenticatedUser,
    options: { preview?: boolean } = {},
  ): Promise<{
    stream: Readable;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    /** True only when a preview was asked for and the type is safe inline. */
    inline: boolean;
  }> {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document || document.archivedAt) {
      throw new NotFoundException(`Document ${id} was not found`);
    }

    const inline = Boolean(options.preview) && canPreviewInline(document.mimeType);

    await this.auditService.record({
      actorUserId: actor.id,
      action: inline ? 'document.preview' : 'document.download',
      entityType: 'Document',
      entityId: id,
      ...parentOf(document),
      summary: `${inline ? 'Previewed' : 'Downloaded'} ${document.originalFilename}`,
    });

    return {
      stream: await this.storageService.createReadStream(document.storageKey),
      filename: document.originalFilename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      inline,
    };
  }

  async archive(id: string, actor: AuthenticatedUser) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) throw new NotFoundException(`Document ${id} was not found`);
    if (document.archivedAt) {
      throw new BadRequestException('This document is already archived.');
    }

    // Metadata is retained and the stored file is kept: a document referenced
    // by an OCR job or a vendor record must stay auditable.
    const archived = await this.prisma.document.update({
      where: { id },
      data: { archivedAt: new Date() },
      select: { id: true, originalFilename: true, archivedAt: true },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'document.archive',
      entityType: 'Document',
      entityId: id,
      ...parentOf(document),
      summary: `Removed ${archived.originalFilename}`,
    });

    return archived;
  }

  /** Strips path separators; the stored name is display-only metadata. */
  private sanitizeFilename(filename: string): string {
    const base = filename.replace(/^.*[\\/]/, '').trim();
    const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, '');
    return cleaned.slice(0, 255) || 'document';
  }
}
