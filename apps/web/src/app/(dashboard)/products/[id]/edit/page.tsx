import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type {
  Company,
  PaginatedResponse,
  ProductCategory,
  ProductDetail,
} from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { ProductForm } from '@/components/product-form';

export const metadata: Metadata = { title: 'Edit product' };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let product: ProductDetail;
  try {
    product = await apiFetch<ProductDetail>(`/products/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // The backend refuses the write too; this avoids showing a dead form.
  if (product.archivedAt) redirect(`/products/${id}`);

  const [companies, categories] = await Promise.all([
    apiFetch<PaginatedResponse<Company>>('/companies?pageSize=100&sortBy=name')
      .then((r) => r.items)
      .catch(() => []),
    apiFetch<ProductCategory[]>('/products/categories').catch(() => []),
  ]);

  const initialValues: Record<string, string> = {
    name: product.name,
    companyId: product.company.id,
    modelNumber: product.modelNumber,
  };
  if (product.designNumber) initialValues.designNumber = product.designNumber;
  if (product.description) initialValues.description = product.description;
  if (product.category) initialValues.categoryId = product.category.id;
  if (product.reorderLevel !== null) {
    initialValues.reorderLevel = String(product.reorderLevel);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Edit ${product.name}`}
        description={`${product.productCode} · ${product.company.name}`}
      />

      <div className="card p-5">
        <ProductForm
          companies={companies}
          categories={categories}
          stockTrackingEnabled={product.stockTrackingEnabled}
          initialValues={initialValues}
          initialSpecifications={product.specifications}
          productId={product.id}
        />
      </div>
    </div>
  );
}
