'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BackgroundImage } from '@/components/background-image';
import { ConfirmDialog, isEmail, ResultAlert, TextField } from '@/components/client-ui';
import { IconRefresh, IconUpload } from '@/components/icons';
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
  /** What the surface looks like with no image. Shown as a colour swatch, never as a fake picture. */
  defaultDescription: string;
  defaultSwatchClass: string;
  summary: BackgroundSummary | null;
  /** Versioned URL of the active image, or null. */
  currentUrl: string | null;
  /** Optional content shown under the image controls, e.g. the sign-in contact email. */
  footer?: ReactNode;
}

/** Status pill: states plainly whether the surface uses the default or a custom image. */
function StatusBadge({ state }: { state: 'default' | 'custom' | 'preview' }) {
  const styles =
    state === 'custom'
      ? 'border-accent/30 bg-accent-subtle text-accent'
      : state === 'preview'
        ? 'border-warning/30 bg-warning-subtle text-warning'
        : 'border-border-strong bg-surface-muted text-ink-muted';
  const label = state === 'custom' ? 'Custom' : state === 'preview' ? 'Preview' : 'Default';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${styles}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
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
  const state = selected ? 'preview' : hasActive ? 'custom' : 'default';

  return (
    <section className="card overflow-hidden" aria-labelledby={`${kind}-title`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-5">
        <div className="min-w-0">
          <h2 id={`${kind}-title`} className="text-lg font-bold text-ink">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>
        </div>
        <StatusBadge state={state} />
      </header>

      <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        {/* Preview. The default is a real colour swatch, never a fake picture. */}
        <div className={`relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border shadow-card ${defaultSwatchClass}`}>
          <BackgroundImage src={shownUrl} className="absolute inset-0" />
          {!shownUrl && (
            <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white/80">
              Default colour
            </span>
          )}
        </div>

        {/* Details and controls */}
        <div className="flex min-w-0 flex-col gap-5">
          <div className="min-w-0 text-sm text-ink-muted">
            {selected ? (
              <>
                <p className="truncate font-semibold text-ink" title={selected.name}>{selected.name}</p>
                <p className="mt-1">
                  {formatFileSize(selected.size)}
                  {dimensions && ` · ${dimensions.width} × ${dimensions.height} px`}
                </p>
                <p className="mt-2 text-ink-subtle">Check the preview, then apply it. Nothing changes until you apply.</p>
              </>
            ) : hasActive && summary ? (
              <>
                <p className="truncate font-semibold text-ink" title={summary.originalFilename}>{summary.originalFilename}</p>
                <p className="mt-1">
                  {formatFileSize(summary.sizeBytes)} · uploaded {summary.uploadedAt.slice(0, 10)}
                </p>
              </>
            ) : hasActive ? (
              <p>A custom image is shown.</p>
            ) : (
              <p>Using the default. {defaultDescription}</p>
            )}
            <p className="mt-2 text-xs text-ink-subtle">PNG, JPEG or WEBP, up to 5 MB.</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
                <button type="button" className="btn-primary w-full sm:w-auto" onClick={apply} disabled={pending}>
                  {pending ? 'Applying...' : 'Apply image'}
                </button>
                <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setSelected(null)} disabled={pending}>
                  Cancel
                </button>
              </>
            ) : (
              <label
                htmlFor={inputId}
                aria-disabled={pending}
                className={`btn-primary w-full cursor-pointer sm:w-auto ${pending ? 'pointer-events-none opacity-60' : ''}`}
              >
                <IconUpload size={16} />
                {hasActive ? 'Replace image' : 'Upload image'}
              </label>
            )}

            {hasActive && !selected && (
              <button
                type="button"
                className="btn-secondary w-full sm:w-auto"
                onClick={() => setConfirmOpen(true)}
                disabled={pending}
              >
                <IconRefresh size={16} />
                Restore default
              </button>
            )}
          </div>

          {pending && (
            <div role="progressbar" aria-label="Saving image" aria-busy="true">
              {/* Indeterminate: the server action does not report byte progress. */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div className="h-full w-full animate-pulse bg-accent" />
              </div>
              <p className="mt-1.5 text-xs text-ink-subtle">Uploading and validating the image...</p>
            </div>
          )}

          <ResultAlert result={outcome} />
        </div>
      </div>

      {footer && <div className="border-t border-border bg-surface-muted/60 px-6 py-5">{footer}</div>}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Restore the default ${kind === 'login' ? 'sign-in' : kind} background?`}
        message="The previous image is kept in the audit history but is no longer shown. The default colour is used immediately."
        confirmLabel="Restore default"
        tone="danger"
        onConfirm={async () => {
          const result = await restoreAppearanceImageAction(kind);
          if (result.ok) {
            setOutcome({ success: `${title} restored to the default.` });
            router.refresh();
          }
          return result;
        }}
      />
    </section>
  );
}

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
        <p className="mt-1 text-sm text-ink-muted">
          Shown on the sign-in page as &ldquo;Contact administrator&rdquo;. Leave it empty to hide the link.
        </p>
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
