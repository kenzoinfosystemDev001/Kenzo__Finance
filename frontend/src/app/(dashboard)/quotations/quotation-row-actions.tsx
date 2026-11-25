'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ActionMenu, ConfirmDialog, type MenuItem } from '@/components/client-ui';
import { IconDownload, IconEye, IconInbox, IconPencil, IconRefresh, IconUser } from '@/components/icons';
import { createRevisionAction } from '@/lib/quotation-actions';
import { REVISABLE_STATUSES } from '@/lib/quotation-labels';
import type { QuotationStatus } from '@/lib/types';

export interface QuotationRowRef {
  id: string;
  quotationNumber: string;
  status: QuotationStatus;
  currentRevisionNumber: number;
  customerId: string;
  enquiryId: string | null;
}

export const canRevise = (status: QuotationStatus, permissions: string[]) => permissions.includes('quotation.revise') && REVISABLE_STATUSES.includes(status);

/** Starts a new draft revision (a copy of the current one) and opens it for editing. */
export function useNewRevision(quotation: Pick<QuotationRowRef, 'id' | 'quotationNumber' | 'currentRevisionNumber'>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const dialog = (
    <ConfirmDialog
      open={open}
      onClose={() => setOpen(false)}
      tone="primary"
      title="Create a new revision?"
      message={
        <>
          Revision {quotation.currentRevisionNumber + 1} of <strong className="text-ink">{quotation.quotationNumber}</strong> starts as a draft copy of
          revision {quotation.currentRevisionNumber}, which is kept exactly as it is and marked superseded.
        </>
      }
      confirmLabel="Create revision"
      withReason
      reasonLabel="Why is it being revised? (optional, shown in the history)"
      onConfirm={async (remarks) => {
        const outcome = await createRevisionAction(quotation.id, remarks);
        if (outcome.ok) router.push(`/quotations/${quotation.id}/edit`);
        return outcome;
      }}
    />
  );
  return { start: () => setOpen(true), dialog };
}

/** View / edit draft / more for one quotation. Items follow permissions; the API enforces the same. */
export function QuotationRowActions({ quotation, permissions }: { quotation: QuotationRowRef; permissions: string[] }) {
  const router = useRouter();
  const can = (p: string) => permissions.includes(p);
  const revision = useNewRevision(quotation);

  const items: MenuItem[] = [];
  if (can('quotation.download')) {
    items.push({
      label: 'Download PDF',
      icon: <IconDownload size={16} />,
      onSelect: () => window.location.assign(`/quotations/${quotation.id}/revisions/${quotation.currentRevisionNumber}/pdf`),
    });
  }
  if (canRevise(quotation.status, permissions)) {
    items.push({ label: 'New revision', icon: <IconRefresh size={16} />, onSelect: revision.start });
  }
  if (can('customer.read')) {
    items.push({ label: 'View customer', icon: <IconUser size={16} />, onSelect: () => router.push(`/customers/${quotation.customerId}`) });
  }
  if (quotation.enquiryId && can('enquiry.read')) {
    items.push({ label: 'View enquiry', icon: <IconInbox size={16} />, onSelect: () => router.push(`/enquiries/${quotation.enquiryId}`) });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Link href={`/quotations/${quotation.id}`} className="icon-btn" aria-label={`View ${quotation.quotationNumber}`} title="View"><IconEye /></Link>
      {can('quotation.update') && quotation.status === 'DRAFT' && (
        <Link href={`/quotations/${quotation.id}/edit`} className="icon-btn" aria-label={`Edit draft ${quotation.quotationNumber}`} title="Edit draft"><IconPencil /></Link>
      )}
      <ActionMenu items={items} label={`More actions for ${quotation.quotationNumber}`} />
      {revision.dialog}
    </div>
  );
}

/** "New revision" as a button (profile header, and the edit page of an issued quotation). */
export function NewRevisionButton({ quotation, primary = false }: { quotation: Pick<QuotationRowRef, 'id' | 'quotationNumber' | 'currentRevisionNumber'>; primary?: boolean }) {
  const revision = useNewRevision(quotation);
  return (
    <>
      <button type="button" className={primary ? 'btn-primary' : 'btn-secondary'} onClick={revision.start}>
        <IconRefresh size={16} /> New revision
      </button>
      {revision.dialog}
    </>
  );
}
