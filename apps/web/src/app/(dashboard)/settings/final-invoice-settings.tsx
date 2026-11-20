'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CheckboxField, ResultAlert, SelectField, TextField } from '@/components/client-ui';
import { setInvoiceApprovalAction, updateInvoiceNumberingAction } from '@/lib/final-invoice-actions';
import { MONTH_NAMES } from '@/lib/final-invoice-labels';
import type { ActionResult } from '@/lib/vendor-actions';
import type { FinalInvoiceSettings } from '@/lib/types';

type Feedback = ActionResult & { success?: string };
const PREFIX = /^[A-Za-z0-9/-]+$/;

/** Invoice approval switch and invoice numbering (prefix, padding, financial-year series). */
export function FinalInvoiceSettingsPanel({ approvalRequired, settings, canManage }: { approvalRequired: boolean; settings: FinalInvoiceSettings | null; canManage: boolean }) {
  const router = useRouter();
  const [approvalResult, setApprovalResult] = useState<Feedback>({});
  const [saveResult, setSaveResult] = useState<Feedback>({});
  const [prefix, setPrefix] = useState(settings?.numbering.prefix ?? '');
  const [padding, setPadding] = useState(String(settings?.numbering.padding ?? ''));
  const [financialYear, setFinancialYear] = useState(settings?.numbering.financialYear ?? false);
  const [fyStartMonth, setFyStartMonth] = useState(String(settings?.numbering.fyStartMonth ?? ''));
  const [savingApproval, startApproval] = useTransition();
  const [saving, startSave] = useTransition();

  const toggleApproval = () =>
    startApproval(async () => {
      const outcome = await setInvoiceApprovalAction(!approvalRequired);
      setApprovalResult(outcome.ok ? { success: !approvalRequired ? 'Approval is now required before invoices are issued.' : 'Approval is no longer required.' } : outcome);
      if (outcome.ok) router.refresh();
    });

  const save = () => {
    const p = prefix.trim();
    const pad = Number(padding);
    const month = Number(fyStartMonth);
    if (!p || p.length > 20 || !PREFIX.test(p)) return setSaveResult({ error: 'The prefix must be 1-20 letters, digits, "/" or "-".' });
    if (!Number.isInteger(pad) || pad < 1 || pad > 10) return setSaveResult({ error: 'Padding must be a whole number from 1 to 10.' });
    if (!Number.isInteger(month) || month < 1 || month > 12) return setSaveResult({ error: 'Choose the first month of the financial year.' });
    startSave(async () => {
      const outcome = await updateInvoiceNumberingAction({ prefix: p, padding: pad, financialYear, fyStartMonth: month });
      setSaveResult(outcome.ok ? { success: 'Saved. The next issued invoice uses this format; issued numbers never change.' } : outcome);
      if (outcome.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-md">
          <p className="text-base font-medium text-ink">Require approval before issuing</p>
          <p className="mt-1 text-sm text-ink-muted">
            {approvalRequired
              ? 'On. Draft invoices are submitted for approval; only users with the approve permission can approve them, and only approved invoices can be issued.'
              : 'Off. A draft invoice can be issued directly by a user with the issue permission.'}
          </p>
        </div>
        <div className="shrink-0">
          {canManage ? (
            <button type="button" className={approvalRequired ? 'btn-secondary' : 'btn-primary'} onClick={toggleApproval} disabled={savingApproval}>
              {savingApproval ? 'Saving...' : approvalRequired ? 'Turn off' : 'Turn on'}
            </button>
          ) : (
            <span className="badge bg-surface-muted text-ink-muted">{approvalRequired ? 'On' : 'Off'}</span>
          )}
        </div>
      </div>
      <ResultAlert result={approvalResult} />

      <div className="border-t border-border pt-5">
        <p className="text-base font-medium text-ink">Invoice numbering</p>
        <p className="mt-1 text-sm text-ink-muted">
          A number is allocated only when an invoice is issued, so numbers are consecutive and never reused. Changing the format affects invoices issued from now on.
        </p>
        {settings === null ? (
          <p className="mt-2 text-sm text-ink-subtle">The current numbering could not be loaded (viewing it needs access to invoices or settings).</p>
        ) : (
          <>
            {!settings.numberingConfirmed && (
              <p role="status" className="mt-3 rounded-lg border border-warning/30 bg-warning-subtle px-4 py-2.5 text-sm text-warning">
                The invoice number format is still the built-in default and has not been confirmed. Confirm it (or set your own) and save before issuing invoices in production; it should match your accountant&apos;s and tax requirements.
              </p>
            )}
            {settings.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-lg border border-warning/30 bg-warning-subtle px-4 py-2.5 text-sm text-warning">
                {settings.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
            <p className="mt-3 text-sm text-ink-muted">
              Next invoice number: <span className="font-mono font-semibold text-ink">{settings.nextNumber}</span>
            </p>
            {canManage ? (
              <>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField label="Prefix" value={prefix} onChange={setPrefix} maxLength={20} hint='Letters, digits, "/" and "-" only.' />
                  <TextField label="Digits in the running number" type="number" value={padding} onChange={setPadding} hint="1 to 10; zero-padded." />
                  <div className="sm:col-span-2">
                    <CheckboxField
                      label="Restart the series every financial year"
                      checked={financialYear}
                      onChange={setFinancialYear}
                      hint="Adds the financial year after the prefix, e.g. PREFIX/2026-27/00001."
                    />
                  </div>
                  <SelectField
                    label="Financial year starts in"
                    value={fyStartMonth}
                    onChange={setFyStartMonth}
                    options={MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name }))}
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <button type="button" className="btn-primary" onClick={save} disabled={saving}>
                    {saving ? 'Saving...' : settings.numberingConfirmed ? 'Save numbering' : 'Confirm and save numbering'}
                  </button>
                </div>
                <div className="mt-2"><ResultAlert result={saveResult} /></div>
              </>
            ) : (
              <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-ink-subtle">Prefix</dt><dd className="font-mono text-ink">{settings.numbering.prefix}</dd></div>
                <div><dt className="text-ink-subtle">Digits</dt><dd className="text-ink">{settings.numbering.padding}</dd></div>
                <div><dt className="text-ink-subtle">Series per financial year</dt><dd className="text-ink">{settings.numbering.financialYear ? 'Yes' : 'No'}</dd></div>
                <div><dt className="text-ink-subtle">Financial year starts</dt><dd className="text-ink">{MONTH_NAMES[settings.numbering.fyStartMonth - 1] ?? settings.numbering.fyStartMonth}</dd></div>
              </dl>
            )}
          </>
        )}
      </div>
    </div>
  );
}
