import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerCategory } from '@/lib/types';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { MasterRecordActions } from '@/components/master-record-actions';
import { setCustomerCategoryActiveAction, updateCustomerCategoryAction, deleteCustomerCategoryAction } from '@/lib/customer-actions';
import { CreateCustomerCategoryForm } from './create-category-form';

export const metadata: Metadata = { title: 'Customer Categories' };

/** Configurable customer categories (Corporate, SME, Government, ...). */
export default async function CustomerCategoriesPage() {
  const user = await getCurrentUser();
  const canManage = user?.permissions.includes('settings.manage') ?? false;
  const categories: CustomerCategory[] = await apiFetch<CustomerCategory[]>('/customers/categories?includeInactive=true').catch(() => []);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Customer categories"
        description="Used to group customers and filter the customer list. Managed by administrators."
        actions={<Link href="/customers" className="btn-secondary">Back to customers</Link>}
      />
      {canManage && <div className="card mb-4 p-4"><CreateCustomerCategoryForm /></div>}
      <div className="card overflow-hidden">
        {categories.length === 0 ? (
          <EmptyState title="No categories" description="Add the categories you use to group customers." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Description</th>
                  <th scope="col" className="text-right">Customers</th>
                  <th scope="col">Status</th>
                  {canManage && <th scope="col" className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td className="text-ink-muted">{c.description ?? '-'}</td>
                    <td className="text-right tabular-nums">{c._count?.customers ?? 0}</td>
                    <td>{c.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
                    {canManage && (
                      <td>
                        <MasterRecordActions
                          entityLabel="Category"
                          recordName={c.name}
                          isActive={c.isActive}
                          fields={[
                            { name: 'name', label: 'Category Name', required: true, maxLength: 100 },
                            { name: 'description', label: 'Description', maxLength: 300 },
                          ]}
                          initialValues={{ name: c.name, description: c.description ?? '' }}
                          deactivateNote={`${c.name} will no longer be offered on customer forms. Customers already in it keep it.`}
                          onSave={updateCustomerCategoryAction.bind(null, c.id)}
                          onSetActive={setCustomerCategoryActiveAction.bind(null, c.id)}
                          onDelete={deleteCustomerCategoryAction.bind(null, c.id)}
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
