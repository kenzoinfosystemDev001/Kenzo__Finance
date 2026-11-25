'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ActionMenu, ConfirmDialog, type MenuItem } from '@/components/client-ui';
import { DocumentsManager, type ManagedDocument } from '@/components/documents-manager';
import { IconDownload, IconEye, IconPencil, IconTrash, IconX } from '@/components/icons';
import {
  changeFinalInvoiceStatusAction,
  deleteFinalInvoiceAction,
  removeFinalInvoiceDocumentAction,
  replaceFinalInvoiceDocumentAction,
  uploadFinalInvoiceDocumentAction,
} from '@/lib/final-invoice-actions';
import { FINAL_INVOICE_DOCUMENT_KIND_LABELS, finalInvoiceStatusActions, type FinalInvoiceStatusAction } from '@/lib/final-invoice-labels';
import type { FinalInvoiceStatus } from '@/lib/types';

export interface FinalInvoiceActionRef {
  id: string;
  invoiceNumber: string | null;
  status: FinalInvoiceStatus;
  approvalRequired: boolean;
  deletable: boolean;
  issued: boolean;
}

/** Edit, lifecycle steps, PDF download/preview, cancel and delete. The API re-checks every step. */
export function FinalInvoiceHeaderActions({ invoice, permissions }: { invoice: FinalInvoiceActionRef; permissions: string[] }) {
  const router = useRouter();
  const can = (p: string) => permissions.includes(p);
  const [action, setAction] = useState<FinalInvoiceStatusAction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const ref = invoice.invoiceNumber ?? 'Draft invoice';

  const all = finalInvoiceStatusActions(invoice.status, invoice.approvalRequired, permissions);
  const primary = all.filter((a) => a.target !== 'CANCELLED');
  const cancel = all.find((a) => a.target === 'CANCELLED');

  const menu: MenuItem[] = [];
  if (cancel) menu.push({ label: cancel.label, icon: <IconX size={16} />, tone: 'danger', onSelect: () => setAction(cancel) });
  if (can('invoice.delete') && invoice.deletable) menu.push({ label: 'Delete draft', icon: <IconTrash size={16} />, tone: 'danger', onSelect: () => setDeleting(true) });

  return (
    <div className="flex max-w-xl flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {can('invoice.update') && invoice.status === 'DRAFT' && (
          <Link href={`/final-invoices/${invoice.id}/edit`} className="btn-primary"><IconPencil size={16} /> Edit draft</Link>
        )}
        {primary.map((a) => (
          <button key={a.target} type="button" className={a.tone === 'danger' ? 'btn-danger' : 'btn-secondary'} onClick={() => setAction(a)}>
            {a.label}
          </button>
        ))}
        {can('invoice.download') && (
          <>
            <a href={`/final-invoices/${invoice.id}/pdf`} className="btn-secondary"><IconDownload size={16} /> {invoice.issued ? 'Download PDF' : 'Draft PDF'}</a>
            <a href={`/final-invoices/${invoice.id}/pdf?inline=1`} target="_blank" rel="noopener" className="btn-secondary"><IconEye size={16} /> Preview / Print</a>
          </>
        )}
        {menu.length > 0 && <ActionMenu items={menu} label={`More actions for ${ref}`} />}
      </div>
      {invoice.approvalRequired && invoice.status === 'DRAFT' && !can('invoice.submit') && (
        <p className="text-right text-xs text-ink-subtle">Approval is required before issue; someone with permission to submit must send it for approval.</p>
      )}

      <ConfirmDialog
        key={action?.target ?? 'none'}
        open={action !== null}
        onClose={() => setAction(null)}
        tone={action?.tone ?? 'primary'}
        title={action?.title ?? ''}
        message={<><strong className="text-ink">{ref}</strong>. {action?.message}</>}
        confirmLabel={action?.label ?? 'Confirm'}
        withReason
        reasonLabel={action?.remarksRequired ? 'Reason (required, kept in the status history)' : 'Remarks (optional, kept in the status history)'}
        onConfirm={async (remarks) => {
          if (!action) return { error: 'Choose an action.' };
          if (action.remarksRequired && !remarks.trim()) return { error: 'A reason is required for this step.' };
          const outcome = await changeFinalInvoiceStatusAction(invoice.id, action.target, remarks);
          if (outcome.ok) router.refresh();
          return outcome;
        }}
      />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete draft invoice?"
        message={
          <>
            This draft was never issued and has no number; it will be removed permanently. The proforma invoice becomes available for a new invoice. This cannot be undone.
          </>
        }
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          const outcome = await deleteFinalInvoiceAction(invoice.id);
          if (outcome.ok) router.push('/final-invoices');
          return outcome;
        }}
      />
    </div>
  );
}

const UPLOAD_KINDS = [{ value: 'FINAL_INVOICE_ATTACHMENT', label: FINAL_INVOICE_DOCUMENT_KIND_LABELS.FINAL_INVOICE_ATTACHMENT }];

export function FinalInvoiceDocumentsPanel({ invoiceId, documents, canManage, canDownload }: { invoiceId: string; documents: ManagedDocument[]; canManage: boolean; canDownload: boolean }) {
  return (
    <DocumentsManager
      basePath={`/final-invoices/${invoiceId}/documents`}
      documents={documents}
      kinds={UPLOAD_KINDS}
      canUpload={canManage}
      canRemove={canManage}
      canDownload={canDownload}
      emptyText="Attach supporting documents for this invoice, such as the customer's purchase order or delivery acknowledgement."
      onUpload={(data) => uploadFinalInvoiceDocumentAction(invoiceId, data)}
      onReplace={(documentId, data) => replaceFinalInvoiceDocumentAction(invoiceId, documentId, data)}
      onRemove={(documentId) => removeFinalInvoiceDocumentAction(invoiceId, documentId)}
    />
  );
}
