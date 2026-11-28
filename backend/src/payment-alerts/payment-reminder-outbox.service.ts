import { Injectable, Logger } from '@nestjs/common';
import { InvoicePaymentState, PaymentReminderEmailStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { MailerService } from '../email/mailer.service';
import type { PaymentAlertStage } from './payment-alert.rules';
import { paymentReminderEmail } from './payment-reminder-email';

/** A reminder not sent within this window is stale (the stage has moved on). */
export const REMINDER_EMAIL_TTL_MS = 2 * 24 * 60 * 60 * 1000;
/** A row left in SENDING this long belongs to a crashed run and is retried. */
export const SENDING_LEASE_MS = 15 * 60 * 1000;
export const MAX_EMAIL_ATTEMPTS = 3;
const BATCH_SIZE = 50;

export interface OutboxResult {
  sent: number;
  failed: number;
  skipped: number;
  /** True when SMTP is not configured: rows stay PENDING until it is (or they expire). */
  notConfigured: boolean;
}

/**
 * Sends the customer email for each newly recorded payment reminder.
 *
 * Outbox pattern: the sweep records reminder rows as PENDING; this claims
 * each row atomically (PENDING -> SENDING), so concurrent runs or several API
 * instances never send the same reminder twice. Before sending it re-reads the
 * invoice: a reminder for an invoice paid in the meantime is skipped.
 */
@Injectable()
export class PaymentReminderOutboxService {
  private readonly logger = new Logger(PaymentReminderOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  async deliverPending(now: Date = new Date()): Promise<OutboxResult> {
    const result: OutboxResult = { sent: 0, failed: 0, skipped: 0, notConfigured: false };

    // Recover rows from a run that crashed mid-send.
    await this.prisma.paymentReminder.updateMany({
      where: { emailStatus: PaymentReminderEmailStatus.SENDING, updatedAt: { lt: new Date(now.getTime() - SENDING_LEASE_MS) } },
      data: { emailStatus: PaymentReminderEmailStatus.PENDING },
    });

    // Expire reminders that were never sent in time: a "due in 5 days" email
    // arriving after the due date would be wrong.
    const expired = await this.prisma.paymentReminder.updateMany({
      where: { emailStatus: PaymentReminderEmailStatus.PENDING, createdAt: { lt: new Date(now.getTime() - REMINDER_EMAIL_TTL_MS) } },
      data: { emailStatus: PaymentReminderEmailStatus.SKIPPED, emailError: 'Expired before it could be sent.' },
    });
    result.skipped += expired.count;

    if (this.mailer.missingSettings().length > 0) {
      result.notConfigured = true;
      return result;
    }

    const pending = await this.prisma.paymentReminder.findMany({
      where: { emailStatus: PaymentReminderEmailStatus.PENDING, emailAttempts: { lt: MAX_EMAIL_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true },
    });

    for (const { id } of pending) {
      const outcome = await this.deliverOne(id);
      if (outcome) result[outcome] += 1;
    }

    if (result.sent + result.failed > 0) {
      this.logger.log(`Payment reminder emails: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped.`);
    }
    return result;
  }

  /** Claims, checks and sends one reminder. Returns null when another run claimed it first. */
  private async deliverOne(id: string): Promise<'sent' | 'failed' | 'skipped' | null> {
    const claim = await this.prisma.paymentReminder.updateMany({
      where: { id, emailStatus: PaymentReminderEmailStatus.PENDING },
      data: { emailStatus: PaymentReminderEmailStatus.SENDING, emailAttempts: { increment: 1 } },
    });
    if (claim.count === 0) return null;

    const reminder = await this.prisma.paymentReminder.findUniqueOrThrow({
      where: { id },
      select: {
        stage: true,
        dueDate: true,
        daysRemaining: true,
        emailAttempts: true,
        finalInvoice: {
          select: {
            invoiceNumber: true,
            dueDate: true,
            currency: true,
            grandTotal: true,
            amountReceived: true,
            paymentState: true,
            customer: { select: { name: true, contacts: { where: { email: { not: null } }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], take: 1, select: { name: true, email: true } } } },
            contact: { select: { name: true, email: true } },
          },
        },
      },
    });
    const invoice = reminder.finalInvoice;
    const outstanding = new Prisma.Decimal(invoice.grandTotal).minus(invoice.amountReceived);

    const skip = async (reason: string) => {
      await this.prisma.paymentReminder.update({ where: { id }, data: { emailStatus: PaymentReminderEmailStatus.SKIPPED, emailError: reason } });
      return 'skipped' as const;
    };

    if (invoice.paymentState === InvoicePaymentState.PAID || outstanding.lte(0)) return skip('The invoice was paid before the reminder was sent.');
    if (!invoice.dueDate || invoice.dueDate.getTime() !== reminder.dueDate.getTime()) return skip('The due date changed before the reminder was sent.');
    if (!invoice.invoiceNumber) return skip('The invoice has no number.');

    // The invoice's own contact first, then the customer's primary contact.
    const contact = invoice.contact?.email ? invoice.contact : invoice.customer.contacts[0] ?? null;
    if (!contact?.email) return skip('The customer has no contact email address.');

    const mail = paymentReminderEmail({
      stage: reminder.stage as PaymentAlertStage,
      customerName: invoice.customer.name,
      contactName: contact.name,
      invoiceNumber: invoice.invoiceNumber,
      currency: invoice.currency,
      outstanding: outstanding.toFixed(2),
      grandTotal: new Prisma.Decimal(invoice.grandTotal).toFixed(2),
      dueDate: reminder.dueDate.toISOString().slice(0, 10),
      daysRemaining: reminder.daysRemaining,
    });

    try {
      const receipt = await this.mailer.send({ to: contact.email, cc: [], subject: mail.subject, text: mail.text, attachments: [] });
      await this.prisma.paymentReminder.update({
        where: { id },
        data: { emailStatus: PaymentReminderEmailStatus.SENT, recipientEmail: contact.email, emailMessageId: receipt.messageId, emailError: null, emailedAt: new Date() },
      });
      return 'sent';
    } catch (error) {
      // MailerService only throws safe, credential-free messages.
      const message = error instanceof Error ? error.message : 'The mail server did not accept the message.';
      const final = reminder.emailAttempts >= MAX_EMAIL_ATTEMPTS;
      await this.prisma.paymentReminder.update({
        where: { id },
        data: { emailStatus: final ? PaymentReminderEmailStatus.FAILED : PaymentReminderEmailStatus.PENDING, recipientEmail: contact.email, emailError: message.slice(0, 500) },
      });
      return final ? 'failed' : null;
    }
  }
}
