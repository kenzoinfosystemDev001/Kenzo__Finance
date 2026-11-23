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

  /**
   * Whether quotations must be approved before they can be sent. Off by
   * default: no approval policy has been confirmed. When on, Draft goes to
   * Pending Approval and only a user with quotation.approve can approve.
   */
  QUOTATION_APPROVAL_REQUIRED: 'quotation.approvalRequired',

  /**
   * Whether proforma invoices must be approved before they can be issued.
   * Off by default: no PI approval policy has been confirmed.
   */
  PROFORMA_APPROVAL_REQUIRED: 'proforma.approvalRequired',

  /** Whether final invoices must be approved before they can be issued. Off by default (no policy confirmed). */
  INVOICE_APPROVAL_REQUIRED: 'invoice.approvalRequired',
} as const;

/**
 * Branding settings. Changed only through the dedicated /branding endpoints,
 * which validate the value (an uploaded image, an email address) - never
 * through the generic boolean PATCH /settings.
 */
export const BRANDING_SETTING_KEYS = {
  /** Document id of the login-page background image, or null for none. */
  LOGIN_BACKGROUND_DOCUMENT_ID: 'branding.loginBackgroundDocumentId',
  /** Document id of the sidebar background image, or null for the default colour. */
  SIDEBAR_BACKGROUND_DOCUMENT_ID: 'branding.sidebarBackgroundDocumentId',
  /** Document id of the main workspace background image, or null for the default colour. */
  WORKSPACE_BACKGROUND_DOCUMENT_ID: 'branding.workspaceBackgroundDocumentId',
  /** Address behind the login page's "Contact Administrator", or null. */
  SUPPORT_EMAIL: 'branding.supportEmail',
  /** Company details printed on quotation PDFs: { name, address, phone, email, website, gstin, pan }. */
  COMPANY_PROFILE: 'branding.companyProfile',
  /** Default terms copied into new quotations (empty until an administrator sets them). */
  QUOTATION_DEFAULT_TERMS: 'quotation.defaultTerms',
  /** Bank account printed on proforma invoices: { bankName, accountName, accountNumber, ifsc, swift, branch }. Empty until an administrator enters it. */
  PROFORMA_BANK_DETAILS: 'proforma.bankDetails',
  /** Default payment instructions copied into new proforma invoices. */
  PROFORMA_PAYMENT_INSTRUCTIONS: 'proforma.paymentInstructions',
  /** { prefix, padding, financialYear, fyStartMonth } for final invoice numbers. Null = defaults, not yet confirmed. */
  INVOICE_NUMBERING: 'invoice.numbering',
  /** Accepted payment methods [{ code, label, active }]. Null = the PRD's suggested list, not yet confirmed. */
  PAYMENT_METHODS: 'payment.methods',
  /** Method codes verified automatically when recorded by a user who may verify. Empty = never. */
  PAYMENT_AUTO_VERIFY_METHODS: 'payment.autoVerifyMethods',
} as const;

export const SETTING_DEFAULTS: Record<string, unknown> = {
  [SETTING_KEYS.STOCK_TRACKING_ENABLED]: false,
  [SETTING_KEYS.ALLOW_NEGATIVE_STOCK]: false,
  [BRANDING_SETTING_KEYS.LOGIN_BACKGROUND_DOCUMENT_ID]: null,
  [BRANDING_SETTING_KEYS.SUPPORT_EMAIL]: null,
  [BRANDING_SETTING_KEYS.SIDEBAR_BACKGROUND_DOCUMENT_ID]: null,
  [BRANDING_SETTING_KEYS.WORKSPACE_BACKGROUND_DOCUMENT_ID]: null,
  [SETTING_KEYS.QUOTATION_APPROVAL_REQUIRED]: false,
  [BRANDING_SETTING_KEYS.COMPANY_PROFILE]: null,
  [BRANDING_SETTING_KEYS.QUOTATION_DEFAULT_TERMS]: null,
  [SETTING_KEYS.PROFORMA_APPROVAL_REQUIRED]: false,
  [BRANDING_SETTING_KEYS.PROFORMA_BANK_DETAILS]: null,
  [BRANDING_SETTING_KEYS.PROFORMA_PAYMENT_INSTRUCTIONS]: null,
  [SETTING_KEYS.INVOICE_APPROVAL_REQUIRED]: false,
  [BRANDING_SETTING_KEYS.INVOICE_NUMBERING]: null,
  [BRANDING_SETTING_KEYS.PAYMENT_METHODS]: null,
  [BRANDING_SETTING_KEYS.PAYMENT_AUTO_VERIFY_METHODS]: null,
};

export const SETTING_DESCRIPTIONS: Record<string, string> = {
  [SETTING_KEYS.STOCK_TRACKING_ENABLED]:
    'Track physical stock quantities. When off, products are a catalogue only.',
  [SETTING_KEYS.ALLOW_NEGATIVE_STOCK]:
    'Allow stock movements that take on-hand quantity below zero.',
  [BRANDING_SETTING_KEYS.LOGIN_BACKGROUND_DOCUMENT_ID]:
    'Image shown behind the sign-in page. Empty uses the plain navy background.',
  [BRANDING_SETTING_KEYS.SIDEBAR_BACKGROUND_DOCUMENT_ID]: 'Image behind the navigation sidebar. Empty uses the default slate colour.',
  [BRANDING_SETTING_KEYS.WORKSPACE_BACKGROUND_DOCUMENT_ID]: 'Image behind the main workspace of every module. Empty uses the default off-white.',
  [BRANDING_SETTING_KEYS.SUPPORT_EMAIL]:
    'Email address users are directed to from the sign-in page for access or password help.',
  [SETTING_KEYS.QUOTATION_APPROVAL_REQUIRED]:
    'Quotations must be approved by a user with quotation approval permission before they can be sent.',
  [BRANDING_SETTING_KEYS.COMPANY_PROFILE]: 'Company name, address and registration details printed on quotations.',
  [BRANDING_SETTING_KEYS.QUOTATION_DEFAULT_TERMS]: 'Terms and conditions copied into new quotations (editable per quotation).',
  [SETTING_KEYS.PROFORMA_APPROVAL_REQUIRED]:
    'Proforma invoices must be approved by a user with proforma approval permission before they can be issued.',
  [BRANDING_SETTING_KEYS.PROFORMA_BANK_DETAILS]: 'Bank account printed on proforma invoices.',
  [BRANDING_SETTING_KEYS.PROFORMA_PAYMENT_INSTRUCTIONS]: 'Payment instructions copied into new proforma invoices (editable per PI).',
  [SETTING_KEYS.INVOICE_APPROVAL_REQUIRED]: 'Final invoices must be approved by a user with invoice approval permission before they can be issued.',
  [BRANDING_SETTING_KEYS.INVOICE_NUMBERING]: 'Final invoice number format (prefix, digits, financial-year series).',
  [BRANDING_SETTING_KEYS.PAYMENT_METHODS]: 'Payment methods accepted from customers.',
  [BRANDING_SETTING_KEYS.PAYMENT_AUTO_VERIFY_METHODS]: 'Payment methods verified automatically when recorded.',
};

/** Readable only through their module's settings endpoint (permission-checked), never via GET /settings. */
const RESTRICTED_KEYS = new Set<string>([BRANDING_SETTING_KEYS.PROFORMA_BANK_DETAILS, BRANDING_SETTING_KEYS.PROFORMA_PAYMENT_INSTRUCTIONS]);

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
    return Object.keys(SETTING_DEFAULTS).filter((key) => !RESTRICTED_KEYS.has(key)).map((key) => ({
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
    // A JSON column cannot take a bare null; JsonNull stores JSON null, which
    // reads back as null.
    const stored =
      value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

    const row = await this.prisma.setting.upsert({
      where: { key },
      create: {
        key,
        value: stored,
        description: SETTING_DESCRIPTIONS[key] ?? null,
        updatedById: actor.id,
      },
      update: { value: stored, updatedById: actor.id },
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
