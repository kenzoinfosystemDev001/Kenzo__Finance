'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { isEmail, ResultAlert, TextField } from '@/components/client-ui';
import { setQuotationApprovalAction, updateCompanyProfileAction, updateQuotationDefaultTermsAction } from '@/lib/quotation-actions';
import type { ActionResult } from '@/lib/vendor-actions';
import type { QuotationCompanyProfile } from '@/lib/types';

type Feedback = ActionResult & { success?: string };

const PROFILE_FIELDS: Array<{ key: keyof QuotationCompanyProfile; label: string; max: number; wide?: boolean }> = [
  { key: 'name', label: 'Company Name', max: 200 },
  { key: 'gstin', label: 'GSTIN', max: 20 },
  { key: 'pan', label: 'PAN', max: 20 },
  { key: 'phone', label: 'Phone', max: 50 },
  { key: 'email', label: 'Email', max: 254 },
  { key: 'website', label: 'Website', max: 200 },
  { key: 'address', label: 'Address', max: 500, wide: true },
];

/** Quotation switches, default terms and the company details printed on quotation PDFs. */
export function QuotationSettingsPanel({
  approvalRequired,
  defaultTerms,
  companyProfile,
  canManage,
}: {
  approvalRequired: boolean;
  /** Null when the quotation settings could not be read (no quotation.read). */
  defaultTerms: string | null;
  companyProfile: QuotationCompanyProfile | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [approvalResult, setApprovalResult] = useState<Feedback>({});
  const [termsResult, setTermsResult] = useState<Feedback>({});
  const [profileResult, setProfileResult] = useState<Feedback>({});
  const [terms, setTerms] = useState(defaultTerms ?? '');
  const [profile, setProfile] = useState<QuotationCompanyProfile>(companyProfile ?? {});
  const [savingApproval, startApproval] = useTransition();
  const [savingTerms, startTerms] = useTransition();
  const [savingProfile, startProfile] = useTransition();

  const toggleApproval = () =>
    startApproval(async () => {
      const outcome = await setQuotationApprovalAction(!approvalRequired);
      setApprovalResult(outcome.ok ? { success: !approvalRequired ? 'Approval is now required before quotations are sent.' : 'Approval is no longer required.' } : outcome);
      if (outcome.ok) router.refresh();
    });

  const saveTerms = () =>
    startTerms(async () => {
      const outcome = await updateQuotationDefaultTermsAction(terms);
      setTermsResult(outcome.ok ? { success: terms.trim() ? 'Default terms saved. New quotations start with them.' : 'Default terms cleared.' } : outcome);
      if (outcome.ok) router.refresh();
    });

  const saveProfile = () => {
    if (profile.email?.trim() && !isEmail(profile.email)) {
      setProfileResult({ error: 'Enter a valid email address.' });
      return;
    }
    startProfile(async () => {
      const outcome = await updateCompanyProfileAction(profile);
      setProfileResult(outcome.ok ? { success: 'Company details saved. They are printed on quotation PDFs generated from now on.' } : outcome);
      if (outcome.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-md">
          <p className="text-base font-medium text-ink">Require approval before sending</p>
          <p className="mt-1 text-sm text-ink-muted">
            {approvalRequired
              ? 'On. Drafts are submitted for approval; only users with the approve permission can approve them or send them back, and only approved quotations can be marked as sent.'
              : 'Off. A draft can be marked as sent directly by a user with the send permission.'}
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
        <label htmlFor="default-terms" className="text-base font-medium text-ink">Default terms and conditions</label>
        <p className="mt-1 text-sm text-ink-muted">Copied into the terms of each new quotation, where they can be edited. Leave empty to start quotations without terms.</p>
        {defaultTerms === null ? (
          <p className="mt-2 text-sm text-ink-subtle">The current terms could not be loaded (viewing them needs access to quotations).</p>
        ) : (
          <>
            <textarea
              id="default-terms"
              rows={6}
              maxLength={8000}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              readOnly={!canManage}
              className="field-input mt-2"
            />
            {canManage && (
              <div className="mt-3 flex justify-end">
                <button type="button" className="btn-primary" onClick={saveTerms} disabled={savingTerms || terms === defaultTerms}>
                  {savingTerms ? 'Saving...' : 'Save terms'}
                </button>
              </div>
            )}
            <div className="mt-2"><ResultAlert result={termsResult} /></div>
          </>
        )}
      </div>

      <div className="border-t border-border pt-5">
        <p className="text-base font-medium text-ink">Company details on quotation PDFs</p>
        {companyProfile === null ? (
          <p className="mt-2 text-sm text-ink-subtle">The company details could not be loaded (viewing them needs access to quotations).</p>
        ) : canManage ? (
          <>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {PROFILE_FIELDS.map((f) =>
                f.wide ? (
                  <div key={f.key} className="sm:col-span-2">
                    <label htmlFor={`cp-${f.key}`} className="field-label">{f.label}</label>
                    <textarea id={`cp-${f.key}`} rows={3} maxLength={f.max} value={profile[f.key] ?? ''} onChange={(e) => setProfile((p) => ({ ...p, [f.key]: e.target.value }))} className="field-input" />
                  </div>
                ) : (
                  <TextField key={f.key} label={f.label} value={profile[f.key] ?? ''} onChange={(v) => setProfile((p) => ({ ...p, [f.key]: v }))} maxLength={f.max} />
                ),
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" className="btn-primary" onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Save company details'}
              </button>
            </div>
            <div className="mt-2"><ResultAlert result={profileResult} /></div>
          </>
        ) : (
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PROFILE_FIELDS.map((f) => (
              <div key={f.key} className={f.wide ? 'sm:col-span-2' : undefined}>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{f.label}</dt>
                <dd className="mt-1 whitespace-pre-line text-sm text-ink">{companyProfile[f.key] || <span className="text-ink-subtle">Not provided</span>}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
