import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerDetail, EnquiryAssignee, EnquiryDetail, QuotationDetail } from '@/lib/types';
import { formatRate, QUOTATION_STATUS_LABELS } from '@/lib/quotation-labels';
import { PageHeader } from '@/components/ui';
import { QuotationForm, type QuotationFormInitial } from '@/components/quotation-form';
import { canRevise, NewRevisionButton } from '../../quotation-row-actions';

export const metadata: Metadata = { title: 'Edit Quotation' };

const day = (value: string | null) => (value ? value.slice(0, 10) : '');
/** Stored zero means "not entered" in the form. */
const amountOrBlank = (value: string) => (Number(value) === 0 ? '' : value);

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);
  if (!can('quotation.update')) redirect(`/quotations/${id}`);

  let quotation: QuotationDetail;
  try {
    quotation = await apiFetch<QuotationDetail>(`/quotations/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
  const revision = quotation.revisions[0];

  if (!revision || revision.status !== 'DRAFT') {
    const revisable = canRevise(quotation.status, permissions);
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={`Edit ${quotation.quotationNumber}`} />
        <div className="card space-y-4 p-6">
          <p className="text-base text-ink">
            Revision {quotation.currentRevisionNumber} is {QUOTATION_STATUS_LABELS[quotation.status].toLowerCase()} and can no longer be edited.
            Issued revisions are kept exactly as they were given to the customer.
          </p>
          <p className="text-sm text-ink-muted">
            {revisable
              ? 'To change prices or items, create a new revision. It starts as a draft copy of the current revision.'
              : quotation.status === 'ACCEPTED' || quotation.status === 'CANCELLED'
                ? `A ${QUOTATION_STATUS_LABELS[quotation.status].toLowerCase()} quotation cannot be revised.`
                : 'A new revision cannot be created from this status, or you do not have permission to revise quotations.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/quotations/${quotation.id}`} className="btn-secondary">Back to quotation</Link>
            {revisable && (
              <NewRevisionButton quotation={{ id: quotation.id, quotationNumber: quotation.quotationNumber, currentRevisionNumber: quotation.currentRevisionNumber }} primary />
            )}
          </div>
        </div>
      </div>
    );
  }

  const [assignees, customer, enquiry] = await Promise.all([
    apiFetch<EnquiryAssignee[]>('/quotations/assignees').catch(() => [] as EnquiryAssignee[]),
    apiFetch<CustomerDetail>(`/customers/${quotation.customerId}`).catch(() => null),
    quotation.enquiryId && can('enquiry.read') ? apiFetch<EnquiryDetail>(`/enquiries/${quotation.enquiryId}`).catch(() => null) : Promise.resolve(null),
  ]);

  const initial: QuotationFormInitial = {
    header: {
      contactId: quotation.contactId ?? '',
      assignedToId: quotation.assignedToId ?? '',
      subject: quotation.subject ?? '',
      referenceNumber: quotation.referenceNumber ?? '',
    },
    content: {
      quotationDate: day(revision.quotationDate),
      validUntil: day(revision.validUntil),
      additionalDiscount: amountOrBlank(revision.additionalDiscount),
      otherChargesLabel: revision.otherChargesLabel ?? '',
      otherCharges: amountOrBlank(revision.otherCharges),
      termsAndConditions: revision.termsAndConditions ?? '',
      paymentTerms: revision.paymentTerms ?? '',
      deliveryTerms: revision.deliveryTerms ?? '',
      warrantyTerms: revision.warrantyTerms ?? '',
      notes: revision.notes ?? '',
      internalRemarks: revision.internalRemarks ?? '',
    },
    lines: revision.items.map((item) => ({
      key: `l-${item.id}`,
      req: {
        key: `r-${item.id}`,
        brand: [],
        product: [{ id: item.productId, label: item.productName, detail: `${item.productCode} · ${item.brandName}` }],
        productCode: item.productCode,
        productModelId: item.productModelId ?? '',
        quantity: String(item.quantity),
        unit: item.unit,
        technicalRequirements: '',
        remarks: '',
      },
      enquiryItemId: item.enquiryItemId ?? '',
      description: item.description ?? '',
      quantity: String(item.quantity),
      unit: item.unit,
      unitPrice: item.unitPrice,
      discountType: item.discountType,
      discountValue: item.discountType === 'NONE' ? '' : item.discountValue,
      taxLabel: item.taxLabel ?? '',
      taxRate: Number(item.taxRate) === 0 ? '' : formatRate(item.taxRate),
      remarks: item.remarks ?? '',
    })),
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={`Edit ${quotation.quotationNumber}`} description={`Draft revision ${revision.revisionNumber} · ${quotation.customer.name}`} />
      <QuotationForm
        mode="edit"
        quotationId={quotation.id}
        quotationNumber={quotation.quotationNumber}
        revisionNumber={revision.revisionNumber}
        enquiryRef={enquiry ? { enquiryNumber: enquiry.enquiryNumber, items: enquiry.items } : null}
        initial={initial}
        initialCustomer={customer}
        fixedCustomerName={quotation.customer.name}
        currency={quotation.currency}
        assignees={assignees}
        defaultTerms={null}
        canCreateProduct={can('product.create')}
      />
    </div>
  );
}
