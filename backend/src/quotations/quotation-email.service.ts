import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EmailRecipientType, Prisma, QuotationEmailStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../email/mailer.service';
import { BRANDING_SETTING_KEYS, SettingsService } from '../settings/settings.service';
import { PERMISSIONS, type PermissionCode } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type { PdfCompanyProfile } from '../common/pdf/commercial-pdf';
import { QuotationPdfService, quotationPdfFilename } from './quotation-pdf.service';
import { buildQuotationEmail } from './quotation-email.template';
import type { RecipientSearchQueryDto, SendQuotationEmailDto } from './dto/quotation-email.dto';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_CC = 5;

export const isValidEmailAddress = (value: string) => value.length <= 254 && EMAIL_PATTERN.test(value);

/** The saved address to suggest: the primary contact's email, else the first contact with one. */
function savedEmail(contacts: Array<{ email: string | null; isPrimary: boolean }>): string | null {
  const ordered = [...contacts].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  return ordered.find((contact) => contact.email)?.email ?? null;
}

export interface EmailRecipientOption {
  id: string;
  type: EmailRecipientType;
  name: string;
  /** Saved address, or null when the record has none. */
  email: string | null;
}

/** One email attempt as returned to the client. */
export interface QuotationEmailRecord {
  id: string;
  revisionNumber: number;
  recipientType: EmailRecipientType;
  recipientName: string;
  recipientEmail: string;
  ccEmails: string[];
  subject: string;
  senderEmail: string;
  status: QuotationEmailStatus;
  messageId: string | null;
  serverResponse: string | null;
  errorMessage: string | null;
  sentByName: string | null;
  createdAt: string;
  completedAt: string | null;
}

const emailSelect = {
  id: true,
  revisionNumber: true,
  recipientType: true,
  recipientName: true,
  recipientEmail: true,
  ccEmails: true,
  subject: true,
  senderEmail: true,
  status: true,
  messageId: true,
  serverResponse: true,
  errorMessage: true,
  createdAt: true,
  completedAt: true,
  sentBy: { select: { fullName: true } },
} satisfies Prisma.QuotationEmailSelect;

type EmailRow = Prisma.QuotationEmailGetPayload<{ select: typeof emailSelect }>;

function toRecord(row: EmailRow): QuotationEmailRecord {
  return {
    id: row.id,
    revisionNumber: row.revisionNumber,
    recipientType: row.recipientType,
    recipientName: row.recipientName,
    recipientEmail: row.recipientEmail,
    ccEmails: row.ccEmails,
    subject: row.subject,
    senderEmail: row.senderEmail,
    status: row.status,
    messageId: row.messageId,
    serverResponse: row.serverResponse,
    errorMessage: row.errorMessage,
    sentByName: row.sentBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** A send still PENDING after this long was interrupted (SMTP timeouts total under a minute). */
export const STALE_PENDING_MS = 5 * 60 * 1000;

/**
 * Emails an issued quotation revision as a PDF attachment, from the configured
 * administrator address. The attached file is the stored PDF of that revision,
 * so it matches the download. Sending never changes the quotation.
 */
@Injectable()
export class QuotationEmailService {
  private readonly logger = new Logger(QuotationEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly pdf: QuotationPdfService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Email history for one quotation, newest first. */
  async history(quotationId: string): Promise<QuotationEmailRecord[]> {
    await this.assertQuotation(quotationId);
    const rows = await this.prisma.quotationEmail.findMany({
      where: { quotationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: emailSelect,
    });
    return rows.map(toRecord);
  }

  /** Customers or vendors matching a search, with their saved address. */
  async recipients(quotationId: string, query: RecipientSearchQueryDto, permissions: PermissionCode[]): Promise<EmailRecipientOption[]> {
    await this.assertQuotation(quotationId);
    const term = query.q ?? '';
    if (query.type === 'CUSTOMER') {
      this.requirePermission(permissions, PERMISSIONS.CUSTOMER_READ);
      const customers = await this.prisma.customer.findMany({
        where: term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { customerCode: { contains: term, mode: 'insensitive' } }] } : {},
        orderBy: { name: 'asc' },
        take: 15,
        select: { id: true, name: true, contacts: { select: { email: true, isPrimary: true } } },
      });
      return customers.map((c) => ({ id: c.id, type: EmailRecipientType.CUSTOMER, name: c.name, email: savedEmail(c.contacts) }));
    }
    this.requirePermission(permissions, PERMISSIONS.VENDOR_READ);
    const vendors = await this.prisma.vendor.findMany({
      where: {
        archivedAt: null,
        ...(term ? { OR: [{ businessName: { contains: term, mode: 'insensitive' } }, { vendorCode: { contains: term, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { businessName: 'asc' },
      take: 15,
      select: { id: true, businessName: true, email: true, contacts: { select: { email: true, isPrimary: true } } },
    });
    return vendors.map((v) => ({
      id: v.id,
      type: EmailRecipientType.VENDOR,
      name: v.businessName,
      email: savedEmail(v.contacts) ?? v.email ?? null,
    }));
  }

  /**
   * Sends one issued revision. The same idempotency key always returns the same
   * attempt, so a repeated click or a retried request sends the email once.
   */
  async send(quotationId: string, revisionNumber: number, dto: SendQuotationEmailDto, actor: AuthenticatedUser, context: RequestContext): Promise<QuotationEmailRecord> {
    const existing = await this.prisma.quotationEmail.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, select: emailSelect });
    if (existing) {
      if (existing.revisionNumber !== revisionNumber) {
        throw new ConflictException('This send request was already used for another revision.');
      }
      if (existing.status === QuotationEmailStatus.PENDING) {
        // SMTP timeouts total under a minute. A row still PENDING well past
        // that belongs to a send the server never finished (crash/restart);
        // close it as FAILED so the user can retry with a new request instead
        // of being refused forever.
        const closed = await this.prisma.quotationEmail.updateMany({
          where: { idempotencyKey: dto.idempotencyKey, status: QuotationEmailStatus.PENDING, createdAt: { lt: new Date(Date.now() - STALE_PENDING_MS) } },
          data: {
            status: QuotationEmailStatus.FAILED,
            errorMessage: 'The send was interrupted before the mail server answered. It may not have been sent; check before sending again.',
            completedAt: new Date(),
          },
        });
        if (closed.count === 0) {
          throw new ConflictException('This email is still being sent. Wait for the result before trying again.');
        }
        const updated = await this.prisma.quotationEmail.findUniqueOrThrow({ where: { idempotencyKey: dto.idempotencyKey }, select: emailSelect });
        return toRecord(updated);
      }
      return toRecord(existing);
    }

    const revision = await this.prisma.quotationRevision.findFirst({
      where: { quotationId, revisionNumber },
      select: { id: true, issuedAt: true, quotation: { select: { quotationNumber: true, customerId: true } } },
    });
    if (!revision) throw new NotFoundException(`Revision ${revisionNumber} of this quotation was not found.`);
    if (!revision.issuedAt) {
      throw new UnprocessableEntityException('Only issued quotation revisions can be emailed. Issue this revision first.');
    }

    // Refused before any record is written: a missing setting is not a failed send.
    this.mailer.assertConfigured();

    const recipient = await this.resolveRecipient(dto.recipientType, dto.recipientId, actor.permissions);
    const to = dto.toEmail.trim();
    if (!isValidEmailAddress(to)) throw new BadRequestException('Enter a valid recipient email address.');

    const cc = this.normalizeCc(dto.ccEmails ?? [], to);

    const company = ((await this.settings.get<PdfCompanyProfile | null>(BRANDING_SETTING_KEYS.COMPANY_PROFILE)) ?? {}) as PdfCompanyProfile;
    const quotationNumber = revision.quotation.quotationNumber;
    const content = buildQuotationEmail({
      recipientName: recipient.name,
      quotationNumber,
      message: dto.message,
      senderAddress: this.mailer.senderAddress,
      companyPhone: company.phone ?? null,
    });

    // Written before sending. The unique idempotency key stops a concurrent duplicate.
    let row: EmailRow;
    try {
      row = await this.prisma.quotationEmail.create({
        data: {
          quotationId,
          revisionId: revision.id,
          revisionNumber,
          recipientType: dto.recipientType,
          recipientId: recipient.id,
          recipientName: recipient.name,
          recipientEmail: to,
          ccEmails: cc,
          subject: content.subject,
          senderEmail: this.mailer.senderAddress,
          status: QuotationEmailStatus.PENDING,
          idempotencyKey: dto.idempotencyKey,
          sentById: actor.id,
        },
        select: emailSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const again = await this.prisma.quotationEmail.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, select: emailSelect });
        if (again) return toRecord(again);
      }
      throw error;
    }

    try {
      const attachment = await this.pdf.issuedBuffer(quotationId, revisionNumber, actor);
      const receipt = await this.mailer.send({
        to,
        cc,
        subject: content.subject,
        text: content.text,
        attachments: [{ filename: quotationPdfFilename(quotationNumber, revisionNumber, false), content: attachment, contentType: 'application/pdf' }],
      });
      row = await this.prisma.quotationEmail.update({
        where: { id: row.id },
        data: {
          status: QuotationEmailStatus.ACCEPTED,
          messageId: receipt.messageId,
          serverResponse: receipt.serverResponse,
          completedAt: new Date(),
        },
        select: emailSelect,
      });
    } catch (error) {
      const message = this.safeMessage(error);
      this.logger.warn(`Quotation email ${row.id} not accepted.`);
      row = await this.prisma.quotationEmail.update({
        where: { id: row.id },
        data: { status: QuotationEmailStatus.FAILED, errorMessage: message.slice(0, 500), completedAt: new Date() },
        select: emailSelect,
      });
    }

    const accepted = row.status === QuotationEmailStatus.ACCEPTED;
    await this.audit.record({
      actorUserId: actor.id,
      action: accepted ? 'quotation.email_accepted' : 'quotation.email_failed',
      entityType: 'Quotation',
      entityId: quotationId,
      summary: accepted
        ? `Emailed quotation ${quotationNumber} revision ${revisionNumber} to ${to}`
        : `Email of quotation ${quotationNumber} revision ${revisionNumber} to ${to} failed`,
      after: {
        revisionNumber,
        recipientType: dto.recipientType,
        recipientEmail: to,
        ccCount: cc.length,
        status: row.status,
        messageId: row.messageId,
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });

    return toRecord(row);
  }

  private async resolveRecipient(type: 'CUSTOMER' | 'VENDOR', id: string, permissions: PermissionCode[]): Promise<{ id: string; name: string }> {
    if (type === 'CUSTOMER') {
      this.requirePermission(permissions, PERMISSIONS.CUSTOMER_READ);
      const customer = await this.prisma.customer.findUnique({ where: { id }, select: { id: true, name: true } });
      if (!customer) throw new NotFoundException('The selected customer was not found.');
      return customer;
    }
    this.requirePermission(permissions, PERMISSIONS.VENDOR_READ);
    const vendor = await this.prisma.vendor.findUnique({ where: { id }, select: { id: true, businessName: true } });
    if (!vendor) throw new NotFoundException('The selected vendor was not found.');
    return { id: vendor.id, name: vendor.businessName };
  }

  private normalizeCc(list: string[], to: string): string[] {
    const seen = new Set<string>([to.toLowerCase()]);
    const result: string[] = [];
    for (const raw of list) {
      const address = raw.trim();
      if (!address) continue;
      if (!isValidEmailAddress(address)) throw new BadRequestException('Enter valid CC email addresses.');
      if (!seen.has(address.toLowerCase())) {
        seen.add(address.toLowerCase());
        result.push(address);
      }
    }
    if (result.length > MAX_CC) throw new BadRequestException(`Add up to ${MAX_CC} CC addresses.`);
    return result;
  }

  private requirePermission(permissions: PermissionCode[], code: PermissionCode): void {
    if (!permissions.includes(code)) throw new ForbiddenException('You do not have permission for this recipient type.');
  }

  private async assertQuotation(quotationId: string): Promise<void> {
    const exists = await this.prisma.quotation.findUnique({ where: { id: quotationId }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Quotation ${quotationId} was not found`);
  }

  /** Only messages written for the user leave the service; anything else becomes a generic line. */
  private safeMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const body = error.getResponse();
      const text = typeof body === 'string' ? body : (body as { message?: string | string[] }).message;
      if (typeof text === 'string') return text;
      if (Array.isArray(text) && text.length > 0) return String(text[0]);
    }
    if (error instanceof Error && (error as { safe?: boolean }).safe) return error.message;
    return 'The email could not be prepared or sent. Try again; if it keeps failing, contact an administrator.';
  }
}
