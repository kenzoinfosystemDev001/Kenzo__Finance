import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { Company, PaginatedResponse } from '@/lib/types';
import {
  Badge,
  EmptyState,
  PageHeader,
  Pagination,
} from '@/components/ui';
import { CreateCompanyForm } from './create-company-form';

export const metadata: Metadata = { title: 'Brands' };

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const canCreate = user?.permissions.includes('company.create') ?? false;

  const data = await apiFetch<PaginatedResponse<Company>>(
    `/companies${queryString({
      search: params.search,
      page: params.page ?? '1',
      pageSize: 25,
      sortBy: 'name',
      sortDir: 'asc',
    })}`,
  );

  return (
    <>
      <PageHeader
        title="Brands"
        description="The manufacturers and brands your vendors supply. Products belong to a brand."
      />

      {canCreate && (
        <div className="card mb-4 p-4">
          <CreateCompanyForm />
        </div>
      )}

      <form className="card mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="search" className="field-label">
              Search brands
            </label>
            <input
              id="search"
              name="search"
              type="search"
              defaultValue={params.search ?? ''}
              className="field-input"
              placeholder="Dell, HP, Lenovo"
            />
          </div>
          <button type="submit" className="btn-primary">
            Search
          </button>
          {params.search && (
            <Link href="/companies" className="btn-secondary">
              Clear
            </Link>
          )}
        </div>
      </form>

      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={params.search ? 'No brands match' : 'No brands yet'}
            description={
              params.search
                ? 'Try a different name.'
                : 'Add the brands your vendors supply, then create products under them.'
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Brand</th>
                    <th scope="col">Code</th>
                    <th scope="col" className="text-right">
                      Products
                    </th>
                    <th scope="col" className="text-right">
                      Vendors
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((company) => (
                    <tr key={company.id}>
                      <td className="font-medium">{company.name}</td>
                      <td className="font-mono text-sm text-ink-muted">
                        {company.code ?? '-'}
                      </td>
                      <td className="text-right tabular-nums">
                        {company._count?.products ?? 0}
                      </td>
                      <td className="text-right tabular-nums">
                        {company._count?.vendors ?? 0}
                      </td>
                      <td>
                        {company.isActive ? (
                          <Badge tone="success">Active</Badge>
                        ) : (
                          <Badge>Inactive</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              meta={data.meta}
              basePath="/companies"
              params={params as Record<string, string | undefined>}
            />
          </>
        )}
      </div>
    </>
  );
}
