import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { ProductCategory } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import { ProductForm } from '@/components/product-form';

export const metadata: Metadata = { title: 'Add Product' };

export default async function NewProductPage() {
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  if (!permissions.includes('product.create')) redirect('/products');

  const categories: ProductCategory[] = await apiFetch<ProductCategory[]>('/products/categories').catch(() => []);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Add Product" description="Create a catalogue product under a shared brand, then add its models." />
      <ProductForm mode="create" categories={categories} permissions={permissions} />
    </div>
  );
}
