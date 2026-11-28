'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { PaymentAlertsResponse } from '@/lib/payment-alerts-types';
import { IconAlert } from './icons';
import { PaymentAlertRow } from './payment-alert-rows';

const PANEL_LIMIT = 10;

/**
 * Notification bell for payment due alerts. The count and list come from the
 * server at page load; the panel closes on Escape or an outside click.
 */
export function PaymentAlertBell({ data }: { data: PaymentAlertsResponse }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const total = data.alerts.length;
  const overdue = data.summary.overdue;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    const onClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const label = total === 0 ? 'Payment alerts: none open' : `Payment alerts: ${total} open, ${overdue} overdue`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        <IconAlert size={20} />
        {total > 0 && (
          <span
            aria-hidden
            className={`absolute -right-0.5 -top-0.5 flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[0.7rem] font-bold text-white ${overdue > 0 ? 'bg-danger' : 'bg-warning'}`}
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Payment due alerts"
          className="absolute right-0 z-40 mt-2 w-[min(92vw,26rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-popover"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-ink">Payment due alerts</p>
            <p className="text-xs text-ink-subtle">
              {total === 0 ? 'Nothing open' : `${data.summary.overdue} overdue · ${data.summary.dueToday} due today · ${data.summary.dueSoon} due soon`}
            </p>
          </div>

          {total === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">No invoices are due within five days or overdue.</p>
          ) : (
            <>
              <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                {data.alerts.slice(0, PANEL_LIMIT).map((alert) => (
                  <PaymentAlertRow key={alert.finalInvoiceId} alert={alert} />
                ))}
              </ul>
              <div className="border-t border-border px-4 py-2.5 text-right">
                <Link href="/final-invoices" className="link-pill text-sm font-medium" onClick={() => setOpen(false)}>
                  {total > PANEL_LIMIT ? `Open invoices (${total} alerts)` : 'Open invoices'}
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
