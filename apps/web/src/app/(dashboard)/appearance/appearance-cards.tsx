'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BackgroundImage } from '@/components/background-image';
import { ConfirmDialog, isEmail, ResultAlert, TextField } from '@/components/client-ui';
import { IconRefresh, IconUpload } from '@/components/icons';
import { SectionCard } from '@/components/ui';
import {
  formatFileSize,
  validateBackgroundFile,
  type AppearanceKind,
  type BackgroundSummary,
} from '@/lib/appearance-types';
import {
  restoreAppearanceImageAction,
  setAppearanceImageAction,
  updateSupportEmailAction,
} from '@/lib/branding-actions';
import type { ActionResult } from '@/lib/vendor-actions';

type Outcome = ActionResult & { success?: string };

interface ImageCardProps {
  kind: AppearanceKind;
  title: string;
  description: string;
  /** What the surface looks like with no image: shown as a colour swatch, never as a fake picture. */
  defaultDescription: string;
  defaultSwatchClass: string;
  summary: BackgroundSummary | null;
  /** Versioned URL of the active image, or null. */
  currentUrl: string | null;
  /** Optional content shown under the image controls, e.g. the sign-in contact email. */
  footer?: React.ReactNode;
}

/**
 * One configurable background. The preview of a file the administrator has
 * just picked is a local object URL shown before anything is uploaded; it is
 * never stored. Only "Apply" sends the file, and the server re-validates it.
 */
export function AppearanceImageCard({
  kind,
  title,
  description,
  defaultDescription,
  defaultSwatchClass,
  summary,
  currentUrl,
  footer,
}: ImageCardProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = `${kind}-background-file`;
  const [selected, setSelected] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [outcome, setOutcome] = useState<Outcome>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Object URL for the selected file only; revoked when replaced or discarded.
  useEffect(() => {
    if (!selected) {
      setPreviewUrl(null);
      setDimensions(null);
      return;
    }
    const url = URL.createObjectURL(selected);
    setPreviewUrl(url);
    const probe = new window.Image();
    probe.onload = () => setDimensions({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.src = url;
    return () => URL.revokeObjectURL(url);
  }, [selected]);

  function choose(file: File | undefined) {
    if (!file) return;
    const problem = validateBackgroundFile(file);
    setOutcome(problem ? { error: problem } : {});
    setSelected(problem ? null : file);
    // Clear the input so picking the same file again still fires a change.
    if (fileRef.current) fileRef.current.value = '';
  }

  function apply() {
    if (!selected || pending) return;
    const formData = new FormData();
    formData.set('file', selected);
    startTransition(async () => {
      const result = await setAppearanceImageAction(kind, formData);
      if (result.ok) {
        setSelected(null);
        setOutcome({ success: `${title} updated.` });
        router.refresh();
      } else {
        setOutcome(result);
      }
    });
  }

  const hasActive = Boolean(currentUrl);
  const shownUrl = previewUrl ?? (selected ? null : currentUrl);

  return (
    <SectionCard title={title} description={description}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Preview. The default swatch is a real colour, not an image. */}
        <div>
          <div className={`relative aspect-[16/9] overflow-hidden rounded-xl border border-border ${defaultSwatchClass}`}>
            <BackgroundImage src={shownUrl} className="absolute inset-0" />
            <span className="absolute left-3 top-3 rounded-md bg-surface/95 px-2 py-0.5 text-xs font-semibold text-ink shadow-card">
              {selected ? 'Preview - not applied yet' : hasActive ? 'Active' : 'Default'}
            </span>
          </div>
        </div>

        {/* Information and controls */}
        <div className="flex min-w-0 flex-col">
          <div className="text-sm text-ink-muted">
            {selected ? (
              <>
                <p className="truncate font-medium text-ink" title={selected.name}>{selected.name}</p>
                <p className="mt-1">
                  {formatFileSize(selected.size)}
                  {dimensions && ` · ${dimensions.width} × ${dimensions.height} px`}
                </p>
                <p className="mt-1 text-ink-subtle">Check the preview, then apply it. Nothing changes until you apply.</p>
              </>
            ) : hasActive && summary ? (
              <>
                <p className="truncate font-medium text-ink" title={summary.originalFilename}>{summary.originalFilename}</p>
                <p className="mt-1">
                  {formatFileSize(summary.sizeBytes)} · uploaded {summary.uploadedAt.slice(0, 10)}
                </p>
              </>
            ) : hasActive ? (
              <p>An image is active.</p>
            ) : (
              <p>Using the default. {defaultDescription}</p>
            )}
            <p className="mt-2 text-xs text-ink-subtle">PNG, JPEG or WEBP, up to 5 MB.</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              id={inputId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={pending}
              onChange={(event) => choose(event.target.files?.[0])}
            />

            {selected ? (
              <>
                <button type="button" className="btn-primary" onClick={apply} disabled={pending}>
                  {pending ? 'Applying...' : 'Apply image'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setSelected(null)} disabled={pending}>
                  Cancel
                </button>
              </>
            ) : (
              <label
                htmlFor={inputId}
                aria-disabled={pending}
                className={`btn-primary cursor-pointer ${pending ? 'pointer-events-none opacity-60' : ''}`}
              >
                <IconUpload size={16} />
                {hasActive ? 'Replace image' : 'Upload image'}
              </label>
            )}

            {hasActive && !selected && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmOpen(true)}
                disabled={pending}
              >
                <IconRefresh size={16} />
                Restore default
              </button>
            )}
          </div>

          {pending && (
            <div className="mt-4" role="progressbar" aria-label="Saving image" aria-busy="true">
              {/* Indeterminate: the server action does not report byte progress. */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div className="h-full w-full animate-pulse bg-accent" />
              </div>
              <p className="mt-1.5 text-xs text-ink-subtle">Uploading and validating the image...</p>
            </div>
          )}

          <div className="mt-4">
            <ResultAlert result={outcome} />
          </div>
        </div>
      </div>

      {footer && <div className="mt-6 border-t border-border pt-5">{footer}</div>}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Restore the default ${kind === 'login' ? 'sign-in' : kind} background?`}
        message="The previous image is kept in the audit history but is no longer shown. The default colour will be used immediately."
        confirmLabel="Restore default"
        tone="primary"
        onConfirm={async () => {
          const result = await restoreAppearanceImageAction(kind);
          if (result.ok) {
            setOutcome({ success: `${title} restored to the default.` });
            router.refresh();
          }
          return result;
        }}
      />
    </SectionCard>
  );
}

/** Sign-in page contact. The login page shows a "Contact administrator" link when set. */
export function SupportEmailForm({ supportEmail, canManage }: { supportEmail: string | null; canManage: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(supportEmail ?? '');
  const [result, setResult] = useState<Outcome>({});
  const [saving, startSaving] = useTransition();
  const invalid = Boolean(email.trim() && !isEmail(email));
  const unchanged = email.trim() === (supportEmail ?? '');

  return (
    <div>
      <p className="text-base font-medium text-ink">Administrator contact</p>
      <p className="mt-1 text-sm text-ink-muted">
        Shown on the sign-in page as &ldquo;Contact administrator&rdquo;. Leave empty to hide it.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <TextField
          className="w-full max-w-sm"
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
        {canManage && (
          <button
            type="button"
            className="btn-primary"
            disabled={saving || invalid || unchanged}
            onClick={() =>
              startSaving(async () => {
                const outcome = await updateSupportEmailAction(email);
                setResult(outcome.ok ? { success: 'Saved.' } : outcome);
                if (outcome.ok) router.refresh();
              })
            }
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
      <div className="mt-3 max-w-sm">
        <ResultAlert result={result} />
      </div>
    </div>
  );
}
