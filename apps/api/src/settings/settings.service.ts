import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

/**
 * Runtime configuration keys.
 *
 * These are business switches, not deployment config: changing one must not
 * require a redeploy, and the current value must be auditable.
 */
export const SETTING_KEYS = {
  /**
   * Whether physical stock quantities are tracked at all.
   *
   * Defaults to FALSE because the client has not confirmed catalogue-only vs
   * physical stock tracking (docs/01_PRD.md section 10, question 1). While it
   * is off the catalogue behaves exactly as before and no stock movement can
   * be posted.
   */
  STOCK_TRACKING_ENABLED: 'inventory.stockTrackingEnabled',

  /**
   * Whether a movement may drive on-hand below zero.
   *
   * Defaults to FALSE: negative physical stock is almost always a data-entry
   * error, and no approved rule permits it.
   */
  ALLOW_NEGATIVE_STOCK: 'inventory.allowNegativeStock',
} as const;

export const SETTING_DEFAULTS: Record<string, unknown> = {
  [SETTING_KEYS.STOCK_TRACKING_ENABLED]: false,
  [SETTING_KEYS.ALLOW_NEGATIVE_STOCK]: false,
};

export const SETTING_DESCRIPTIONS: Record<string, string> = {
  [SETTING_KEYS.STOCK_TRACKING_ENABLED]:
    'Track physical stock quantities. When off, products are a catalogue only.',
  [SETTING_KEYS.ALLOW_NEGATIVE_STOCK]:
    'Allow stock movements that take on-hand quantity below zero.',
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Reads a setting, falling back to its documented default. */
  async get<T>(key: string): Promise<T> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) return SETTING_DEFAULTS[key] as T;
    return row.value as T;
  }

  async getBoolean(key: string): Promise<boolean> {
    return (await this.get<boolean>(key)) === true;
  }

  async getAll(): Promise<Array<{ key: string; value: unknown; description: string }>> {
    const rows = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
    const byKey = new Map(rows.map((row) => [row.key, row.value]));

    // Every known key is reported, including ones never written, so the UI
    // shows the real effective configuration rather than an empty list.
    return Object.keys(SETTING_DEFAULTS).map((key) => ({
      key,
      value: byKey.has(key) ? byKey.get(key) : SETTING_DEFAULTS[key],
      description: SETTING_DESCRIPTIONS[key] ?? '',
    }));
  }

  async set(
    key: string,
    value: unknown,
    actor: AuthenticatedUser,
  ): Promise<{ key: string; value: unknown }> {
    const previous = await this.get<unknown>(key);

    const row = await this.prisma.setting.upsert({
      where: { key },
      create: {
        key,
        value: value as Prisma.InputJsonValue,
        description: SETTING_DESCRIPTIONS[key] ?? null,
        updatedById: actor.id,
      },
      update: { value: value as Prisma.InputJsonValue, updatedById: actor.id },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'setting.update',
      entityType: 'Setting',
      entityId: row.id,
      summary: `Changed ${key} from ${JSON.stringify(previous)} to ${JSON.stringify(value)}`,
      before: { key, value: previous },
      after: { key, value },
    });

    return { key: row.key, value: row.value };
  }

  async isStockTrackingEnabled(): Promise<boolean> {
    return this.getBoolean(SETTING_KEYS.STOCK_TRACKING_ENABLED);
  }
}
