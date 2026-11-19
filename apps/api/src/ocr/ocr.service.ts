import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OcrStatus, Prisma } from '@prisma/client';
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
      },
    });

    if (!document || document.archivedAt) {
      throw new NotFoundException(`Document ${documentId} was not found`);
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

      const completed = await this.prisma.ocrJob.update({
        where: { id: job.id },
        data: {
          status: OcrStatus.COMPLETED,
          completedAt: new Date(),
          rawResult: (result.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          normalizedResult: {
            draft: result.draft,
            note: result.note ?? null,
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
