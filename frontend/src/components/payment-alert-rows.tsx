import Link from 'next/link';
import { ALERT_TONE_CLASSES, describeAlert, type PaymentAlertItem } from '@/lib/payment-alerts-types';
import { formatMoney } from '@/lib/quotation-labels';
import { formatDate } from '@/lib/vendor-labels';

/** One payment due alert. Shared by the header panel and the dashboard so the wording matches everywhere. */
export function PaymentAlertRow({ alert }: { alert: PaymentAlertItem }) {
  const status = describeAlert(alert);
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{alert.customerName}</p>
        <p className="text-xs text-ink-muted">
          <Link href={`/final-invoices/${alert.finalInvoiceId}`} className="link-pill font-mono">
            {alert.invoiceNumber ?? 'Invoice'}
          </Link>
          {' · due '}
          {formatDate(alert.dueDate)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="text-sm font-semibold tabular-nums text-ink">
          {formatMoney(alert.outstanding, alert.currency)} <span className="font-normal text-ink-subtle">outstanding</span>
        </span>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ALERT_TONE_CLASSES[status.tone]}`}>
          {status.label}
        </span>
      </div>
    </li>
  );
}

/** Dashboard table of alerts: a stage pill and the days count in plain text, not colour alone. */
export function PaymentAlertTable({ alerts }: { alerts: PaymentAlertItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col">Invoice</th>
            <th scope="col">Due date</th>
            <th scope="col" className="text-right">Outstanding</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => {
            const status = describeAlert(alert);
            return (
              <tr key={alert.finalInvoiceId}>
                <td className="font-medium">{alert.customerName}</td>
                <td>
                  <Link href={`/final-invoices/${alert.finalInvoiceId}`} className="link-pill font-mono text-sm">
                    {alert.invoiceNumber ?? 'Invoice'}
                  </Link>
                </td>
                <td className="whitespace-nowrap">{formatDate(alert.dueDate)}</td>
                <td className="text-right tabular-nums">{formatMoney(alert.outstanding, alert.currency)}</td>
                <td>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ALERT_TONE_CLASSES[status.tone]}`}>
                    {status.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
