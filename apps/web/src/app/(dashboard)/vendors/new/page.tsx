import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import type { Company, PaginatedResponse, VendorCategory } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { VendorForm } from '@/components/vendor-form';

export const metadata: Metadata = { title: 'Add vendor' };

export default async function NewVendorPage() {
  const [categories, companies] = await Promise.all([
    apiFetch<VendorCategory[]>('/vendor-categories').catch(() => []),
    apiFetch<PaginatedResponse<Company>>('/companies?pageSize=100&sortBy=name')
      .then((response) => response.items)
      .catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Add vendor"
        description="Enter the vendor's details. Only the vendor name is mandatory."
        actions={
          <Link href="/vendors/ocr" className="btn-secondary">
            Upload a document instead
          </Link>
        }
      />

      <div className="card p-5">
        <VendorForm categories={categories} companies={companies} />
      </div>
    </div>
  );
}
