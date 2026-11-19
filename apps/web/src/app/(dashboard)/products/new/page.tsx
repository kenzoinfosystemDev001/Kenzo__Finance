import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import type { Company, PaginatedResponse, ProductCategory } from '@/lib/types';
import { EmptyState, PageHeader } from '@/components/ui';
import { ProductForm } from '@/components/product-form';

export const metadata: Metadata = { title: 'Add product' };

export default async function NewProductPage() {
  const [companies, categories, stockStatus] = await Promise.all([
    apiFetch<PaginatedResponse<Company>>('/companies?pageSize=100&sortBy=name')
      .then((r) => r.items)
      .catch(() => []),
    apiFetch<ProductCategory[]>('/products/categories').catch(() => []),
    apiFetch<{ stockTrackingEnabled: boolean }>('/stock/status').catch(() => ({
      stockTrackingEnabled: false,
    })),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Add product"
        description="Every product belongs to one brand and one model number."
      />

      <div className="card">
        {companies.length === 0 ? (
          <EmptyState
            title="Add a brand first"
            description="A product must belong to a brand, and none exist yet."
            action={
              <Link href="/companies" className="btn-primary">
                Go to brands
              </Link>
            }
          />
        ) : (
          <div className="p-5">
            <ProductForm
              companies={companies}
              categories={categories}
              stockTrackingEnabled={stockStatus.stockTrackingEnabled}
            />
          </div>
        )}
      </div>
    </div>
  );
}
