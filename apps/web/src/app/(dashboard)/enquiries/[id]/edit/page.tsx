import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { EnquiryDetail, EnquirySource } from '@/lib/types';
import { ENQUIRY_STATUS_LABELS, isEnquiryLocked } from '@/lib/enquiry-labels';
import { PageHeader } from '@/components/ui';
import { EnquiryForm } from '@/components/enquiry-form';

export const metadata: Metadata = { title: 'Edit Enquiry' };

const day = (value: string | null) => (value ? value.slice(0, 10) : '');

export default async function EditEnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  if (!permissions.includes('enquiry.update')) redirect(`/enquiries/${id}`);

  let enquiry: EnquiryDetail;
  try {
    enquiry = await apiFetch<EnquiryDetail>(`/enquiries/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  if (isEnquiryLocked(enquiry.status)) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={`Edit ${enquiry.enquiryNumber}`} />
        <div className="card p-6">
          <p className="text-base text-ink">This enquiry is {ENQUIRY_STATUS_LABELS[enquiry.status].toLowerCase()} and can no longer be edited.</p>
          <Link href={`/enquiries/${enquiry.id}`} className="btn-secondary mt-4">Back to enquiry</Link>
        </div>
      </div>
    );
  }

  const sources = await apiFetch<EnquirySource[]>('/enquiries/sources?includeInactive=true').catch(() => [] as EnquirySource[]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={`Edit ${enquiry.enquiryNumber}`} description={enquiry.customer.name} />
      <EnquiryForm
        mode="edit"
        enquiryId={enquiry.id}
        enquiryNumber={enquiry.enquiryNumber}
        sources={sources.filter((s) => s.isActive || s.id === enquiry.sourceId)}
        assignees={[]}
        initialCustomer={enquiry.customer}
        initial={{
          customerId: enquiry.customerId,
          customerContactId: enquiry.customerContactId ?? '',
          enquiryDate: day(enquiry.enquiryDate),
          sourceId: enquiry.sourceId ?? '',
          priority: enquiry.priority,
          description: enquiry.description ?? '',
          internalRemarks: enquiry.internalRemarks ?? '',
          expectedDecisionDate: day(enquiry.expectedDecisionDate),
          nextFollowUpDate: day(enquiry.nextFollowUpDate),
          expectedBudget: enquiry.expectedBudget ?? '',
          currency: enquiry.currency,
          expectedDeliveryTimeline: enquiry.expectedDeliveryTimeline ?? '',
          paymentPreference: enquiry.paymentPreference ?? '',
          commercialNotes: enquiry.commercialNotes ?? '',
        }}
        canCreateCustomer={permissions.includes('customer.create')}
        canCreateProduct={permissions.includes('product.create')}
      />
    </div>
  );
}
