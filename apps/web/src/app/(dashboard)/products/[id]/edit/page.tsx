import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { ProductCategory, ProductDetail } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { ProductForm } from '@/components/product-form';

export const metadata: Metadata = { title: 'Edit Product' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  if (!permissions.includes('product.update')) redirect(`/products/${id}`);

  let product: ProductDetail;
  try {
    product = await apiFetch<ProductDetail>(`/products/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
  if (product.archivedAt) redirect(`/products/${id}`);

  // Include inactive categories so the current one stays selectable.
  const categories: ProductCategory[] = await apiFetch<ProductCategory[]>('/products/categories?includeInactive=true').catch(() => []);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={`Edit ${product.name}`} description={product.productCode} />
      <ProductForm
        mode="edit"
        productId={product.id}
        categories={categories}
        permissions={permissions}
        initial={{
          name: product.name,
          sku: product.sku ?? '',
          companyId: product.company.id,
          categoryId: product.category?.id ?? '',
          description: product.description ?? '',
          brand: { id: product.company.id, label: product.company.name },
        }}
      />
    </div>
  );
}
