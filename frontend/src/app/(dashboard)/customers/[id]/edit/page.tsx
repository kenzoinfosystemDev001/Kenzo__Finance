import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerCategory, CustomerDetail } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { CustomerForm } from '@/components/customer-form';

export const metadata: Metadata = { title: 'Edit Customer' };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user?.permissions.includes('customer.update')) redirect(`/customers/${id}`);

  let customer: CustomerDetail;
  try {
    customer = await apiFetch<CustomerDetail>(`/customers/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
  const categories: CustomerCategory[] = await apiFetch<CustomerCategory[]>('/customers/categories?includeInactive=true').catch(() => []);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={`Edit ${customer.name}`} description={customer.customerCode} />
      <CustomerForm
        mode="edit"
        customerId={customer.id}
        categories={categories.filter((c) => c.isActive || c.id === customer.category?.id)}
        initial={{
          customerType: customer.customerType,
          name: customer.name,
          categoryId: customer.category?.id ?? '',
          industry: customer.industry ?? '',
          website: customer.website ?? '',
          description: customer.description ?? '',
          taxCountry: customer.taxCountry,
          gstin: customer.gstin ?? '',
          pan: customer.pan ?? '',
          cin: customer.cin ?? '',
          taxRegistrationNumber: customer.taxRegistrationNumber ?? '',
          otherRegistration: customer.otherRegistration ?? '',
          companySize: customer.companySize ?? '',
          businessType: customer.businessType ?? '',
          annualTurnoverRange: customer.annualTurnoverRange ?? '',
          employeeCount: customer.employeeCount?.toString() ?? '',
        }}
      />
    </div>
  );
}
