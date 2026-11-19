'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  uploadVendorDocumentAction,
  type OcrUploadState,
} from '@/lib/vendor-actions';
import type { Company, VendorCategory } from '@/lib/types';
import { VendorForm } from '@/components/vendor-form';

function UploadButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Reading document...' : 'Upload and extract'}
    </button>
  );
}

/**
 * Two-step flow: upload, then review.
 *
 * The extracted values are only ever a draft. Nothing is written to the vendor
 * table until the reviewer submits the second step, which is the explicit
 * human confirmation the spec requires for OCR input.
 */
export function OcrVendorWizard({
  categories,
  companies,
}: {
  categories: VendorCategory[];
  companies: Company[];
}) {
  const [state, formAction] = useActionState<OcrUploadState, FormData>(
    uploadVendorDocumentAction,
    {},
  );

  const job = state.job;

  if (!job) {
    return (
      <div className="card p-5">
        <form action={formAction} className="space-y-4">
          {state.error && (
            <div
              role="alert"
              className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {state.error}
            </div>
          )}

          <div>
            <label htmlFor="file" className="field-label">
              Vendor document
            </label>
            <input
              id="file"
              name="file"
              type="file"
              required
              accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.txt,.csv,.json,.md"
              className="field-input file:mr-3 file:rounded file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:text-ink"
            />
            <p className="field-hint">
              PDF, image or text file, up to 10 MB. The file type is verified
              from its contents, not its name.
            </p>
          </div>

          <div className="rounded-md border border-border bg-surface-muted px-3 py-2.5">
            <p className="text-sm text-ink-muted">
              The document is stored against the vendor record. Extracted values
              are a draft only &mdash; nothing is saved until you review and
              confirm them on the next step.
            </p>
          </div>

          <UploadButton />
        </form>
      </div>
    );
  }

  const prefill = job.prefill ?? {};
  const draft = job.normalizedResult?.draft ?? {};
  const note = job.normalizedResult?.note;

  const confidence = Object.fromEntries(
    Object.entries(draft).map(([key, value]) => [key, value?.confidence ?? null]),
  );

  const extractedCount = Object.keys(prefill).length;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-medium text-ink">
              {job.document.originalFilename}
            </p>
            <p className="text-sm text-ink-subtle">
              {job.document.mimeType} &middot;{' '}
              {(job.document.sizeBytes / 1024).toFixed(0)} KB &middot; stored and
              attached
            </p>
          </div>
          <span
            className={`badge ${
              job.status === 'COMPLETED'
                ? 'bg-success-subtle text-success'
                : 'bg-danger-subtle text-danger'
            }`}
          >
            {job.status === 'COMPLETED' ? 'Extraction finished' : 'Extraction failed'}
          </span>
        </div>

        {job.errorMessage && (
          <p className="mt-2 text-sm text-danger">{job.errorMessage}</p>
        )}

        {note && (
          <div className="mt-3 rounded-md border border-border bg-surface-muted px-3 py-2">
            <p className="text-sm text-ink-muted">{note}</p>
          </div>
        )}

        <p className="mt-3 text-sm text-ink-muted">
          {extractedCount > 0
            ? `${extractedCount} field(s) pre-filled below. Check every value against the document before saving.`
            : 'No fields could be read automatically. Enter the details manually below.'}
        </p>
      </div>

      <div className="card p-5">
        <div className="mb-5 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2.5">
          <p className="text-sm text-warning">
            Review step. Extracted values are unverified. Nothing is saved until
            you submit this form.
          </p>
        </div>

        <VendorForm
          categories={categories}
          companies={companies}
          initialValues={prefill}
          confidence={confidence}
          ocrJobId={job.id}
        />
      </div>
    </div>
  );
}
