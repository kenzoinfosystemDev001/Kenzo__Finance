import { Injectable, Logger } from '@nestjs/common';
import { FinalInvoiceStatus, InvoicePaymentState, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { businessToday } from '../common/utils/business-date';
import { addDays, classifyPaymentAlert, DUE_SOON_WINDOW_DAYS, type PaymentAlertStage } from './payment-alert.rules';

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

  constructor(private readonly prisma: PrismaService) {}

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
   * Records each alert stage that applies today. Idempotent: a stage already
   * recorded for an invoice and due date is skipped. Returns how many new
   * records were written.
   */
  async sweep(now: Date = new Date()): Promise<{ evaluated: number; recorded: number }> {
    const { alerts } = await this.openAlerts(now);
    if (alerts.length === 0) return { evaluated: 0, recorded: 0 };

    const result = await this.prisma.paymentReminder.createMany({
      data: alerts.map((alert) => ({
        finalInvoiceId: alert.finalInvoiceId,
        dueDate: new Date(`${alert.dueDate}T00:00:00.000Z`),
        stage: alert.stage,
        daysRemaining: alert.daysRemaining,
        outstandingAmount: alert.outstanding,
      })),
      skipDuplicates: true,
    });

    if (result.count > 0) this.logger.log(`Payment alerts: recorded ${result.count} new reminder(s) from ${alerts.length} open alert(s).`);
    return { evaluated: alerts.length, recorded: result.count };
  }
}
