import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface AuditEntry {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Aggregate the entity belongs to, e.g. the Vendor of a VendorContact. */
  parentEntityType?: string | null;
  parentEntityId?: string | null;
  summary?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Field names never written into audit payloads. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'tokenHash',
  'refreshToken',
  'accessToken',
  'secret',
  'apiKey',
]);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an audit entry.
   *
   * When a transaction client is supplied the entry is written inside that
   * transaction, so the audit row and the business change commit or roll back
   * together - an audit log that records changes which never happened is
   * worse than no audit log.
   */
  async record(
    entry: AuditEntry,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    const data: Prisma.AuditLogUncheckedCreateInput = {
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      parentEntityType: entry.parentEntityType ?? null,
      parentEntityId: entry.parentEntityId ?? null,
      summary: entry.summary ?? null,
      before: this.sanitize(entry.before),
      after: this.sanitize(entry.after),
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    };

    if (tx) {
      await client.auditLog.create({ data });
      return;
    }

    // Outside a transaction, a failed audit write must not fail the request
    // that already succeeded; it is logged for operational follow-up instead.
    try {
      await client.auditLog.create({ data });
    } catch (error) {
      this.logger.error(
        `Failed to write audit entry ${entry.action} for ${entry.entityType}:${entry.entityId ?? '-'}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private sanitize(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) return Prisma.JsonNull;

    const walk = (input: unknown): unknown => {
      if (input === null || typeof input !== 'object') return input;
      if (input instanceof Date) return input.toISOString();
      if (Array.isArray(input)) return input.map(walk);

      const output: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(input)) {
        output[key] = REDACTED_KEYS.has(key) ? '[redacted]' : walk(nested);
      }
      return output;
    };

    return walk(value) as Prisma.InputJsonValue;
  }
}
