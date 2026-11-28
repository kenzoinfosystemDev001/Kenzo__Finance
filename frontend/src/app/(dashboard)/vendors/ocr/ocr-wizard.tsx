'use client';

import { startTransition, useActionState } from 'react';
import { uploadOcrDocumentAction, type OcrUploadState } from '@/lib/vendor-actions';
import { DOCUMENT_KIND_LABELS, formatBytes, UPLOADABLE_DOCUMENT_KINDS } from '@/lib/vendor-labels';
import type { OcrEngineStatus, OcrJob, ProductCategory, VendorCategory } from '@/lib/types';
import {
  emptyAddress,
  emptyContact,
  VendorForm,
  type OcrReview,
  type VendorFormInitial,
} from '@/components/vendor-form';
import { ResultAlert } from '@/components/client-ui';
import { IconCheckCircle, IconFile, IconScan, IconUpload } from '@/components/icons';

function UploadButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" className="btn-primary px-5" disabled={pending}>
      <IconUpload size={16} />
      {pending ? 'Reading document...' : 'Upload and extract'}
    </button>
  );
}

/** Maps the flat OCR draft onto the vendor form's sections. */
function toFormInitial(job: OcrJob): { initial: VendorFormInitial; confidence: Record<string, number | null> } {
  const p = job.prefill ?? {};
  const draft = job.normalizedResult?.draft ?? {};
  const conf = (key: string) => draft[key]?.confidence ?? null;
  const confidence: Record<string, number | null> = {};

  const basicsKeys = ['businessName', 'legalName', 'gstin', 'pan', 'website'] as const;
  const basics: Record<string, string> = {};
  for (const key of basicsKeys) {
    if (p[key]) {
      basics[key] = p[key];
      confidence[key] = conf(key);
    }
  }

  const contacts = [];
  if (p.contactPerson) {
    // A visiting card's phone and email belong to the person on it.
    contacts.push(
      emptyContact({
        name: p.contactPerson,
        designation: p.designation ?? '',
        phone: p.phone ?? '',
        alternatePhone: p.alternatePhone ?? '',
        email: p.email ?? '',
        alternateEmail: p.alternateEmail ?? '',
        isPrimary: true,
      }),
    );
    for (const [draftKey, field] of [
      ['contactPerson', 'name'],
      ['designation', 'designation'],
      ['phone', 'phone'],
      ['alternatePhone', 'alternatePhone'],
      ['email', 'email'],
      ['alternateEmail', 'alternateEmail'],
    ] as const) {
      if (p[draftKey]) confidence[`contacts.0.${field}`] = conf(draftKey);
    }
  } else {
    // No named person: treat the channels as the company's own.
    for (const key of ['phone', 'alternatePhone', 'email', 'alternateEmail'] as const) {
      if (p[key]) {
        basics[key] = p[key];
        confidence[key] = conf(key);
      }
    }
  }

  const addresses = [];
  if (p.addressLine1 || p.city || p.state || p.postalCode) {
    addresses.push(
      emptyAddress({
        addressType: 'OFFICE',
        addressLine1: p.addressLine1 ?? '',
        city: p.city ?? '',
        state: p.state ?? '',
        postalCode: p.postalCode ?? '',
        isPrimary: true,
      }),
    );
    for (const key of ['addressLine1', 'city', 'state', 'postalCode'] as const) {
      if (p[key]) confidence[`addresses.0.${key}`] = conf(key);
    }
  }

  return {
    initial: {
      basics,
      contacts,
      addresses,
      brands: (job.normalizedResult?.suggestedBrands ?? []).map((brand) => ({ id: brand.id, label: brand.name })),
    },
    confidence,
  };
}

/**
 * Two steps: upload, then review. Extracted values are only ever a draft -
 * nothing is written to the vendor tables until the reviewer confirms, and
 * the source document is attached to the vendor that confirmation creates.
 */
export function OcrVendorWizard({
  categories,
  productCategories,
  permissions,
  engine,
}: {
  categories: VendorCategory[];
  productCategories: ProductCategory[];
  permissions: string[];
  engine: OcrEngineStatus | null;
}) {
  const [state, formAction, pending] = useActionState<OcrUploadState, FormData>(uploadOcrDocumentAction, {});

  // Submitted by hand rather than through the form's `action` prop: React 19
  // resets a form after its action completes, which threw away the chosen
  // file and document type whenever the upload was rejected.
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };
  const job = state.job;

  if (!job) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form onSubmit={submit} className="card space-y-5 p-6">
          <ResultAlert result={{ error: state.error }} />

          <div>
            <label htmlFor="ocr-kind" className="field-label">
              Document type
            </label>
            <select id="ocr-kind" name="kind" defaultValue="" required className="field-input">
              <option value="">Select document type</option>
              {UPLOADABLE_DOCUMENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {DOCUMENT_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ocr-file" className="field-label">
              File
            </label>
            <label
              htmlFor="ocr-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-muted px-6 py-10 text-center transition-colors hover:border-accent hover:bg-accent-subtle"
            >
              <IconScan size={32} className="text-accent" />
              <span className="text-base font-medium text-ink">Choose a visiting card, PDF or image</span>
              <span className="text-sm text-ink-subtle">PDF, PNG, JPEG, WEBP, TIFF or text &middot; up to 10 MB</span>
            </label>
            <input
              id="ocr-file"
              name="file"
              type="file"
              required
              accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.csv,.json,.md"
              className="field-input mt-2 file:mr-3 file:rounded file:border-0 file:bg-accent-subtle file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent"
            />
            <p className="field-hint">The file type is verified from its contents, not its name. The file is stored privately.</p>
          </div>

          <UploadButton pending={pending} />
        </form>

        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="text-base font-semibold text-ink">How it works</h2>
            <ol className="mt-3 space-y-3 text-sm text-ink-muted">
              {[
                'Upload the document. It is validated and stored securely.',
                'Available details are extracted into a draft.',
                'Review and correct every value side by side with the extraction.',
                'Confirm and Save. The vendor is created and the document attached.',
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-xs font-bold text-accent">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
          {engine && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                engine.readsScannedDocuments
                  ? 'border-success/30 bg-success-subtle text-success'
                  : 'border-warning/30 bg-warning-subtle text-warning'
              }`}
            >
              <p className="font-semibold">
                {engine.readsScannedDocuments ? 'OCR engine active' : 'No OCR engine configured'}
              </p>
              <p className="mt-0.5">{engine.message}</p>
            </div>
          )}
        </aside>
      </div>
    );
  }

  const { initial, confidence } = toFormInitial(job);
  const review: OcrReview = {
    jobId: job.id,
    extracted: job.prefill ?? {},
    confidence,
    note: job.normalizedResult?.note,
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-subtle text-accent">
            <IconFile size={20} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink">{job.document.originalFilename}</p>
            <p className="text-sm text-ink-subtle">
              {job.document.mimeType} &middot; {formatBytes(job.document.sizeBytes)} &middot; stored, will be attached on save
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            job.status === 'COMPLETED' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'
          }`}
        >
          <IconCheckCircle size={14} />
          {job.status === 'COMPLETED' ? `Extraction finished · ${Object.keys(job.prefill ?? {}).length} field(s)` : 'Extraction failed'}
        </span>
        {job.errorMessage && <p className="w-full text-sm text-danger">{job.errorMessage} &mdash; enter the details manually below.</p>}
      </div>

      {job.status === 'COMPLETED' ? (
        <VendorForm
          mode="ocr"
          categories={categories}
          productCategories={productCategories}
          permissions={permissions}
          initial={initial}
          ocr={review}
          initialDuplicates={state.duplicates ?? []}
        />
      ) : (
        <div className="card p-5 text-sm text-ink-muted">
          The document could not be read. It has been stored, but an OCR draft that failed cannot be
          confirmed. <a href="/vendors/new" className="link-pill font-medium">Enter the vendor manually</a>{' '}
          or upload a clearer copy.
        </div>
      )}
    </div>
  );
}
