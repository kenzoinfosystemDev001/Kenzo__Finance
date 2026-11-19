import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import {
  archiveVendorAction,
  restoreVendorAction,
  unmapCompanyAction,
  unmapProductAction,
} from '@/lib/vendor-actions';
import type { Company, PaginatedResponse, Product, VendorDetail } from '@/lib/types';
import {
  DefinitionList,
  EmptyState,
  PageHeader,
  SectionCard,
  VendorStatusBadge,
} from '@/components/ui';
import { MapBrandForm, MapProductForm } from './mapping-forms';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const vendor = await apiFetch<VendorDetail>(`/vendors/${id}`);
    return { title: vendor.businessName };
  } catch {
    return { title: 'Vendor' };
  }
}

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const canMap = permissions.includes('vendor.map_products');

  let vendor: VendorDetail;

  try {
    vendor = await apiFetch<VendorDetail>(`/vendors/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // Mapping pickers only need options when the user may actually map.
  const [companies, products] = canMap
    ? await Promise.all([
        apiFetch<PaginatedResponse<Company>>('/companies?pageSize=100&sortBy=name')
          .then((r) => r.items)
          .catch(() => []),
        apiFetch<PaginatedResponse<Product>>('/products?pageSize=200&sortBy=name')
          .then((r) => r.items)
          .catch(() => []),
      ])
    : [[], []];

  const mappedCompanyIds = new Set(vendor.companies.map((m) => m.companyId));
  const mappedProductIds = new Set(vendor.products.map((m) => m.productId));

  const address = [
    vendor.addressLine1,
    vendor.addressLine2,
    [vendor.city, vendor.state].filter(Boolean).join(', '),
    vendor.postalCode,
    vendor.country,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title={vendor.businessName}
        description={`${vendor.vendorCode}${vendor.legalName ? ` · ${vendor.legalName}` : ''}`}
        actions={
          <>
            <Link href="/vendors" className="btn-secondary">
              Back to list
            </Link>

            {permissions.includes('vendor.update') && !vendor.archivedAt && (
              <Link href={`/vendors/${vendor.id}/edit`} className="btn-secondary">
                Edit
              </Link>
            )}

            {permissions.includes('vendor.archive') &&
              (vendor.archivedAt ? (
                <form action={restoreVendorAction}>
                  <input type="hidden" name="vendorId" value={vendor.id} />
                  <button type="submit" className="btn-secondary">
                    Restore
                  </button>
                </form>
              ) : (
                <form action={archiveVendorAction}>
                  <input type="hidden" name="vendorId" value={vendor.id} />
                  <button type="submit" className="btn-danger">
                    Archive
                  </button>
                </form>
              ))}
          </>
        }
      />

      {vendor.archivedAt && (
        <div className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2.5">
          <p className="text-sm text-danger">
            This vendor is archived. The record and its history are preserved, but
            it cannot be edited or mapped until restored.
          </p>
        </div>
      )}

      <SectionCard
        title="Vendor details"
        actions={
          <VendorStatusBadge status={vendor.status} archivedAt={vendor.archivedAt} />
        }
      >
        <DefinitionList
          items={[
            { label: 'Vendor code', value: <span className="font-mono">{vendor.vendorCode}</span> },
            { label: 'Category', value: vendor.category?.name },
            { label: 'Contact person', value: vendor.contactPerson },
            { label: 'Email', value: vendor.email },
            { label: 'Phone', value: vendor.phone },
            { label: 'Alternate phone', value: vendor.alternatePhone },
            { label: 'Website', value: vendor.website },
            {
              label: 'GSTIN',
              value: vendor.gstin && <span className="font-mono">{vendor.gstin}</span>,
            },
            {
              label: 'PAN',
              value: vendor.pan && <span className="font-mono">{vendor.pan}</span>,
            },
            {
              label: 'Address',
              value: address && <span className="whitespace-pre-line">{address}</span>,
            },
            { label: 'Added by', value: vendor.createdBy?.fullName },
            {
              label: 'Added on',
              value: new Date(vendor.createdAt).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              }),
            },
          ]}
        />

        {vendor.notes && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-line text-base text-ink">
              {vendor.notes}
            </p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Brands supplied"
        description="Brands this vendor can quote for."
        padded={false}
      >
        {canMap && !vendor.archivedAt && (
          <div className="border-b border-border p-4">
            <MapBrandForm
              vendorId={vendor.id}
              companies={companies.filter((c) => !mappedCompanyIds.has(c.id))}
            />
          </div>
        )}

        {vendor.companies.length === 0 ? (
          <EmptyState
            title="No brands mapped"
            description="Map a brand so this vendor appears when someone searches by brand."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Brand</th>
                  <th scope="col">Authorised</th>
                  <th scope="col">Remarks</th>
                  {canMap && !vendor.archivedAt && <th scope="col" className="w-20" />}
                </tr>
              </thead>
              <tbody>
                {vendor.companies.map((mapping) => (
                  <tr key={mapping.id}>
                    <td className="font-medium">{mapping.company.name}</td>
                    <td>{mapping.isAuthorized ? 'Yes' : 'No'}</td>
                    <td className="text-ink-muted">{mapping.remarks ?? '-'}</td>
                    {canMap && !vendor.archivedAt && (
                      <td className="text-right">
                        <form action={unmapCompanyAction}>
                          <input type="hidden" name="vendorId" value={vendor.id} />
                          <input
                            type="hidden"
                            name="companyId"
                            value={mapping.companyId}
                          />
                          <button
                            type="submit"
                            className="text-sm text-danger hover:underline"
                          >
                            Remove
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Products supplied"
        description="Specific models this vendor can supply."
        padded={false}
      >
        {canMap && !vendor.archivedAt && (
          <div className="border-b border-border p-4">
            <MapProductForm
              vendorId={vendor.id}
              products={products.filter((p) => !mappedProductIds.has(p.id))}
            />
          </div>
        )}

        {vendor.products.length === 0 ? (
          <EmptyState
            title="No products mapped"
            description="Map the models this vendor supplies so they can be found by product or model number."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Brand</th>
                  <th scope="col">Model</th>
                  <th scope="col">Vendor SKU</th>
                  <th scope="col" className="text-right">
                    Lead time
                  </th>
                  <th scope="col">Preferred</th>
                  {canMap && !vendor.archivedAt && <th scope="col" className="w-20" />}
                </tr>
              </thead>
              <tbody>
                {vendor.products.map((mapping) => (
                  <tr key={mapping.id}>
                    <td>
                      <Link
                        href={`/products/${mapping.productId}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {mapping.product.name}
                      </Link>
                      <p className="font-mono text-sm text-ink-subtle">
                        {mapping.product.productCode}
                      </p>
                    </td>
                    <td>{mapping.product.company.name}</td>
                    <td className="font-mono text-sm">{mapping.product.modelNumber}</td>
                    <td className="font-mono text-sm">{mapping.vendorSku ?? '-'}</td>
                    <td className="text-right tabular-nums">
                      {mapping.leadTimeDays !== null
                        ? `${mapping.leadTimeDays} days`
                        : '-'}
                    </td>
                    <td>{mapping.isPreferred ? 'Yes' : 'No'}</td>
                    {canMap && !vendor.archivedAt && (
                      <td className="text-right">
                        <form action={unmapProductAction}>
                          <input type="hidden" name="vendorId" value={vendor.id} />
                          <input
                            type="hidden"
                            name="productId"
                            value={mapping.productId}
                          />
                          <button
                            type="submit"
                            className="text-sm text-danger hover:underline"
                          >
                            Remove
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {vendor.contacts.length > 0 && (
        <SectionCard title="Contact people" padded={false}>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Designation</th>
                  <th scope="col">Email</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Primary</th>
                </tr>
              </thead>
              <tbody>
                {vendor.contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td className="font-medium">{contact.name}</td>
                    <td>{contact.designation ?? '-'}</td>
                    <td>{contact.email ?? '-'}</td>
                    <td>{contact.phone ?? '-'}</td>
                    <td>{contact.isPrimary ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {vendor.documents.length > 0 && (
        <SectionCard
          title="Documents"
          description="Original files uploaded for this vendor."
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Type</th>
                  <th scope="col" className="text-right">
                    Size
                  </th>
                  <th scope="col">Uploaded</th>
                  <th scope="col" className="w-24" />
                </tr>
              </thead>
              <tbody>
                {vendor.documents.map((document) => (
                  <tr key={document.id}>
                    <td className="font-medium">{document.originalFilename}</td>
                    <td className="text-ink-muted">{document.mimeType}</td>
                    <td className="text-right tabular-nums">
                      {(document.sizeBytes / 1024).toFixed(0)} KB
                    </td>
                    <td>
                      {new Date(document.createdAt).toLocaleDateString('en-IN')}
                    </td>
                    <td className="text-right">
                      {permissions.includes('document.download') && (
                        <a
                          href={`/vendors/${vendor.id}/documents/${document.id}`}
                          className="text-sm text-accent hover:underline"
                        >
                          Download
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
