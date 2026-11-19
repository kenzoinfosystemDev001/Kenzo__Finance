import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerDetail, EnquiryAssignee, EnquirySource } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { EnquiryForm } from '@/components/enquiry-form';

export const metadata: Metadata = { title: 'Add Enquiry' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewEnquiryPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const { customerId } = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  if (!permissions.includes('enquiry.create')) redirect('/enquiries');

  const [sources, assignees, customer] = await Promise.all([
    apiFetch<EnquirySource[]>('/enquiries/sources').catch(() => [] as EnquirySource[]),
    apiFetch<EnquiryAssignee[]>('/enquiries/assignees').catch(() => [] as EnquiryAssignee[]),
    customerId && UUID.test(customerId) ? apiFetch<CustomerDetail>(`/customers/${customerId}`).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Add Enquiry" description="Record a customer enquiry with the products and models they need." />
      <EnquiryForm
        mode="create"
        sources={sources}
        assignees={assignees}
        initialCustomer={customer}
        canCreateCustomer={permissions.includes('customer.create')}
        canCreateProduct={permissions.includes('product.create')}
      />
    </div>
  );
}
