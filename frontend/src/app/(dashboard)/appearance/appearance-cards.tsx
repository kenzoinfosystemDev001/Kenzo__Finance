'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BackgroundImage } from '@/components/background-image';
import { ConfirmDialog, ResultAlert } from '@/components/client-ui';
import { IconTrash, IconUpload } from '@/components/icons';
import {
  formatFileSize,
  validateBackgroundFile,
  type AppearanceKind,
  type BackgroundSummary,
} from '@/lib/appearance-types';
import { removeAppearanceImageAction, setAppearanceImageAction } from '@/lib/branding-actions';
import type { ActionResult } from '@/lib/vendor-actions';

type Outcome = ActionResult & { success?: string };

interface ImageCardProps {
  kind: AppearanceKind;
  title: string;
  description?: string;
  /** What the surface looks like with no image. Shown as a colour swatch, never as a fake picture. */
  defaultDescription: string;
  defaultSwatchClass: string;
  /** Tint shown over the image on the live surface, repeated in the preview. */
  overlayClass: string;
  /** Text colour for the "Default colour" label on the swatch. */
  defaultLabelClass: string;
  summary: BackgroundSummary | null;
  /** Versioned URL of the active image, or null. */
  currentUrl: string | null;
}

/** Status pill: states plainly whether the surface uses the default or a custom image. */
function StatusBadge({ state }: { state: 'default' | 'custom' | 'preview' }) {
  const styles =
    state === 'custom'
      ? 'border-accent/30 bg-accent-subtle text-accent'
      : state === 'preview'
        ? 'border-warning/30 bg-warning-subtle text-warning'
        : 'border-border-strong bg-surface-muted text-ink-muted';
  const label = state === 'custom' ? 'Custom image' : state === 'preview' ? 'Preview' : 'Default';
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
  overlayClass,
  defaultLabelClass,
  summary,
  currentUrl,
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
          {description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>}
        </div>
        <StatusBadge state={state} />
      </header>

      <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        {/* Preview, with the same tint the live surface uses. The default is a real colour swatch. */}
        <div className={`relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border ${defaultSwatchClass}`}>
          <BackgroundImage src={shownUrl} overlayClassName={overlayClass} className="absolute inset-0" />
          {!shownUrl && (
            <span className={`absolute inset-0 flex items-center justify-center text-sm font-medium ${defaultLabelClass}`}>
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
            <p className="mt-2 text-xs text-ink-subtle">PNG, JPEG or WEBP, up to 5 MB. Wide images (at least 1920 px) look best.</p>
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
                <IconTrash size={16} />
                Remove
              </button>
            )}
          </div>

          {pending && (
            <p role="status" aria-busy="true" className="text-xs text-ink-subtle">
              Uploading and validating the image...
            </p>
          )}

          <ResultAlert result={outcome} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Remove the ${title.toLowerCase()}?`}
        message="The image is deleted from storage and the default colour is used immediately for everyone."
        confirmLabel="Remove image"
        tone="danger"
        onConfirm={async () => {
          const result = await removeAppearanceImageAction(kind);
          if (result.ok) {
            setOutcome({ success: `${title} removed. The default is shown.` });
            router.refresh();
          }
          return result;
        }}
      />
    </section>
  );
}
