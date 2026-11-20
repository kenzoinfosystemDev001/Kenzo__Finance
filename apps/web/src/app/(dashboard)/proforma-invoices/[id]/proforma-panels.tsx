'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ActionMenu, ConfirmDialog, type MenuItem } from '@/components/client-ui';
import { DocumentsManager, type ManagedDocument } from '@/components/documents-manager';
import { IconDownload, IconEye, IconPencil, IconTrash, IconX } from '@/components/icons';
import {
  changeProformaStatusAction,
  deleteProformaAction,
  removeProformaDocumentAction,
  replaceProformaDocumentAction,
  uploadProformaDocumentAction,
} from '@/lib/proforma-actions';
import { PROFORMA_DOCUMENT_KIND_LABELS, proformaStatusActions, type ProformaStatusAction } from '@/lib/proforma-labels';
import type { ProformaStatus } from '@/lib/types';

export interface ProformaActionRef {
  id: string;
  piNumber: string;
  status: ProformaStatus;
  approvalRequired: boolean;
  deletable: boolean;
  issued: boolean;
}

/** Edit, lifecycle steps, PDF download/preview, cancel and delete. The API re-checks every step. */
export function ProformaHeaderActions({ pi, permissions }: { pi: ProformaActionRef; permissions: string[] }) {
  const router = useRouter();
  const can = (p: string) => permissions.includes(p);
  const [action, setAction] = useState<ProformaStatusAction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const all = proformaStatusActions(pi.status, pi.approvalRequired, permissions);
  const primary = all.filter((a) => a.target !== 'CANCELLED');
  const cancel = all.find((a) => a.target === 'CANCELLED');

  const menu: MenuItem[] = [];
  if (cancel) menu.push({ label: cancel.label, icon: <IconX size={16} />, tone: 'danger', onSelect: () => setAction(cancel) });
  if (can('proforma.delete') && pi.deletable) menu.push({ label: 'Delete draft', icon: <IconTrash size={16} />, tone: 'danger', onSelect: () => setDeleting(true) });

  return (
    <div className="flex max-w-xl flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {can('proforma.update') && pi.status === 'DRAFT' && (
          <Link href={`/proforma-invoices/${pi.id}/edit`} className="btn-primary"><IconPencil size={16} /> Edit draft</Link>
        )}
        {primary.map((a) => (
          <button key={a.target} type="button" className={a.tone === 'danger' ? 'btn-danger' : 'btn-secondary'} onClick={() => setAction(a)}>
            {a.label}
          </button>
        ))}
        {can('proforma.download') && (
          <>
            <a href={`/proforma-invoices/${pi.id}/pdf`} className="btn-secondary"><IconDownload size={16} /> {pi.issued ? 'Download PDF' : 'Draft PDF'}</a>
            <a href={`/proforma-invoices/${pi.id}/pdf?inline=1`} target="_blank" rel="noopener" className="btn-secondary"><IconEye size={16} /> Preview / Print</a>
          </>
        )}
        {menu.length > 0 && <ActionMenu items={menu} label={`More actions for ${pi.piNumber}`} />}
      </div>
      {pi.approvalRequired && pi.status === 'DRAFT' && !can('proforma.submit') && (
        <p className="text-right text-xs text-ink-subtle">Approval is required before issue; someone with permission to submit must send it for approval.</p>
      )}

      <ConfirmDialog
        key={action?.target ?? 'none'}
        open={action !== null}
        onClose={() => setAction(null)}
        tone={action?.tone ?? 'primary'}
        title={action?.title ?? ''}
        message={<><strong className="text-ink">{pi.piNumber}</strong>. {action?.message}</>}
        confirmLabel={action?.label ?? 'Confirm'}
        withReason
        reasonLabel={action?.remarksRequired ? 'Reason (required, kept in the status history)' : 'Remarks (optional, kept in the status history)'}
        onConfirm={async (remarks) => {
          if (!action) return { error: 'Choose an action.' };
          if (action.remarksRequired && !remarks.trim()) return { error: 'A reason is required for this step.' };
          const outcome = await changeProformaStatusAction(pi.id, action.target, remarks);
          if (outcome.ok) router.refresh();
          return outcome;
        }}
      />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete draft proforma invoice?"
        message={
          <>
            <strong className="text-ink">{pi.piNumber}</strong> was never issued and will be removed permanently. The accepted quotation becomes available for a new proforma
            invoice. This cannot be undone.
          </>
        }
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          const outcome = await deleteProformaAction(pi.id);
          if (outcome.ok) router.push('/proforma-invoices');
          return outcome;
        }}
      />
    </div>
  );
}

const UPLOAD_KINDS = [{ value: 'PROFORMA_ATTACHMENT', label: PROFORMA_DOCUMENT_KIND_LABELS.PROFORMA_ATTACHMENT }];

export function ProformaDocumentsPanel({ piId, documents, canManage, canDownload }: { piId: string; documents: ManagedDocument[]; canManage: boolean; canDownload: boolean }) {
  return (
    <DocumentsManager
      basePath={`/proforma-invoices/${piId}/documents`}
      documents={documents}
      kinds={UPLOAD_KINDS}
      canUpload={canManage}
      canRemove={canManage}
      canDownload={canDownload}
      emptyText="Attach supporting documents for this proforma invoice, such as the customer's purchase order."
      onUpload={(data) => uploadProformaDocumentAction(piId, data)}
      onReplace={(documentId, data) => replaceProformaDocumentAction(piId, documentId, data)}
      onRemove={(documentId) => removeProformaDocumentAction(piId, documentId)}
    />
  );
}
