'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { ConfirmDialog, Modal, ResultAlert } from '@/components/client-ui';
import { IconDownload, IconEye, IconFile, IconRefresh, IconTrash, IconUpload } from '@/components/icons';
import type { ActionResult } from '@/lib/vendor-actions';
import { canPreviewInline, documentKindLabel, formatBytes, formatDateTime } from '@/lib/vendor-labels';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';

export interface ManagedDocument {
  id: string;
  kind: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  replacesDocumentId: string | null;
  uploadedBy: { id: string; fullName: string } | null;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.csv,.json,.md';

/**
 * Shared document list for any record (vendor, product, ...). The owner
 * supplies its own upload/replace/remove actions and download path; the API
 * behind those enforces ownership and permissions.
 */
export function DocumentsManager({
  basePath,
  documents,
  kinds,
  canUpload,
  canRemove,
  canDownload,
  emptyText,
  onUpload,
  onReplace,
  onRemove,
}: {
  /** e.g. /vendors/<id>/documents - the proxy route that streams files. */
  basePath: string;
  documents: ManagedDocument[];
  kinds: Array<{ value: string; label: string }>;
  canUpload: boolean;
  canRemove: boolean;
  canDownload: boolean;
  emptyText: string;
  onUpload: (formData: FormData) => Promise<ActionResult>;
  onReplace: (documentId: string, formData: FormData) => Promise<ActionResult>;
  onRemove: (documentId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [replacing, setReplacing] = useState<ManagedDocument | null>(null);
  const [removing, setRemoving] = useState<ManagedDocument | null>(null);
  const canManage = canUpload || canRemove;

  const href = (document: ManagedDocument, preview: boolean) =>
    `${basePath}/${document.id}${preview ? '?preview=1' : ''}`;

  return (
    <section className="card">
      <PanelHeader
        title="Documents"
        description="Stored privately. Files are served only through permission-checked links."
        actions={
          canUpload && (
            <button type="button" className="btn-primary" onClick={() => setUploading(true)}>
              <IconUpload size={16} /> Upload document
            </button>
          )
        }
      />

      {documents.length === 0 ? (
        <EmptyStateClient title="No documents" description={emptyText} />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Type</th>
                <th scope="col" className="text-right">Size</th>
                <th scope="col">Uploaded</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td className="min-w-[200px]">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                        <IconFile size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{document.originalFilename}</p>
                        <p className="text-xs text-ink-subtle">
                          {document.mimeType}
                          {document.replacesDocumentId && ' · replaced an earlier version'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{documentKindLabel(document.kind)}</td>
                  <td className="text-right tabular-nums">{formatBytes(document.sizeBytes)}</td>
                  <td className="whitespace-nowrap">
                    {formatDateTime(document.createdAt)}
                    {document.uploadedBy && <p className="text-xs text-ink-subtle">by {document.uploadedBy.fullName}</p>}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      {canDownload && canPreviewInline(document.mimeType) && (
                        <a href={href(document, true)} target="_blank" rel="noopener noreferrer" className="icon-btn" aria-label={`Preview ${document.originalFilename}`} title="Preview">
                          <IconEye />
                        </a>
                      )}
                      {canDownload && (
                        <a href={href(document, false)} className="icon-btn" aria-label={`Download ${document.originalFilename}`} title="Download">
                          <IconDownload />
                        </a>
                      )}
                      {canUpload && (
                        <button type="button" className="icon-btn" onClick={() => setReplacing(document)} aria-label={`Replace ${document.originalFilename}`} title="Replace">
                          <IconRefresh />
                        </button>
                      )}
                      {canRemove && (
                        <button type="button" className="icon-btn hover:bg-danger-subtle hover:text-danger" onClick={() => setRemoving(document)} aria-label={`Remove ${document.originalFilename}`} title="Remove">
                          <IconTrash />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <>
          <UploadModal
            key={uploading ? 'upload-open' : 'upload-closed'}
            open={uploading}
            title="Upload document"
            submitLabel="Upload"
            kinds={kinds}
            onClose={() => setUploading(false)}
            onSubmit={onUpload}
            onDone={() => { setUploading(false); router.refresh(); }}
          />
          <UploadModal
            key={replacing?.id ?? 'replace-closed'}
            open={replacing !== null}
            title={`Replace ${replacing?.originalFilename ?? 'document'}`}
            description="The current file is archived (kept for audit) and the new file takes its place."
            submitLabel="Replace"
            defaultKind={replacing?.kind}
            kinds={kinds}
            onClose={() => setReplacing(null)}
            onSubmit={(formData) => onReplace(replacing!.id, formData)}
            onDone={() => { setReplacing(null); router.refresh(); }}
          />
          <ConfirmDialog
            open={removing !== null}
            onClose={() => setRemoving(null)}
            title="Remove document?"
            message={
              <>
                <strong className="text-ink">{removing?.originalFilename}</strong> will be removed. The
                file and its record are kept in the audit trail.
              </>
            }
            confirmLabel="Remove document"
            onConfirm={async () => {
              const outcome = await onRemove(removing!.id);
              if (outcome.ok) router.refresh();
              return outcome;
            }}
          />
        </>
      )}
    </section>
  );
}

function UploadModal({
  open,
  title,
  description,
  submitLabel,
  defaultKind,
  kinds,
  onClose,
  onSubmit,
  onDone,
}: {
  open: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  defaultKind?: string;
  kinds: Array<{ value: string; label: string }>;
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onDone: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setResult({ error: 'Choose a file to upload.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setResult({ error: 'The file is larger than 10 MB.' });
      return;
    }
    startTransition(async () => {
      const outcome = await onSubmit(formData);
      if (outcome.ok) onDone();
      else setResult(outcome);
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={pending}>
            {pending ? 'Uploading...' : submitLabel}
          </button>
        </>
      }
    >
      <form
        ref={formRef}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div>
          <label htmlFor="document-kind" className="field-label">Document type</label>
          <select id="document-kind" name="kind" defaultValue={defaultKind ?? kinds[kinds.length - 1]?.value} className="field-input">
            {kinds.map((kind) => (
              <option key={kind.value} value={kind.value}>{kind.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="document-file" className="field-label">File</label>
          <input
            id="document-file"
            name="file"
            type="file"
            accept={ACCEPT}
            required
            className="field-input file:mr-3 file:rounded file:border-0 file:bg-accent-subtle file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent"
          />
          <p className="field-hint">PDF, PNG, JPEG, WEBP, TIFF or text, up to 10 MB. The type is verified from the file contents.</p>
        </div>
        <ResultAlert result={result} />
      </form>
    </Modal>
  );
}
