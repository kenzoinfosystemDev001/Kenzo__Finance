import { Injectable, Logger } from '@nestjs/common';
import { FinalInvoiceStatus, InvoicePaymentState, PaymentReminderEmailStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { businessToday } from '../common/utils/business-date';
import { addDays, classifyPaymentAlert, DUE_SOON_WINDOW_DAYS, reminderCycle, type PaymentAlertStage } from './payment-alert.rules';
import { PaymentReminderOutboxService, type OutboxResult } from './payment-reminder-outbox.service';

/** Issued invoices are the only ones that can owe money; drafts and cancelled invoices never raise alerts. */
const ALERT_STATUSES: FinalInvoiceStatus[] = [FinalInvoiceStatus.ISSUED, FinalInvoiceStatus.SENT];

export interface PaymentAlertItem {
  finalInvoiceId: string;
  invoiceNumber: string | null;
  currency: string;
  customerId: string;
  customerName: string;
  outstanding: string;
  amountReceived: string;
  grandTotal: string;
  dueDate: string;
  daysRemaining: number;
  stage: PaymentAlertStage;
}

export interface PaymentAlertSummary {
  overdue: number;
  dueToday: number;
  dueSoon: number;
  totalOutstanding: string;
}

/**
 * Payment due alerts, computed from current database records.
 *
 * `openAlerts` is what users see: it reads each invoice's due date, grand
 * total, amount received and payment state, so a changed due date, a partial
 * payment or a verified full payment is reflected on the next read.
 *
 * `sweep` records each alert stage once in PaymentReminder. The unique key
 * stops duplicates even when several API instances or repeated sweeps run.
 * It does not decide what is shown.
 */
@Injectable()
export class PaymentAlertsService {
  private readonly logger = new Logger(PaymentAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: PaymentReminderOutboxService,
  ) {}

  async openAlerts(now: Date = new Date()): Promise<{ alerts: PaymentAlertItem[]; summary: PaymentAlertSummary }> {
    const today = businessToday(now);
    const invoices = await this.prisma.finalInvoice.findMany({
      where: {
        status: { in: ALERT_STATUSES },
        dueDate: { not: null, lte: addDays(today, DUE_SOON_WINDOW_DAYS) },
        paymentState: { not: InvoicePaymentState.PAID },
      },
      select: {
        id: true,
        invoiceNumber: true,
        dueDate: true,
        grandTotal: true,
        amountReceived: true,
        paymentState: true,
        currency: true,
        customer: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });

    const alerts: PaymentAlertItem[] = [];
    let totalOutstanding = new Prisma.Decimal(0);
    for (const invoice of invoices) {
      const outstanding = new Prisma.Decimal(invoice.grandTotal).minus(invoice.amountReceived);
      const state = classifyPaymentAlert({
        dueDate: invoice.dueDate,
        today,
        outstanding,
        paymentState: invoice.paymentState,
      });
      if (!state || !invoice.dueDate) continue;

      totalOutstanding = totalOutstanding.plus(outstanding);
      alerts.push({
        finalInvoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        currency: invoice.currency,
        customerId: invoice.customer.id,
        customerName: invoice.customer.name,
        outstanding: outstanding.toFixed(2),
        amountReceived: new Prisma.Decimal(invoice.amountReceived).toFixed(2),
        grandTotal: new Prisma.Decimal(invoice.grandTotal).toFixed(2),
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        daysRemaining: state.daysRemaining,
        stage: state.stage,
      });
    }

    return {
      alerts,
      summary: {
        overdue: alerts.filter((a) => a.stage === 'OVERDUE').length,
        dueToday: alerts.filter((a) => a.stage === 'DUE_TODAY').length,
        dueSoon: alerts.filter((a) => a.stage === 'DUE_SOON').length,
        totalOutstanding: totalOutstanding.toFixed(2),
      },
    };
  }

  /**
   * Records each alert stage that applies today, then emails the customer for
   * every newly recorded reminder. Idempotent: a stage already recorded for an
   * invoice, due date and cycle is skipped, so it is never emailed twice.
   * Overdue invoices get a new cycle every OVERDUE_REPEAT_DAYS until paid.
   */
  async sweep(now: Date = new Date()): Promise<{ evaluated: number; recorded: number; emails: OutboxResult }> {
    const { alerts } = await this.openAlerts(now);
    let recorded = 0;

    if (alerts.length > 0) {
      const result = await this.prisma.paymentReminder.createMany({
        data: alerts.map((alert) => ({
          finalInvoiceId: alert.finalInvoiceId,
          dueDate: new Date(`${alert.dueDate}T00:00:00.000Z`),
          stage: alert.stage,
          cycle: reminderCycle(alert),
          daysRemaining: alert.daysRemaining,
          outstandingAmount: alert.outstanding,
          emailStatus: PaymentReminderEmailStatus.PENDING,
        })),
        skipDuplicates: true,
      });
      recorded = result.count;
      if (recorded > 0) this.logger.log(`Payment alerts: recorded ${recorded} new reminder(s) from ${alerts.length} open alert(s).`);
    }

    // Also retries reminders whose email failed on an earlier run.
    const emails = await this.outbox.deliverPending(now);
    return { evaluated: alerts.length, recorded, emails };
  }

  /** Reminder history of one invoice, newest first, including email status. */
  async history(finalInvoiceId: string) {
    return this.prisma.paymentReminder.findMany({
      where: { finalInvoiceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        stage: true,
        cycle: true,
        dueDate: true,
        daysRemaining: true,
        outstandingAmount: true,
        createdAt: true,
        emailStatus: true,
        recipientEmail: true,
        emailError: true,
        emailedAt: true,
      },
    });
  }
}
