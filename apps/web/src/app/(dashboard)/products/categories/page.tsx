import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { ProductCategory } from '@/lib/types';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { CreateCategoryForm } from './create-category-form';
import { MasterRecordActions } from '@/components/master-record-actions';
import { setCategoryActiveAction, updateCategoryAction } from '@/lib/catalogue-actions';

export const metadata: Metadata = { title: 'Product categories' };

export default async function ProductCategoriesPage() {
  const user = await getCurrentUser();
  const canCreate = user?.permissions.includes('product.create') ?? false;
  const canUpdate = user?.permissions.includes('product.update') ?? false;

  const categories = await apiFetch<ProductCategory[]>(
    '/products/categories?includeInactive=true',
  ).catch(() => []);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Product categories"
        description="Used to group the catalogue and to filter product search."
        actions={
          <Link href="/products" className="btn-secondary">
            Back to products
          </Link>
        }
      />

      {canCreate && (
        <div className="card mb-4 p-4">
          <CreateCategoryForm />
        </div>
      )}

      <div className="card overflow-hidden">
        {categories.length === 0 ? (
          <EmptyState
            title="No categories yet"
            description="Add categories such as Laptops, Monitors or Networking."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Description</th>
                  <th scope="col" className="text-right">
                    Products
                  </th>
                  <th scope="col">Status</th>
                  {canUpdate && <th scope="col" className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td className="font-medium">{category.name}</td>
                    <td className="text-ink-muted">{category.description ?? '-'}</td>
                    <td className="text-right tabular-nums">
                      {category._count?.products ?? 0}
                    </td>
                    <td>
                      {category.isActive ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge>Inactive</Badge>
                      )}
                    </td>
                    {canUpdate && (
                      <td>
                        <MasterRecordActions
                          entityLabel="Category"
                          recordName={category.name}
                          isActive={category.isActive}
                          fields={[
                            { name: 'name', label: 'Category Name', required: true, maxLength: 100 },
                            { name: 'description', label: 'Description', maxLength: 300 },
                          ]}
                          initialValues={{ name: category.name, description: category.description ?? '' }}
                          deactivateNote={`${category.name} will no longer be offered on product forms. It is refused while active products still use it.`}
                          onSave={updateCategoryAction.bind(null, category.id)}
                          onSetActive={setCategoryActiveAction.bind(null, category.id)}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
