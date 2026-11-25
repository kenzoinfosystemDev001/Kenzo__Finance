import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { EnquiryAssignee, FinalInvoiceDetail } from '@/lib/types';
import { FINAL_INVOICE_STATUS_LABELS } from '@/lib/final-invoice-labels';
import { ErrorState } from '@/components/ui';
import { FinalInvoiceForm } from '@/components/final-invoice-form';
import { IconChevronLeft } from '@/components/icons';

export const metadata: Metadata = { title: 'Edit Final Invoice' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = (value: string | null) => (value ? value.slice(0, 10) : '');

export default async function EditFinalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user?.permissions.includes('invoice.update')) {
    return <ErrorState title="Not allowed" message="You do not have permission to edit invoices." />;
  }

  let inv: FinalInvoiceDetail;
  try {
    inv = await apiFetch<FinalInvoiceDetail>(`/final-invoices/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
  const ref = inv.invoiceNumber ?? 'draft invoice';

  if (inv.status !== 'DRAFT') {
    return (
      <div className="space-y-4">
        <ErrorState
          title="This invoice cannot be edited"
          message={`It is ${FINAL_INVOICE_STATUS_LABELS[inv.status].toLowerCase()}. Only drafts can be edited${inv.issuedAt ? '; issued invoices are never changed — cancel it and raise a replacement if your business rules allow it' : ''}.`}
        />
        <Link href={`/final-invoices/${inv.id}`} className="btn-secondary w-fit"><IconChevronLeft size={16} /> Back to {ref}</Link>
      </div>
    );
  }

  const [assignees, contacts] = await Promise.all([
    apiFetch<EnquiryAssignee[]>('/final-invoices/assignees').catch(() => [] as EnquiryAssignee[]),
    apiFetch<Array<{ id: string; name: string; designation: string | null }>>(`/customers/${inv.customerId}/contacts`).catch(() =>
      inv.contact ? [{ id: inv.contact.id, name: inv.contact.name, designation: null }] : [],
    ),
  ]);
  // Keep a departed assignee visible so saving does not silently change it.
  const assigneeOptions = inv.assignedTo && !assignees.some((a) => a.id === inv.assignedTo!.id) ? [...assignees, { ...inv.assignedTo, email: '' }] : assignees;
  const bank = inv.bankDetails ?? {};

  return (
    <div className="space-y-5">
      <Link href={`/final-invoices/${inv.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-accent"><IconChevronLeft size={16} /> Back to {ref}</Link>
      <div>
        <h1 className="text-2xl font-bold text-ink">Edit draft invoice</h1>
        <p className="text-base text-ink-muted">Draft invoice for {inv.customer.name}, from proforma invoice {inv.proformaInvoice.piNumber}.</p>
      </div>
      <FinalInvoiceForm
        mode="edit"
        invoiceId={inv.id}
        proformaRef={{
          piNumber: inv.proformaInvoice.piNumber,
          piDate: inv.proformaInvoice.piDate,
          quotationNumber: inv.quotation.quotationNumber,
          revisionNumber: inv.quotationRevision.revisionNumber,
          enquiryNumber: inv.quotation.enquiry?.enquiryNumber ?? null,
        }}
        customerName={inv.customer.name}
        customerSnapshot={inv.customerSnapshot}
        contacts={Array.isArray(contacts) ? contacts : []}
        assignees={assigneeOptions}
        currency={inv.currency}
        items={inv.items}
        totals={inv}
        approvalRequired={inv.approvalRequired}
        initial={{
          invoiceDate: day(inv.invoiceDate),
          dueDate: day(inv.dueDate),
          contactId: inv.contactId ?? '',
          assignedToId: inv.assignedToId ?? '',
          subject: inv.subject ?? '',
          purchaseOrderNumber: inv.purchaseOrderNumber ?? '',
          internalRemarks: inv.internalRemarks ?? '',
          paymentTerms: inv.paymentTerms ?? '',
          deliveryTerms: inv.deliveryTerms ?? '',
          warrantyTerms: inv.warrantyTerms ?? '',
          termsAndConditions: inv.termsAndConditions ?? '',
          notes: inv.notes ?? '',
          paymentInstructions: inv.paymentInstructions ?? '',
          bankDetails: { bankName: bank.bankName ?? '', accountName: bank.accountName ?? '', accountNumber: bank.accountNumber ?? '', ifsc: bank.ifsc ?? '', swift: bank.swift ?? '', branch: bank.branch ?? '' },
        }}
      />
    </div>
  );
}
