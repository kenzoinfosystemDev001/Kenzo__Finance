import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { VendorCategory, VendorDetail } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { VendorForm } from '@/components/vendor-form';

export const metadata: Metadata = { title: 'Edit Vendor' };

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  if (!permissions.includes('vendor.update')) redirect(`/vendors/${id}`);

  let vendor: VendorDetail;
  try {
    vendor = await apiFetch<VendorDetail>(`/vendors/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  // An archived vendor must be restored before editing; the API refuses the
  // write too, this just avoids showing a form that cannot be saved.
  if (vendor.archivedAt) redirect(`/vendors/${id}`);

  const categories: VendorCategory[] = await apiFetch<VendorCategory[]>('/vendor-categories').catch(() => []);
  // Keep the current type selectable even if it has since been deactivated.
  if (vendor.category && !categories.some((category) => category.id === vendor.category?.id)) {
    categories.push({ id: vendor.category.id, name: `${vendor.category.name} (inactive)`, description: null, isActive: false });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={`Edit ${vendor.businessName}`} description={vendor.vendorCode} />
      <VendorForm
        mode="edit"
        vendorId={vendor.id}
        categories={categories}
        permissions={permissions}
        initial={{
          basics: {
            businessName: vendor.businessName,
            legalName: vendor.legalName ?? '',
            categoryId: vendor.category?.id ?? '',
            registrationNumber: vendor.registrationNumber ?? '',
            gstin: vendor.gstin ?? '',
            pan: vendor.pan ?? '',
            website: vendor.website ?? '',
            status: vendor.status,
            notes: vendor.notes ?? '',
            phone: vendor.phone ?? '',
            alternatePhone: vendor.alternatePhone ?? '',
            email: vendor.email ?? '',
            alternateEmail: vendor.alternateEmail ?? '',
          },
        }}
      />
    </div>
  );
}
