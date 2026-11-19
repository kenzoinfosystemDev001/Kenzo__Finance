'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ActionMenu, ConfirmDialog, Modal, ResultAlert, type MenuItem } from '@/components/client-ui';
import { IconArrowRight, IconClock, IconEye, IconPencil, IconTrash, IconUser, IconX } from '@/components/icons';
import { checkEnquiryConversionAction, changeEnquiryStatusAction, deleteEnquiryAction } from '@/lib/enquiry-actions';
import { ENQUIRY_STATUS_TRANSITIONS, isEnquiryLocked } from '@/lib/enquiry-labels';
import type { ActionResult } from '@/lib/vendor-actions';
import type { EnquiryStatus } from '@/lib/types';

export interface EnquiryRowRef {
  id: string;
  enquiryNumber: string;
  status: EnquiryStatus;
  customerId: string;
}

export const canConvertStatus = (status: EnquiryStatus) => !['CONVERTED', 'LOST', 'CLOSED'].includes(status);

/**
 * Convert to Quotation: asks the API whether the enquiry can be converted.
 * When it can, hands over to Quotation Management; otherwise lists why not.
 */
export function useEnquiryConversion(enquiry: { id: string; enquiryNumber: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problems, setProblems] = useState<ActionResult & { list?: string[] } | null>(null);

  const start = () =>
    startTransition(async () => {
      const outcome = await checkEnquiryConversionAction(enquiry.id);
      if (outcome.check?.ready) {
        router.push(`/quotations/new?enquiryId=${enquiry.id}`);
        return;
      }
      setProblems(outcome.check ? { list: outcome.check.problems } : outcome);
    });

  const dialog = (
    <Modal
      open={problems !== null}
      onClose={() => setProblems(null)}
      size="sm"
      title={`${enquiry.enquiryNumber} cannot be converted yet`}
      footer={<button type="button" className="btn-secondary" onClick={() => setProblems(null)}>Close</button>}
    >
      {problems?.list ? (
        <div className="space-y-2 text-base text-ink-muted">
          <p>Resolve these before creating a quotation:</p>
          <ul className="list-inside list-disc space-y-1 text-ink">
            {problems.list.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      ) : (
        <ResultAlert result={problems ?? {}} />
      )}
    </Modal>
  );

  return { start, pending, dialog };
}

/** View / Edit / More for one enquiry. Items follow permissions; the API enforces the same. */
export function EnquiryRowActions({
  enquiry,
  permissions,
  compact = true,
  afterDelete = 'refresh',
}: {
  enquiry: EnquiryRowRef;
  permissions: string[];
  compact?: boolean;
  afterDelete?: 'refresh' | 'list';
}) {
  const router = useRouter();
  const [pending, setPending] = useState<'close' | 'delete' | null>(null);
  const can = (p: string) => permissions.includes(p);
  const locked = isEnquiryLocked(enquiry.status);
  const conversion = useEnquiryConversion(enquiry);

  const items: MenuItem[] = [];
  if (compact) {
    if (can('enquiry.manage_follow_ups') && enquiry.status !== 'CONVERTED') {
      items.push({ label: 'Add follow-up', icon: <IconClock size={16} />, onSelect: () => router.push(`/enquiries/${enquiry.id}?tab=followups&add=1`) });
    }
    if (can('customer.read')) {
      items.push({ label: 'View customer', icon: <IconUser size={16} />, onSelect: () => router.push(`/customers/${enquiry.customerId}`) });
    }
    if (can('enquiry.convert') && canConvertStatus(enquiry.status)) {
      items.push({ label: conversion.pending ? 'Checking...' : 'Convert to quotation', icon: <IconArrowRight size={16} />, onSelect: conversion.start });
    }
  }
  if (can('enquiry.change_status') && ENQUIRY_STATUS_TRANSITIONS[enquiry.status].includes('CLOSED')) {
    items.push({ label: 'Close enquiry', icon: <IconX size={16} />, onSelect: () => setPending('close') });
  }
  if (can('enquiry.delete')) {
    items.push({ label: 'Delete enquiry', icon: <IconTrash size={16} />, tone: 'danger', onSelect: () => setPending('delete') });
  }

  const number = <strong className="text-ink">{enquiry.enquiryNumber}</strong>;

  return (
    <div className="flex items-center justify-end gap-1">
      {compact && (
        <>
          <Link href={`/enquiries/${enquiry.id}`} className="icon-btn" aria-label={`View ${enquiry.enquiryNumber}`} title="View"><IconEye /></Link>
          {can('enquiry.update') && !locked && (
            <Link href={`/enquiries/${enquiry.id}/edit`} className="icon-btn" aria-label={`Edit ${enquiry.enquiryNumber}`} title="Edit"><IconPencil /></Link>
          )}
        </>
      )}
      <ActionMenu items={items} label={`More actions for ${enquiry.enquiryNumber}`} />
      {conversion.dialog}

      <ConfirmDialog
        open={pending === 'close'}
        onClose={() => setPending(null)}
        title="Close enquiry?"
        message={<>{number} will be closed. It stays on record with its follow-ups and history, and can be reopened with a reason.</>}
        confirmLabel="Close enquiry"
        withReason
        reasonLabel="Reason (required, kept in the status history)"
        onConfirm={async (reason) => {
          if (!reason.trim()) return { error: 'Give a reason for closing the enquiry.' };
          const outcome = await changeEnquiryStatusAction(enquiry.id, 'CLOSED', reason);
          if (outcome.ok) router.refresh();
          return outcome;
        }}
      />
      <ConfirmDialog
        open={pending === 'delete'}
        onClose={() => setPending(null)}
        title="Delete enquiry permanently?"
        message={
          <>
            This removes {number} and its product requirements. It is refused once the enquiry has follow-ups, attachments
            or a quotation &mdash; close it instead. The customer and products are not affected. This cannot be undone.
          </>
        }
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          const outcome = await deleteEnquiryAction(enquiry.id);
          if (outcome.ok) {
            if (afterDelete === 'list') router.push('/enquiries');
            else router.refresh();
          }
          return outcome;
        }}
      />
    </div>
  );
}
