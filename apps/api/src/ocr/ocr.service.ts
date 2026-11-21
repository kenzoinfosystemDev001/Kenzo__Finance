import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DocumentKind, OcrStatus, Prisma } from '@prisma/client';
import { VENDOR_DOCUMENT_KINDS } from '../vendors/dto/vendor-children.dto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import {
  OCR_PROVIDER_TOKEN,
  type OcrProvider,
  type VendorOcrDraft,
} from './ocr-provider.interface';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { findBrandMentions } from './vendor-text-parser';

const ocrJobSelect = {
  id: true,
  status: true,
  provider: true,
  targetType: true,
  normalizedResult: true,
  overallConfidence: true,
  errorMessage: true,
  startedAt: true,
  completedAt: true,
  consumedAt: true,
  resultingVendorId: true,
  createdAt: true,
  document: {
    select: {
      id: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
    },
  },
  requestedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.OcrJobSelect;

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    @Inject(OCR_PROVIDER_TOKEN) private readonly provider: OcrProvider,
  ) {}

  /**
   * Runs extraction for a stored document and returns a reviewable draft.
   *
   * The result is never written to a business table. It becomes a vendor only
   * when a user confirms the review and POSTs /vendors with the job id
   * (docs/01_PRD.md 5.11: OCR output is untrusted input).
   */
  async submitVendorDocument(documentId: string, actor: AuthenticatedUser) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        storageKey: true,
        mimeType: true,
        originalFilename: true,
        archivedAt: true,
        kind: true,
        vendorId: true,
        productId: true,
        customerId: true,
        enquiryId: true,
        quotationId: true,
      },
    });

    if (!document || document.archivedAt) {
      throw new NotFoundException(`Document ${documentId} was not found`);
    }

    // Only an unattached vendor-onboarding upload may be read here. Otherwise
    // `ocr.submit` alone would expose the text of a customer's PAN or a
    // quotation PDF, and confirming the draft would re-home that document
    // onto the new vendor.
    const owned =
      document.vendorId ||
      document.productId ||
      document.customerId ||
      document.enquiryId ||
      document.quotationId;
    if (owned || !(VENDOR_DOCUMENT_KINDS as readonly DocumentKind[]).includes(document.kind)) {
      throw new BadRequestException(
        'Only a newly uploaded vendor document that is not yet attached to a record can be read by OCR.',
      );
    }

    const job = await this.prisma.ocrJob.create({
      data: {
        documentId: document.id,
        targetType: 'VENDOR',
        provider: this.provider.name,
        status: OcrStatus.PROCESSING,
        startedAt: new Date(),
        requestedById: actor.id,
      },
      select: { id: true },
    });

    try {
      const buffer = await this.readDocument(document.storageKey);

      const result = await this.provider.extractVendor({
        buffer,
        mimeType: document.mimeType,
        originalFilename: document.originalFilename,
      });

      // Brands are suggested only from the shared brand master, so a review
      // can preselect existing brands but OCR can never create one.
      const suggestedBrands = result.text
        ? findBrandMentions(
            result.text,
            await this.prisma.company.findMany({
              where: { archivedAt: null, isActive: true },
              select: { id: true, name: true },
            }),
          )
        : [];

      const completed = await this.prisma.ocrJob.update({
        where: { id: job.id },
        data: {
          status: OcrStatus.COMPLETED,
          completedAt: new Date(),
          rawResult: (result.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          normalizedResult: {
            draft: result.draft,
            note: result.note ?? null,
            suggestedBrands,
          } as unknown as Prisma.InputJsonValue,
          overallConfidence: result.overallConfidence,
        },
        select: ocrJobSelect,
      });

      await this.auditService.record({
        actorUserId: actor.id,
        action: 'ocr.submit',
        entityType: 'OcrJob',
        entityId: job.id,
        summary: `Extracted vendor fields from ${document.originalFilename} using ${this.provider.name}`,
      });

      return completed;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown extraction failure';

      this.logger.error(
        `OCR job ${job.id} failed for document ${documentId}`,
        error instanceof Error ? error.stack : String(error),
      );

      // A failed extraction must not lose the upload: the document stays, the
      // job records the failure, and the user can enter details manually.
      const failed = await this.prisma.ocrJob.update({
        where: { id: job.id },
        data: {
          status: OcrStatus.FAILED,
          completedAt: new Date(),
          errorMessage: message.slice(0, 500),
        },
        select: ocrJobSelect,
      });

      await this.auditService.record({
        actorUserId: actor.id,
        action: 'ocr.failed',
        entityType: 'OcrJob',
        entityId: job.id,
        summary: `OCR failed for ${document.originalFilename}: ${message.slice(0, 200)}`,
      });

      return failed;
    }
  }

  /**
   * What the configured engine can do, so the UI can tell users up front
   * whether a scanned card will be read or must be typed in.
   */
  status() {
    const readsScannedDocuments = this.provider.name !== 'stub';
    return {
      provider: this.provider.name,
      readsScannedDocuments,
      message: readsScannedDocuments
        ? 'Scanned documents and photos are read automatically. Always verify the extracted values.'
        : 'No OCR engine is configured. Text files are read automatically; for scanned cards and PDFs the file is stored and you enter the details by hand.',
    };
  }

  async findOne(id: string) {
    const job = await this.prisma.ocrJob.findUnique({
      where: { id },
      select: ocrJobSelect,
    });
    if (!job) throw new NotFoundException(`OCR job ${id} was not found`);
    return job;
  }

  async findAll(params: {
    page: number;
    pageSize: number;
    skip: number;
    take: number;
    status?: OcrStatus;
    unconsumedOnly?: boolean;
  }): Promise<PaginatedResult<unknown>> {
    const where: Prisma.OcrJobWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.unconsumedOnly ? { consumedAt: null } : {}),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.ocrJob.findMany({
        where,
        select: ocrJobSelect,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.ocrJob.count({ where }),
    ]);

    return buildPaginatedResult(items, totalItems, params.page, params.pageSize);
  }

  /**
   * Flattens a stored draft to plain values for prefilling the review form.
   * Returns only fields the provider actually populated.
   */
  extractPrefillValues(normalizedResult: unknown): Record<string, string> {
    const draft = (normalizedResult as { draft?: VendorOcrDraft } | null)?.draft;
    if (!draft) return {};

    const values: Record<string, string> = {};
    for (const [key, field] of Object.entries(draft)) {
      if (field && typeof field === 'object' && 'value' in field && field.value) {
        values[key] = String(field.value);
      }
    }
    return values;
  }

  private async readDocument(storageKey: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const stream = await this.storageService.createReadStream(storageKey);

    return new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (chunk: Buffer | string) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
