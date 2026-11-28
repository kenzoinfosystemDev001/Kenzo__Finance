import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { EnquiryAssignee, ProformaDetail } from '@/lib/types';
import { PROFORMA_STATUS_LABELS } from '@/lib/proforma-labels';
import { ErrorState } from '@/components/ui';
import { ProformaForm } from '@/components/proforma-form';
import { IconChevronLeft } from '@/components/icons';

export const metadata: Metadata = { title: 'Edit Proforma Invoice' };

const day = (value: string | null) => (value ? value.slice(0, 10) : '');

export default async function EditProformaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user?.permissions.includes('proforma.update')) {
    return <ErrorState title="Not allowed" message="You do not have permission to edit proforma invoices." />;
  }

  let pi: ProformaDetail;
  try {
    pi = await apiFetch<ProformaDetail>(`/proforma-invoices/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  if (pi.status !== 'DRAFT') {
    return (
      <div className="space-y-4">
        <ErrorState
          title="This proforma invoice cannot be edited"
          message={`It is ${PROFORMA_STATUS_LABELS[pi.status].toLowerCase()}. Only drafts can be edited${pi.issuedAt ? '; to correct an issued PI, cancel it and raise a replacement' : ''}.`}
        />
        <Link href={`/proforma-invoices/${pi.id}`} className="btn-secondary w-fit"><IconChevronLeft size={16} /> Back to {pi.piNumber}</Link>
      </div>
    );
  }

  const [assignees, contacts] = await Promise.all([
    apiFetch<EnquiryAssignee[]>('/proforma-invoices/assignees').catch(() => [] as EnquiryAssignee[]),
    apiFetch<Array<{ id: string; name: string; designation: string | null }>>(`/customers/${pi.customerId}/contacts`).catch(() =>
      pi.contact ? [{ id: pi.contact.id, name: pi.contact.name, designation: null }] : [],
    ),
  ]);
  // Keep a departed assignee visible so saving does not silently change it.
  const assigneeOptions = pi.assignedTo && !assignees.some((a) => a.id === pi.assignedTo!.id) ? [...assignees, { ...pi.assignedTo, email: '' } as EnquiryAssignee] : assignees;
  const bank = pi.bankDetails ?? {};

  return (
    <div className="space-y-5">
      <Link href={`/proforma-invoices/${pi.id}`} className="link-pill-neutral text-sm"><IconChevronLeft size={16} /> Back to {pi.piNumber}</Link>
      <div>
        <h1 className="text-2xl font-bold text-ink">Edit {pi.piNumber}</h1>
        <p className="text-base text-ink-muted">Draft proforma invoice for {pi.customer.name}.</p>
      </div>
      <ProformaForm
        mode="edit"
        proformaId={pi.id}
        piNumber={pi.piNumber}
        quotationRef={{ quotationNumber: pi.quotation.quotationNumber, revisionNumber: pi.quotationRevision.revisionNumber, acceptedAt: pi.quotation.acceptedAt, enquiryNumber: pi.quotation.enquiry?.enquiryNumber ?? null }}
        customerName={pi.customer.name}
        customerSnapshot={pi.customerSnapshot}
        contacts={Array.isArray(contacts) ? contacts : []}
        assignees={assigneeOptions}
        currency={pi.currency}
        items={pi.items}
        totals={pi}
        approvalRequired={pi.approvalRequired}
        initial={{
          piDate: day(pi.piDate),
          dueDate: day(pi.dueDate),
          contactId: pi.contactId ?? '',
          assignedToId: pi.assignedToId ?? '',
          subject: pi.subject ?? '',
          referenceNumber: pi.referenceNumber ?? '',
          internalRemarks: pi.internalRemarks ?? '',
          advanceAmount: pi.advanceAmount ?? '',
          paymentTerms: pi.paymentTerms ?? '',
          deliveryTerms: pi.deliveryTerms ?? '',
          warrantyTerms: pi.warrantyTerms ?? '',
          termsAndConditions: pi.termsAndConditions ?? '',
          notes: pi.notes ?? '',
          paymentInstructions: pi.paymentInstructions ?? '',
          bankDetails: { bankName: bank.bankName ?? '', accountName: bank.accountName ?? '', accountNumber: bank.accountNumber ?? '', ifsc: bank.ifsc ?? '', swift: bank.swift ?? '', branch: bank.branch ?? '' },
        }}
      />
    </div>
  );
}
