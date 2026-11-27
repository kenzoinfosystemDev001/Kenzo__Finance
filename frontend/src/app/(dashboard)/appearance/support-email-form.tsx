'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ResultAlert, TextField, isEmail } from '@/components/client-ui';
import { updateSupportEmailAction } from '@/lib/branding-actions';
import type { ActionResult } from '@/lib/vendor-actions';

type Outcome = ActionResult & { success?: string };

/**
 * Administrator contact for the sign-in page. Shows the saved address, with
 * Edit, Clear and Save. Clearing the address hides the contact link on sign-in.
 */
export function SupportEmailForm({ supportEmail, canManage }: { supportEmail: string | null; canManage: boolean }) {
  const router = useRouter();
  const saved = supportEmail ?? '';
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(saved);
  const [result, setResult] = useState<Outcome>({});
  const [saving, startSaving] = useTransition();
  const trimmed = email.trim();
  const invalid = Boolean(trimmed && !isEmail(trimmed));
  const unchanged = trimmed === saved;

  function save(value: string, success: string) {
    startSaving(async () => {
      const outcome = await updateSupportEmailAction(value);
      if (outcome.ok) {
        setResult({ success });
        setEditing(false);
        router.refresh();
      } else {
        setResult(outcome);
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
      <div>
        <h3 className="text-base font-bold text-ink">Administrator contact</h3>
        <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Saved address</p>
          {saved ? (
            <p className="mt-1 break-all font-medium text-ink">{saved}</p>
          ) : (
            <p className="mt-1 text-ink-muted">Not set. The sign-in page shows no contact link.</p>
          )}
        </div>
      </div>

      {canManage && (
        <div className="min-w-0">
          {editing ? (
            <div className="space-y-3">
              <TextField
                label="Support email"
                type="email"
                value={email}
                onChange={(value) => {
                  setEmail(value);
                  setResult({});
                }}
                placeholder="Enter support email address"
                error={invalid ? 'Enter a valid email address.' : undefined}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving || invalid || unchanged || trimmed === ''}
                  onClick={() => save(trimmed, 'Support email saved.')}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setEmail(saved);
                    setResult({});
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={() => {
                  setEmail(saved);
                  setEditing(true);
                  setResult({});
                }}
              >
                {saved ? 'Edit address' : 'Add address'}
              </button>
              {saved && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={saving}
                  onClick={() => save('', 'Support email removed.')}
                >
                  {saving ? 'Clearing...' : 'Clear'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="lg:col-span-2">
        <ResultAlert result={result} />
      </div>
    </div>
  );
}
