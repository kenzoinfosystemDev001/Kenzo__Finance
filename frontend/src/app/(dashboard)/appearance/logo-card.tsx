'use client';

import { useState } from 'react';
import { restoreCompanyLogoAction, saveCompanyLogoAction } from '@/lib/brand-logo-actions';
import { SectionCard } from '@/components/ui';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Admin -> Appearance: replace or restore the company logo. The logo is stored
 * in the database; the preview sits on the sidebar colour, where it appears.
 */
export function LogoCard({ hasCustomLogo }: { hasCustomLogo: boolean }) {
  const [stamp, setStamp] = useState(0);
  const [custom, setCustom] = useState(hasCustomLogo);
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'restore' | null>(null);

  function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    setNotice(null);
    if (!TYPES.includes(file.type)) {
      setError('Choose a PNG, JPG or WEBP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('The logo must be 2 MB or smaller.');
      return;
    }
    if (picked) URL.revokeObjectURL(picked.url);
    setPicked({ file, url: URL.createObjectURL(file) });
  }

  function discard() {
    if (picked) URL.revokeObjectURL(picked.url);
    setPicked(null);
  }

  async function save() {
    if (!picked) return;
    setBusy('save');
    setError(null);
    const form = new FormData();
    form.set('file', picked.file);
    const result = await saveCompanyLogoAction(form);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    discard();
    setCustom(true);
    setStamp(Date.now());
    setNotice('Logo saved. It now appears across the app and on the sign-in page.');
  }

  async function restore() {
    setBusy('restore');
    setError(null);
    const result = await restoreCompanyLogoAction();
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCustom(false);
    setStamp(Date.now());
    setNotice('The default logo has been restored.');
  }

  const src = picked?.url ?? `/brand-logo${stamp ? `?t=${stamp}` : ''}`;

  return (
    <SectionCard
      title="Company logo"
      description="Shown in the sidebar and on the sign-in page. PNG with a transparent background works best."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-sidebar p-8">
          {/* Plain <img>: a same-origin logo route, not a static asset. */}
          <img src={src} alt="Company logo preview" className="h-28 w-28 object-contain" />
          <p className="text-xs text-sidebar-muted">
            {picked ? 'Preview of the new logo' : custom ? 'Current logo' : 'Default logo in use'}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="btn-secondary h-10 cursor-pointer justify-center px-4">
            Choose logo image
            <input
              type="file"
              accept={TYPES.join(',')}
              className="sr-only"
              aria-label="Choose company logo image"
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <p className="text-xs text-ink-subtle">JPG, PNG or WEBP, up to 2 MB, at least 128 × 128 px.</p>

          <div className="mt-auto flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={!picked || busy !== null} className="btn-primary h-10 px-4">
              {busy === 'save' ? 'Saving…' : 'Save logo'}
            </button>
            {picked && (
              <button type="button" onClick={discard} disabled={busy !== null} className="btn-secondary h-10 px-4">
                Discard
              </button>
            )}
            {custom && (
              <button type="button" onClick={restore} disabled={busy !== null} className="btn-secondary h-10 px-4">
                {busy === 'restore' ? 'Restoring…' : 'Restore default'}
              </button>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {notice && !error && (
            <p role="status" className="text-sm text-success">
              {notice}
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
