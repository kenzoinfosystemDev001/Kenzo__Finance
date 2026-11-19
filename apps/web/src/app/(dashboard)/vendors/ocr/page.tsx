import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import type { Company, PaginatedResponse, VendorCategory } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { OcrVendorWizard } from './ocr-wizard';

export const metadata: Metadata = { title: 'Vendor document upload' };

export default async function VendorOcrPage() {
  const [categories, companies] = await Promise.all([
    apiFetch<VendorCategory[]>('/vendor-categories').catch(() => []),
    apiFetch<PaginatedResponse<Company>>('/companies?pageSize=100&sortBy=name')
      .then((response) => response.items)
      .catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Add vendor from a document"
        description="Upload a vendor document, review what was extracted, correct anything wrong, then save."
        actions={
          <Link href="/vendors/new" className="btn-secondary">
            Enter manually instead
          </Link>
        }
      />

      <OcrVendorWizard categories={categories} companies={companies} />
    </div>
  );
}
