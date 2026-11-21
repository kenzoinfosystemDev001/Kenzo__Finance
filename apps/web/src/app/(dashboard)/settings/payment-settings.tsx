'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ResultAlert } from '@/components/client-ui';
import { updatePaymentSettingsAction } from '@/lib/payment-actions';
import type { ActionResult } from '@/lib/vendor-actions';
import type { PaymentMethodOption, PaymentSettings } from '@/lib/types';

type Feedback = ActionResult & { success?: string };
type Row = PaymentMethodOption & { autoVerify: boolean; key: number };
const CODE = /^[A-Z][A-Z0-9_]{1,29}$/;

/**
 * Accepted payment methods and which of them (if any) are verified
 * automatically. Methods already used by payments can be switched off but
 * not removed (the API enforces this and explains it).
 */
export function PaymentSettingsPanel({ settings, canManage }: { settings: PaymentSettings | null; canManage: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => (settings?.methods ?? []).map((m, i) => ({ ...m, autoVerify: settings?.autoVerifyMethods.includes(m.code) ?? false, key: i })));
  const [result, setResult] = useState<Feedback>({});
  const [saving, startSave] = useTransition();

  if (settings === null) {
    return <p className="text-sm text-ink-subtle">The payment settings could not be loaded (viewing them needs access to payments or settings).</p>;
  }

  const update = (key: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => setRows((all) => [...all, { code: '', label: '', active: true, autoVerify: false, key: Math.max(-1, ...all.map((r) => r.key)) + 1 }]);
  const remove = (key: number) => setRows((all) => all.filter((r) => r.key !== key));

  const save = () => {
    const cleaned = rows.map((r) => ({ ...r, code: r.code.trim().toUpperCase(), label: r.label.trim() }));
    const bad = cleaned.find((r) => !CODE.test(r.code) || !r.label || r.label.length > 50);
    if (bad) return setResult({ error: `Each method needs a code (UPPER_CASE letters, digits and _, 2-30 characters) and a label of up to 50 characters${bad.code ? ` (check ${bad.code})` : ''}.` });
    if (new Set(cleaned.map((r) => r.code)).size !== cleaned.length) return setResult({ error: 'Each payment method code must be unique.' });
    if (!cleaned.some((r) => r.active)) return setResult({ error: 'At least one method must stay active, or payments cannot be recorded.' });
    startSave(async () => {
      const outcome = await updatePaymentSettingsAction(
        cleaned.map(({ code, label, active }) => ({ code, label, active })),
        cleaned.filter((r) => r.autoVerify && r.active).map((r) => r.code),
      );
      setResult(outcome.ok ? { success: 'Saved. New payments use these methods; recorded payments keep their method.' } : outcome);
      if (outcome.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {!settings.methodsConfirmed && (
        <p role="status" className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-2.5 text-sm text-warning">
          These are the built-in default methods and have not been confirmed yet. Review them and save to confirm.
        </p>
      )}
      <p className="text-sm text-ink-muted">
        Auto-verify marks a payment as verified when it is recorded by a user who is allowed to verify payments. Leave it off for every method to keep a second check on all payments.
      </p>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Label</th>
              <th scope="col">Active</th>
              <th scope="col">Auto-verify</th>
              {canManage && <th scope="col"><span className="sr-only">Remove</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const existing = settings.methods.some((m) => m.code === r.code);
              return (
                <tr key={r.key}>
                  <td>
                    {canManage && !existing ? (
                      <input aria-label="Method code" className="form-input w-40 font-mono uppercase" value={r.code} maxLength={30} onChange={(e) => update(r.key, { code: e.target.value.toUpperCase() })} placeholder="E.G. NEFT" />
                    ) : (
                      <span className="font-mono text-sm">{r.code}</span>
                    )}
                  </td>
                  <td>
                    {canManage ? <input aria-label={`Label for ${r.code || 'new method'}`} className="form-input w-48" value={r.label} maxLength={50} onChange={(e) => update(r.key, { label: e.target.value })} /> : r.label}
                  </td>
                  <td>
                    <input type="checkbox" aria-label={`${r.label || r.code} active`} checked={r.active} disabled={!canManage} onChange={(e) => update(r.key, { active: e.target.checked, autoVerify: e.target.checked ? r.autoVerify : false })} />
                  </td>
                  <td>
                    <input type="checkbox" aria-label={`${r.label || r.code} auto-verify`} checked={r.autoVerify} disabled={!canManage || !r.active} onChange={(e) => update(r.key, { autoVerify: e.target.checked })} />
                  </td>
                  {canManage && (
                    <td className="text-right">
                      <button type="button" className="btn-secondary text-sm" onClick={() => remove(r.key)} title="Methods already used by payments cannot be removed; switch them off instead.">
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={add} disabled={rows.length >= 30}>
            Add method
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save payment methods'}
          </button>
        </div>
      )}
      <ResultAlert result={result} />
    </div>
  );
}
