import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { VendorCategory, VendorDetail } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { VendorForm } from '@/components/vendor-form';

export const metadata: Metadata = { title: 'Edit vendor' };

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let vendor: VendorDetail;
  try {
    vendor = await apiFetch<VendorDetail>(`/vendors/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // An archived vendor must be restored before it can be edited; the backend
  // rejects the write too, this just avoids showing a dead form.
  if (vendor.archivedAt) redirect(`/vendors/${id}`);

  const categories = await apiFetch<VendorCategory[]>('/vendor-categories').catch(
    () => [],
  );

  const initialValues: Record<string, string> = {};
  const fields = [
    'businessName', 'legalName', 'contactPerson', 'email', 'phone',
    'alternatePhone', 'website', 'addressLine1', 'addressLine2', 'city',
    'state', 'postalCode', 'country', 'gstin', 'pan', 'notes',
  ] as const;

  for (const key of fields) {
    const value = vendor[key as keyof VendorDetail];
    if (typeof value === 'string' && value) initialValues[key] = value;
  }
  if (vendor.category) initialValues.categoryId = vendor.category.id;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Edit ${vendor.businessName}`}
        description={vendor.vendorCode}
      />

      <div className="card p-5">
        <VendorForm
          categories={categories}
          companies={[]}
          initialValues={initialValues}
          vendorId={vendor.id}
        />
      </div>
    </div>
  );
}
