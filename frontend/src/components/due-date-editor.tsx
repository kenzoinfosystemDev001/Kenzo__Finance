'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { updateInvoiceDueDateAction } from '@/lib/payment-due-date-actions';
import { ResultAlert } from './client-ui';

/**
 * Payment due date of an issued invoice. Saving recalculates the invoice's
 * payment alerts: a date within five days (or past) raises or updates the
 * alert, and clearing the date stops it.
 */
export function DueDateEditor({
  invoiceId,
  dueDate,
  invoiceDate,
  formattedDueDate,
}: {
  invoiceId: string;
  /** YYYY-MM-DD, or null. */
  dueDate: string | null;
  /** YYYY-MM-DD. The due date cannot be earlier. */
  invoiceDate: string;
  formattedDueDate: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(dueDate ?? '');
  const [result, setResult] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, startTransition] = useTransition();
  const belowInvoiceDate = value !== '' && value < invoiceDate;

  if (!editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span>{formattedDueDate}</span>
        <button type="button" className="link-pill text-sm font-medium" onClick={() => setEditing(true)}>
          Change
        </button>
      </span>
    );
  }

  const save = (next: string | null) =>
    startTransition(async () => {
      const outcome = await updateInvoiceDueDateAction(invoiceId, next);
      setResult(outcome);
      if (outcome.ok) {
        setEditing(false);
        router.refresh();
      }
    });

  return (
    <div className="w-full min-w-[16rem] space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          New due date
          <input
            type="date"
            value={value}
            min={invoiceDate}
            onChange={(event) => setValue(event.target.value)}
            className="field-input h-9 w-44"
            disabled={pending}
          />
        </label>
        <button type="button" className="btn-primary" onClick={() => save(value || null)} disabled={pending || value === '' || belowInvoiceDate}>
          {pending ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => save(null)} disabled={pending || !dueDate}>
          Clear
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setValue(dueDate ?? '');
            setResult({});
            setEditing(false);
          }}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
      {belowInvoiceDate && <p className="text-xs text-danger">The due date cannot be before the invoice date.</p>}
      <p className="text-xs text-ink-subtle">Clearing the date stops this invoice&rsquo;s payment alerts.</p>
      <ResultAlert result={result} />
    </div>
  );
}
