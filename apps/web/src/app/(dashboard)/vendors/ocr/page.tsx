import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { OcrEngineStatus, ProductCategory, VendorCategory } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { OcrVendorWizard } from './ocr-wizard';

export const metadata: Metadata = { title: 'Import Vendor Using OCR' };

export default async function VendorOcrPage() {
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  if (!permissions.includes('vendor.create') || !permissions.includes('ocr.submit')) redirect('/vendors');

  const [categories, productCategories, engine] = await Promise.all([
    apiFetch<VendorCategory[]>('/vendor-categories').catch(() => []),
    permissions.includes('product.create')
      ? apiFetch<ProductCategory[]>('/products/categories').catch(() => [])
      : Promise.resolve([] as ProductCategory[]),
    apiFetch<OcrEngineStatus>('/ocr/status').catch(() => null),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Import Vendor Using OCR"
        description="Upload a visiting card or document, review the extracted details, correct anything wrong, then confirm."
        actions={
          <Link href="/vendors/new" className="btn-secondary">
            Enter manually instead
          </Link>
        }
      />
      <OcrVendorWizard
        categories={categories}
        productCategories={productCategories}
        permissions={permissions}
        engine={engine}
      />
    </div>
  );
}
