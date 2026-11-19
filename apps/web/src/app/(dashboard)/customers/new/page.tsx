import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerCategory } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { CustomerForm } from '@/components/customer-form';

export const metadata: Metadata = { title: 'Add Customer' };

export default async function NewCustomerPage() {
  const user = await getCurrentUser();
  if (!user?.permissions.includes('customer.create')) redirect('/customers');
  const categories: CustomerCategory[] = await apiFetch<CustomerCategory[]>('/customers/categories').catch(() => []);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Add Customer" description="Only the name and one reachable contact are required. Tax fields are optional." />
      <CustomerForm mode="create" categories={categories} />
    </div>
  );
}
