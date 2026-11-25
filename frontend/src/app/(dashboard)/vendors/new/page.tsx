import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { ProductCategory, VendorCategory } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { VendorForm } from '@/components/vendor-form';
import { IconScan } from '@/components/icons';

export const metadata: Metadata = { title: 'Add Vendor' };

export default async function NewVendorPage() {
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  if (!permissions.includes('vendor.create')) redirect('/vendors');

  const [categories, productCategories] = await Promise.all([
    apiFetch<VendorCategory[]>('/vendor-categories').catch(() => []),
    permissions.includes('product.create')
      ? apiFetch<ProductCategory[]>('/products/categories').catch(() => [])
      : Promise.resolve([] as ProductCategory[]),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Add Vendor"
        description="Enter the vendor's details. Only the vendor name is mandatory."
        actions={
          permissions.includes('ocr.submit') && (
            <Link href="/vendors/ocr" className="btn-secondary">
              <IconScan size={16} />
              Import from a document instead
            </Link>
          )
        }
      />
      <VendorForm
        mode="create"
        categories={categories}
        productCategories={productCategories}
        permissions={permissions}
      />
    </div>
  );
}
