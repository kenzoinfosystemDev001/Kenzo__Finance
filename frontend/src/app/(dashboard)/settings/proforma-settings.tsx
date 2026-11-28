'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ResultAlert, TextField } from '@/components/client-ui';
import { setProformaApprovalAction, updateProformaSettingsAction } from '@/lib/proforma-actions';
import type { ActionResult } from '@/lib/vendor-actions';
import type { ProformaBankDetails, ProformaSettings } from '@/lib/types';

type Feedback = ActionResult & { success?: string };

const BANK_FIELDS: Array<{ key: keyof ProformaBankDetails; label: string; max: number }> = [
  { key: 'bankName', label: 'Bank Name', max: 150 },
  { key: 'accountName', label: 'Account Name', max: 150 },
  { key: 'accountNumber', label: 'Account Number', max: 40 },
  { key: 'ifsc', label: 'IFSC', max: 11 },
  { key: 'swift', label: 'SWIFT / BIC', max: 11 },
  { key: 'branch', label: 'Branch', max: 200 },
];
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const SWIFT = /^([A-Z0-9]{8}|[A-Z0-9]{11})$/;

/** PI approval switch, bank account and default payment instructions printed on proforma invoices. */
export function ProformaSettingsPanel({ approvalRequired, settings, canManage }: { approvalRequired: boolean; settings: ProformaSettings | null; canManage: boolean }) {
  const router = useRouter();
  const [approvalResult, setApprovalResult] = useState<Feedback>({});
  const [saveResult, setSaveResult] = useState<Feedback>({});
  const [bank, setBank] = useState<ProformaBankDetails>(settings?.bankDetails ?? {});
  const [instructions, setInstructions] = useState(settings?.paymentInstructions ?? '');
  const [savingApproval, startApproval] = useTransition();
  const [saving, startSave] = useTransition();

  const toggleApproval = () =>
    startApproval(async () => {
      const outcome = await setProformaApprovalAction(!approvalRequired);
      setApprovalResult(outcome.ok ? { success: !approvalRequired ? 'Approval is now required before proforma invoices are issued.' : 'Approval is no longer required.' } : outcome);
      if (outcome.ok) router.refresh();
    });

  const save = () => {
    const ifsc = (bank.ifsc ?? '').trim().toUpperCase();
    const swift = (bank.swift ?? '').trim().toUpperCase();
    if (ifsc && !IFSC.test(ifsc)) return setSaveResult({ error: 'IFSC must look like ABCD0123456.' });
    if (swift && !SWIFT.test(swift)) return setSaveResult({ error: 'SWIFT/BIC must be 8 or 11 letters/digits.' });
    startSave(async () => {
      const outcome = await updateProformaSettingsAction({ ...bank, ifsc, swift }, instructions);
      setSaveResult(outcome.ok ? { success: 'Saved. New proforma invoices start with these details; existing ones keep their own.' } : outcome);
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
              ? 'On. Drafts are submitted for approval; only users with the approve permission can approve them, and only approved PIs can be issued.'
              : 'Off. A draft can be issued directly by a user with the issue permission.'}
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
        <p className="text-base font-medium text-ink">Bank account printed on proforma invoices</p>
        {settings === null ? (
          <p className="mt-2 text-sm text-ink-subtle">The current details could not be loaded (viewing them needs access to proforma invoices).</p>
        ) : canManage ? (
          <>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {BANK_FIELDS.map((f) => (
                <TextField key={f.key} label={f.label} value={bank[f.key] ?? ''} onChange={(v) => setBank((b) => ({ ...b, [f.key]: v }))} maxLength={f.max} />
              ))}
            </div>
            <div className="mt-4">
              <label htmlFor="pi-instructions" className="field-label">Default payment instructions</label>
              <textarea id="pi-instructions" rows={3} maxLength={4000} value={instructions} onChange={(e) => setInstructions(e.target.value)} className="field-input" />
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save payment details'}</button>
            </div>
            <div className="mt-2"><ResultAlert result={saveResult} /></div>
          </>
        ) : (
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {BANK_FIELDS.map((f) => (
              <div key={f.key}>
                <dt className="text-ink-subtle">{f.label}</dt>
                <dd className="text-ink">{settings.bankDetails?.[f.key] || '—'}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
