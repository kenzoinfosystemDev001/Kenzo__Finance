'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import { ActionMenu, ConfirmDialog, Modal, ResultAlert, SelectField, TextField, type MenuItem } from '@/components/client-ui';
import { DocumentsManager, type ManagedDocument } from '@/components/documents-manager';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';
import { IconDownload, IconPencil, IconPlus, IconTrash, IconX } from '@/components/icons';
import {
  addQuotationCommunicationAction,
  changeQuotationStatusAction,
  deleteQuotationAction,
  removeQuotationDocumentAction,
  replaceQuotationDocumentAction,
  uploadQuotationDocumentAction,
} from '@/lib/quotation-actions';
import { FOLLOW_UP_METHOD_LABELS } from '@/lib/enquiry-labels';
import { QUOTATION_DOCUMENT_KIND_LABELS, statusActions, type StatusAction } from '@/lib/quotation-labels';
import { formatDateTime } from '@/lib/vendor-labels';
import type { ActionResult } from '@/lib/vendor-actions';
import type { FollowUpMethod, QuotationCommunication, QuotationStatus } from '@/lib/types';
import { canRevise, useNewRevision } from '../quotation-row-actions';

// ---------------------------------------------------------------------------
// Header actions: edit draft, lifecycle steps, PDF, new revision, cancel, delete
// ---------------------------------------------------------------------------

export interface QuotationActionRef {
  id: string;
  quotationNumber: string;
  status: QuotationStatus;
  currentRevisionNumber: number;
  approvalRequired: boolean;
  /** The current revision's validity date has passed. */
  validityPassed: boolean;
  /** Never issued, single draft revision, no documents. */
  deletable: boolean;
}

export function QuotationHeaderActions({ quotation, permissions }: { quotation: QuotationActionRef; permissions: string[] }) {
  const router = useRouter();
  const can = (p: string) => permissions.includes(p);
  const revision = useNewRevision(quotation);
  const [action, setAction] = useState<StatusAction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const all = statusActions(quotation.status, quotation.approvalRequired, permissions);
  const sendBlocked = quotation.validityPassed && all.some((a) => a.target === 'SENT');
  const primary = all.filter((a) => a.target !== 'CANCELLED' && !(a.target === 'SENT' && sendBlocked));
  const cancel = all.find((a) => a.target === 'CANCELLED');

  const menu: MenuItem[] = [];
  if (cancel) menu.push({ label: cancel.label, icon: <IconX size={16} />, tone: 'danger', onSelect: () => setAction(cancel) });
  if (can('quotation.delete') && quotation.deletable) menu.push({ label: 'Delete draft', icon: <IconTrash size={16} />, tone: 'danger', onSelect: () => setDeleting(true) });

  return (
    <div className="flex max-w-xl flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {can('quotation.update') && quotation.status === 'DRAFT' && (
          <Link href={`/quotations/${quotation.id}/edit`} className="btn-primary"><IconPencil size={16} /> Edit draft</Link>
        )}
        {primary.map((a) => (
          <button key={a.target} type="button" className={a.tone === 'danger' ? 'btn-danger' : 'btn-secondary'} onClick={() => setAction(a)}>
            {a.label}
          </button>
        ))}
        {can('quotation.download') && (
          <a href={`/quotations/${quotation.id}/revisions/${quotation.currentRevisionNumber}/pdf`} className="btn-secondary">
            <IconDownload size={16} /> {quotation.status === 'DRAFT' || quotation.status === 'PENDING_APPROVAL' || quotation.status === 'APPROVED' ? 'Draft PDF' : 'Download PDF'}
          </a>
        )}
        {canRevise(quotation.status, permissions) && (
          <button type="button" className="btn-secondary" onClick={revision.start}>New revision</button>
        )}
        <ActionMenu items={menu} label={`More actions for ${quotation.quotationNumber}`} />
      </div>
      {sendBlocked && (
        <p className="text-right text-xs text-warning">
          Mark as Sent is unavailable: the validity date has passed. {quotation.status === 'DRAFT' ? 'Edit the draft to change it.' : 'Create a new revision to change it.'}
        </p>
      )}
      {quotation.approvalRequired && quotation.status === 'DRAFT' && !can('quotation.submit') && (
        <p className="text-right text-xs text-ink-subtle">Approval is required before sending; someone with permission to submit must send it for approval.</p>
      )}
      {revision.dialog}

      <ConfirmDialog
        key={action?.target ?? 'none'}
        open={action !== null}
        onClose={() => setAction(null)}
        tone={action?.tone ?? 'primary'}
        title={action?.title ?? ''}
        message={<><strong className="text-ink">{quotation.quotationNumber}</strong> revision {quotation.currentRevisionNumber}. {action?.message}</>}
        confirmLabel={action?.label ?? 'Confirm'}
        withReason
        reasonLabel={action?.remarksRequired ? 'Remarks (required, kept in the status history)' : 'Remarks (optional, kept in the status history)'}
        onConfirm={async (remarks) => {
          if (!action) return { error: 'Choose an action.' };
          if (action.remarksRequired && !remarks.trim()) return { error: 'Remarks are required for this step.' };
          const outcome = await changeQuotationStatusAction(quotation.id, action.target, remarks);
          if (outcome.ok) router.refresh();
          return outcome;
        }}
      />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete draft quotation?"
        message={
          <>
            <strong className="text-ink">{quotation.quotationNumber}</strong> was never issued and will be removed permanently. If it was created from an
            enquiry, the enquiry returns to Ready for Quotation. This cannot be undone.
          </>
        }
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          const outcome = await deleteQuotationAction(quotation.id);
          if (outcome.ok) router.push('/quotations');
          return outcome;
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents (uploads; generated PDFs are listed separately and are read-only)
// ---------------------------------------------------------------------------

const UPLOAD_KINDS = (['QUOTATION_CUSTOMER_DOCUMENT', 'QUOTATION_ATTACHMENT'] as const).map((value) => ({ value, label: QUOTATION_DOCUMENT_KIND_LABELS[value] }));

export function QuotationDocumentsPanel({
  quotationId,
  documents,
  canManage,
  canDownload,
}: {
  quotationId: string;
  documents: ManagedDocument[];
  canManage: boolean;
  canDownload: boolean;
}) {
  return (
    <DocumentsManager
      basePath={`/quotations/${quotationId}/documents`}
      documents={documents}
      kinds={UPLOAD_KINDS}
      canUpload={canManage}
      canRemove={canManage}
      canDownload={canDownload}
      emptyText="Attach the customer's documents (RFQ, purchase order, approvals) or supporting files for this quotation."
      onUpload={(data) => uploadQuotationDocumentAction(quotationId, data)}
      onReplace={(documentId, data) => replaceQuotationDocumentAction(quotationId, documentId, data)}
      onRemove={(documentId) => removeQuotationDocumentAction(quotationId, documentId)}
    />
  );
}

// ---------------------------------------------------------------------------
// Communication log (a record of what happened; nothing is sent)
// ---------------------------------------------------------------------------

/** Date -> value for <input type="datetime-local"> in the browser's time zone. */
const toLocalInput = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const CHANNELS = Object.entries(FOLLOW_UP_METHOD_LABELS).map(([value, label]) => ({ value, label }));

export function QuotationCommunicationPanel({
  quotationId,
  quotationNumber,
  communications,
  defaultContactName,
  canLog,
}: {
  quotationId: string;
  quotationNumber: string;
  communications: QuotationCommunication[];
  defaultContactName: string;
  canLog: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <section className="card">
      <PanelHeader
        title="Communication log"
        description="A record of conversations with the customer about this quotation. Logging an entry does not contact the customer."
        actions={canLog && <button type="button" className="btn-primary" onClick={() => setOpen(true)}><IconPlus size={16} /> Log communication</button>}
      />
      {communications.length === 0 ? (
        <EmptyStateClient title="Nothing logged yet" description="Record calls, emails, meetings and messages with the customer here after they happen." />
      ) : (
        <ol className="divide-y divide-border">
          {communications.map((c) => (
            <li key={c.id} className="flex gap-4 px-5 py-4">
              <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent-subtle" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold text-ink">
                  {FOLLOW_UP_METHOD_LABELS[c.channel]}
                  {c.contactName && <span className="font-normal text-ink-muted"> with {c.contactName}</span>}
                </p>
                <p className="text-xs text-ink-subtle">
                  <time dateTime={c.occurredAt}>{formatDateTime(c.occurredAt)}</time>
                  {c.revisionNumber !== null && <> &middot; revision {c.revisionNumber}</>}
                  {c.createdBy && <> &middot; recorded by {c.createdBy.fullName}</>}
                </p>
                <p className="whitespace-pre-line text-sm text-ink">{c.summary}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {canLog && (
        <CommunicationModal
          key={open ? 'open' : 'closed'}
          quotationId={quotationId}
          quotationNumber={quotationNumber}
          defaultContactName={defaultContactName}
          open={open}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </section>
  );
}

function CommunicationModal({
  quotationId,
  quotationNumber,
  defaultContactName,
  open,
  onClose,
  onSaved,
}: {
  quotationId: string;
  quotationNumber: string;
  defaultContactName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => ({ occurredAt: toLocalInput(new Date()), channel: 'PHONE' as FollowUpMethod, contactName: defaultContactName, summary: '' }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors(({ [k]: _r, ...rest }) => rest);
  };

  const save = () => {
    const e: Record<string, string> = {};
    const when = new Date(form.occurredAt);
    if (!form.occurredAt || Number.isNaN(when.getTime())) e.occurredAt = 'Enter when it happened.';
    else if (when.getTime() > Date.now() + 5 * 60_000) e.occurredAt = 'The log records what already happened; the date cannot be in the future.';
    if (!form.summary.trim()) e.summary = 'Summary is required.';
    if (form.contactName.length > 150) e.contactName = 'At most 150 characters.';
    setErrors(e);
    if (Object.keys(e).length) return;
    startTransition(async () => {
      const outcome = await addQuotationCommunicationAction(quotationId, { ...form, occurredAt: when.toISOString() });
      if (outcome.ok) onSaved();
      else setResult(outcome);
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log communication"
      description={`${quotationNumber} · records what happened; nothing is sent to the customer.`}
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={pending}>{pending ? 'Saving...' : 'Save entry'}</button></>}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Date & Time" type="datetime-local" required value={form.occurredAt} onChange={(v) => set('occurredAt', v)} error={errors.occurredAt} />
        <SelectField label="Channel" required value={form.channel} onChange={(v) => set('channel', v as FollowUpMethod)} options={CHANNELS} />
        <TextField label="Customer Contact" value={form.contactName} onChange={(v) => set('contactName', v)} error={errors.contactName} maxLength={150} className="sm:col-span-2" />
        <div className="sm:col-span-2">
          <label htmlFor="comm-summary" className="field-label">Summary<span className="text-danger"> *</span></label>
          <textarea id="comm-summary" rows={4} maxLength={4000} value={form.summary} onChange={(e) => set('summary', e.target.value)} className={clsx('field-input', errors.summary && 'border-danger')} />
          {errors.summary && <p className="field-error">{errors.summary}</p>}
        </div>
        <div className="sm:col-span-2"><ResultAlert result={result} /></div>
      </div>
    </Modal>
  );
}
