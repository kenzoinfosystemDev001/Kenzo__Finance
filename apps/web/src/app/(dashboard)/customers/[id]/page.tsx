import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { ActivityEntry, CustomerAddress, CustomerDetail, CustomerPaymentHistory, EnquiryListItem, FinalInvoiceListItem, PaginatedResponse, QuotationListItem } from '@/lib/types';
import { CUSTOMER_ADDRESS_TYPE_LABELS, CUSTOMER_TYPE_LABELS } from '@/lib/customer-labels';
import { activityLabel, formatAddress, formatDate, formatDateTime, formatPhone } from '@/lib/vendor-labels';
import { DefinitionList, ErrorState, Pagination, Tabs, VendorStatusBadge } from '@/components/ui';
import { EmptyStateClient } from '@/components/panel-shared';
import { EnquiryStatusBadge } from '@/components/enquiry-badges';
import { PastValidityBadge, QuotationStatusBadge } from '@/components/quotation-badges';
import { DraftNumberPill, FinalInvoiceStatusBadge } from '@/components/final-invoice-badges';
import { formatMoney } from '@/lib/quotation-labels';
import { isFollowUpOverdue } from '@/lib/enquiry-labels';
import { IconChevronLeft, IconPencil, IconPlus, IconUser, IconWarehouse } from '@/components/icons';
import { CustomerRowActions } from '../customer-row-actions';
import { CustomerAddressesPanel, CustomerContactsPanel, CustomerDocumentsPanel, CustomerProductsPanel } from './customer-panels';

const TABS = ['overview', 'contacts', 'addresses', 'products', 'documents', 'activity', 'transactions'] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const customer = await apiFetch<CustomerDetail>(`/customers/${id}`).catch(() => null);
  return { title: customer?.name ?? 'Customer' };
}

function AddressBlock({ title, address }: { title: string; address?: CustomerAddress }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{title}</p>
      {address ? (
        <address className="mt-1 text-sm not-italic leading-relaxed text-ink">
          {formatAddress(address).map((line) => <span key={line} className="block">{line}</span>)}
        </address>
      ) : (
        <p className="mt-1 text-sm text-ink-subtle">Not provided</p>
      )}
    </div>
  );
}

export default async function CustomerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string; created?: string; updated?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);

  let customer: CustomerDetail;
  try {
    customer = await apiFetch<CustomerDetail>(`/customers/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : 'overview';
  const href = (t: Tab) => `/customers/${customer.id}${t === 'overview' ? '' : `?tab=${t}`}`;
  const primary = customer.contacts.find((c) => c.isPrimary);
  const defaultOf = (type: CustomerAddress['addressType']) =>
    customer.addresses.find((a) => a.addressType === type && a.isDefault) ?? customer.addresses.find((a) => a.addressType === type);
  const business = customer.customerType === 'BUSINESS';

  return (
    <div className="space-y-5">
      <Link href="/customers" className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-accent"><IconChevronLeft size={16} /> All customers</Link>
      {query.created && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Customer created. Add documents, more contacts or products of interest below.</p>}
      {query.updated && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Changes saved.</p>}

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
              {business ? <IconWarehouse size={28} /> : <IconUser size={28} />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-ink">{customer.name}</h1>
                <span className="chip font-mono">{customer.customerCode}</span>
                <VendorStatusBadge status={customer.status} />
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                {CUSTOMER_TYPE_LABELS[customer.customerType]}
                {customer.category && <> &middot; {customer.category.name}</>}
                {customer.industry && <> &middot; {customer.industry}</>}
              </p>
              {primary && (
                <p className="mt-2 text-sm text-ink-muted">
                  {primary.name}
                  {primary.phone && <> &middot; {formatPhone(primary.phone)}</>}
                  {primary.email && <> &middot; {primary.email}</>}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {can('customer.update') && <Link href={`/customers/${customer.id}/edit`} className="btn-primary"><IconPencil size={16} /> Edit</Link>}
            <CustomerRowActions customer={{ id: customer.id, name: customer.name, status: customer.status }} permissions={permissions} compact={false} afterDelete="list" />
          </div>
        </div>
      </section>

      <Tabs
        active={tab}
        tabs={[
          { key: 'overview', label: 'Overview', href: href('overview') },
          { key: 'contacts', label: 'Contacts', href: href('contacts'), count: customer.contacts.length },
          { key: 'addresses', label: 'Addresses', href: href('addresses'), count: customer.addresses.length },
          { key: 'products', label: 'Products of Interest', href: href('products'), count: customer.interests.length },
          { key: 'documents', label: 'Documents', href: href('documents'), count: customer.documents.length },
          { key: 'activity', label: 'Activity History', href: href('activity') },
          { key: 'transactions', label: 'Business Transactions', href: href('transactions') },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-semibold text-ink">Customer information</h2>
            <DefinitionList
              items={[
                { label: 'Customer ID', value: <span className="font-mono">{customer.customerCode}</span> },
                { label: 'Customer type', value: CUSTOMER_TYPE_LABELS[customer.customerType] },
                { label: 'Category', value: customer.category?.name },
                { label: 'Industry', value: customer.industry },
                { label: 'Website', value: customer.website },
                { label: 'Status', value: <VendorStatusBadge status={customer.status} /> },
              ]}
            />
            {customer.description && <p className="mt-4 whitespace-pre-line border-t border-border pt-3 text-sm text-ink">{customer.description}</p>}
          </section>
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-semibold text-ink">Contact &amp; tax details</h2>
            <DefinitionList
              items={[
                { label: 'Primary contact', value: primary && `${primary.name}${primary.designation ? `, ${primary.designation}` : ''}` },
                { label: 'Phone', value: formatPhone(primary?.phone) },
                { label: 'Email', value: primary?.email },
                { label: 'Tax country', value: customer.taxCountry },
                { label: 'GSTIN', value: customer.gstin && <span className="font-mono">{customer.gstin}</span> },
                { label: 'PAN', value: customer.pan && <span className="font-mono">{customer.pan}</span> },
                ...(business ? [{ label: 'CIN', value: customer.cin && <span className="font-mono">{customer.cin}</span> }] : []),
                { label: 'Tax registration no.', value: customer.taxRegistrationNumber },
              ]}
            />
            {customer.otherRegistration && <p className="mt-4 border-t border-border pt-3 text-sm text-ink-muted">{customer.otherRegistration}</p>}
          </section>
          <div className="space-y-5">
            <section className="card space-y-4 p-5">
              <h2 className="text-lg font-semibold text-ink">Addresses</h2>
              <AddressBlock title={CUSTOMER_ADDRESS_TYPE_LABELS.BILLING} address={defaultOf('BILLING')} />
              <AddressBlock title={CUSTOMER_ADDRESS_TYPE_LABELS.SHIPPING} address={defaultOf('SHIPPING')} />
            </section>
            {business && (customer.companySize || customer.businessType || customer.annualTurnoverRange || customer.employeeCount) && (
              <section className="card p-5 text-sm">
                <h2 className="mb-3 text-base font-semibold text-ink">Business profile</h2>
                {customer.businessType && <p className="text-ink-muted">Business type: <span className="text-ink">{customer.businessType}</span></p>}
                {customer.companySize && <p className="text-ink-muted">Company size: <span className="text-ink">{customer.companySize} employees</span></p>}
                {customer.employeeCount !== null && <p className="text-ink-muted">Employees: <span className="text-ink">{customer.employeeCount}</span></p>}
                {customer.annualTurnoverRange && <p className="text-ink-muted">Turnover: <span className="text-ink">{customer.annualTurnoverRange}</span></p>}
              </section>
            )}
            <section className="card p-5 text-sm">
              <h2 className="mb-3 text-base font-semibold text-ink">Record</h2>
              <p className="text-ink-muted">Created {formatDateTime(customer.createdAt)}{customer.createdBy && ` by ${customer.createdBy.fullName}`}</p>
              <p className="text-ink-muted">Last updated {formatDateTime(customer.updatedAt)}{customer.updatedBy && ` by ${customer.updatedBy.fullName}`}</p>
            </section>
          </div>
        </div>
      )}

      {tab === 'contacts' && <CustomerContactsPanel customer={customer} canManage={can('customer.manage_contacts')} />}
      {tab === 'addresses' && <CustomerAddressesPanel customer={customer} canManage={can('customer.manage_addresses')} />}
      {tab === 'products' && <CustomerProductsPanel customer={customer} canManage={can('customer.manage_products') && can('product.read')} canViewProducts={can('product.read')} />}
      {tab === 'documents' && (
        <CustomerDocumentsPanel customer={customer} canUpload={can('customer.upload_documents')} canRemove={can('customer.delete_documents')} canDownload={can('document.download')} />
      )}
      {tab === 'activity' && <ActivityTab customerId={customer.id} page={query.page} />}
      {tab === 'transactions' && (
        <TransactionsTab
          customerId={customer.id}
          customerCode={customer.customerCode}
          canReadEnquiries={can('enquiry.read')}
          canCreateEnquiry={can('enquiry.create') && customer.status === 'ACTIVE'}
          canReadQuotations={can('quotation.read')}
          canCreateQuotation={can('quotation.create_manual') && customer.status === 'ACTIVE'}
          canReadInvoices={can('invoice.read')}
          canReadPayments={can('payment.read')}
          canCreatePayment={can('payment.create')}
        />
      )}
    </div>
  );
}

async function ActivityTab({ customerId, page }: { customerId: string; page?: string }) {
  let data: PaginatedResponse<ActivityEntry>;
  try {
    data = await apiFetch<PaginatedResponse<ActivityEntry>>(`/customers/${customerId}/activity${queryString({ page: page ?? '1', pageSize: 20 })}`);
  } catch (error) {
    return <ErrorState title="Could not load activity" message={error instanceof ApiError ? error.messages[0] : 'The server could not be reached.'} />;
  }
  return (
    <section className="card">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-lg font-semibold text-ink">Activity history</h2>
        <p className="text-sm text-ink-muted">From the audit log &mdash; the customer, its contacts, addresses, products of interest and documents.</p>
      </div>
      {data.items.length === 0 ? (
        <EmptyStateClient title="No activity recorded" description="Changes to this customer will appear here." />
      ) : (
        <>
          <ol className="divide-y divide-border">
            {data.items.map((entry) => (
              <li key={entry.id} className="flex gap-4 px-5 py-3.5">
                <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">{activityLabel(entry.action)}</p>
                    <time dateTime={entry.createdAt} className="text-xs text-ink-subtle">{formatDate(entry.createdAt)} &middot; {new Date(entry.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                  {entry.summary && <p className="text-sm text-ink-muted">{entry.summary}</p>}
                  <p className="text-xs text-ink-subtle">by {entry.actor?.fullName ?? 'System'}</p>
                </div>
              </li>
            ))}
          </ol>
          <Pagination meta={data.meta} basePath={`/customers/${customerId}`} params={{ tab: 'activity' }} noun="events" />
        </>
      )}
    </section>
  );
}

/** Business documents for this customer. Enquiries are live; later modules slot in beside them. */
async function TransactionsTab({
  customerId,
  customerCode,
  canReadEnquiries,
  canCreateEnquiry,
  canReadQuotations,
  canCreateQuotation,
  canReadInvoices,
  canReadPayments,
  canCreatePayment,
}: {
  customerId: string;
  customerCode: string;
  canReadEnquiries: boolean;
  canCreateEnquiry: boolean;
  canReadQuotations: boolean;
  canCreateQuotation: boolean;
  canReadInvoices: boolean;
  canReadPayments: boolean;
  canCreatePayment: boolean;
}) {
  let enquiries: PaginatedResponse<EnquiryListItem> | null = null;
  let enquiryError: string | null = null;
  if (canReadEnquiries) {
    try {
      enquiries = await apiFetch<PaginatedResponse<EnquiryListItem>>(`/enquiries${queryString({ customerId, pageSize: 50, sortBy: 'enquiryDate', sortDir: 'desc' })}`);
    } catch (error) {
      enquiryError = error instanceof ApiError ? error.messages[0] : 'The server could not be reached.';
    }
  }
  let quotations: PaginatedResponse<QuotationListItem> | null = null;
  let quotationError: string | null = null;
  if (canReadQuotations) {
    try {
      quotations = await apiFetch<PaginatedResponse<QuotationListItem>>(`/quotations${queryString({ customerId, pageSize: 50, sortBy: 'createdAt', sortDir: 'desc' })}`);
    } catch (error) {
      quotationError = error instanceof ApiError ? error.messages[0] : 'The server could not be reached.';
    }
  }
  let invoices: PaginatedResponse<FinalInvoiceListItem> | null = null;
  let invoiceError: string | null = null;
  if (canReadInvoices) {
    try {
      invoices = await apiFetch<PaginatedResponse<FinalInvoiceListItem>>(`/final-invoices${queryString({ customerId, pageSize: 50, sortBy: 'createdAt', sortDir: 'desc' })}`);
    } catch (error) {
      invoiceError = error instanceof ApiError ? error.messages[0] : 'The server could not be reached.';
    }
  }
  let payments: CustomerPaymentHistory | null = null;
  let paymentError: string | null = null;
  if (canReadPayments) {
    try {
      payments = await apiFetch<CustomerPaymentHistory>(`/payments/customers/${customerId}/history`);
    } catch (error) {
      paymentError = error instanceof ApiError ? error.messages[0] : 'The server could not be reached.';
    }
  }

  return (
    <div className="space-y-5">
      {canReadEnquiries && (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <div>
              <h2 className="text-lg font-semibold text-ink">Enquiries</h2>
              <p className="text-sm text-ink-muted">
                {enquiries && enquiries.meta.totalItems > enquiries.items.length
                  ? `Latest ${enquiries.items.length} of ${enquiries.meta.totalItems} enquiries.`
                  : 'Enquiries recorded for this customer.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {enquiries && enquiries.meta.totalItems > enquiries.items.length && (
                <Link href={`/enquiries?customerId=${customerId}`} className="btn-secondary">View all</Link>
              )}
              {canCreateEnquiry && <Link href={`/enquiries/new?customerId=${customerId}`} className="btn-primary"><IconPlus size={16} /> Add Enquiry</Link>}
            </div>
          </div>
          {enquiryError ? (
            <div className="p-5"><ErrorState title="Could not load enquiries" message={enquiryError} /></div>
          ) : !enquiries || enquiries.items.length === 0 ? (
            <EmptyStateClient title="No enquiries yet" description="Enquiries created for this customer will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Enquiry ID</th>
                    <th scope="col">Enquiry Date</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="text-right">Products</th>
                    <th scope="col">Assigned To</th>
                    <th scope="col">Next Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {enquiries.items.map((e) => {
                    const overdue = isFollowUpOverdue(e.nextFollowUpDate, e.status);
                    return (
                      <tr key={e.id}>
                        <td className="whitespace-nowrap">
                          <Link href={`/enquiries/${e.id}`} className="font-mono text-sm font-semibold text-ink hover:text-accent hover:underline">{e.enquiryNumber}</Link>
                        </td>
                        <td className="whitespace-nowrap">{formatDate(e.enquiryDate)}</td>
                        <td><EnquiryStatusBadge status={e.status} /></td>
                        <td className="text-right tabular-nums">{e._count.items}</td>
                        <td className="whitespace-nowrap">{e.assignedTo?.fullName ?? <span className="text-ink-subtle">Unassigned</span>}</td>
                        <td className={overdue ? 'whitespace-nowrap font-semibold text-danger' : 'whitespace-nowrap'}>
                          {e.nextFollowUpDate ? formatDate(e.nextFollowUpDate) : <span className="text-ink-subtle">&mdash;</span>}
                          {overdue && ' (overdue)'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {canReadQuotations && (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <div>
              <h2 className="text-lg font-semibold text-ink">Quotations</h2>
              <p className="text-sm text-ink-muted">
                {quotations && quotations.meta.totalItems > quotations.items.length
                  ? `Latest ${quotations.items.length} of ${quotations.meta.totalItems} quotations.`
                  : 'Quotations prepared for this customer.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {quotations && quotations.meta.totalItems > quotations.items.length && (
                <Link href={`/quotations?customerId=${customerId}`} className="btn-secondary">View all</Link>
              )}
              {canCreateQuotation && <Link href={`/quotations/new?customerId=${customerId}`} className="btn-primary"><IconPlus size={16} /> New Quotation</Link>}
            </div>
          </div>
          {quotationError ? (
            <div className="p-5"><ErrorState title="Could not load quotations" message={quotationError} /></div>
          ) : !quotations || quotations.items.length === 0 ? (
            <EmptyStateClient title="No quotations yet" description="Quotations prepared for this customer will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Quotation No.</th>
                    <th scope="col">Date</th>
                    <th scope="col">Enquiry</th>
                    <th scope="col" className="text-right">Revision</th>
                    <th scope="col" className="text-right">Grand Total</th>
                    <th scope="col">Valid Until</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.items.map((q) => (
                    <tr key={q.id}>
                      <td className="whitespace-nowrap">
                        <Link href={`/quotations/${q.id}`} className="font-mono text-sm font-semibold text-ink hover:text-accent hover:underline">{q.quotationNumber}</Link>
                      </td>
                      <td className="whitespace-nowrap">{q.quotationDate ? formatDate(q.quotationDate) : <span className="text-ink-subtle">&mdash;</span>}</td>
                      <td className="whitespace-nowrap font-mono text-sm">{q.enquiry?.enquiryNumber ?? <span className="font-sans text-ink-subtle">Manual</span>}</td>
                      <td className="text-right tabular-nums">R{q.currentRevisionNumber}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(q.currentTotal, q.currency)}</td>
                      <td className="whitespace-nowrap">
                        {q.validUntil ? formatDate(q.validUntil) : <span className="text-ink-subtle">&mdash;</span>}
                        {q.pastValidity && <div className="mt-0.5"><PastValidityBadge /></div>}
                      </td>
                      <td><QuotationStatusBadge status={q.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {canReadInvoices && (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <div>
              <h2 className="text-lg font-semibold text-ink">Invoices</h2>
              <p className="text-sm text-ink-muted">
                {invoices && invoices.meta.totalItems > invoices.items.length
                  ? `Latest ${invoices.items.length} of ${invoices.meta.totalItems} final invoices.`
                  : 'Final invoices raised for this customer.'}
              </p>
            </div>
            {invoices && invoices.meta.totalItems > 0 && (
              <Link href={`/final-invoices?customerId=${customerId}`} className="btn-secondary">View all</Link>
            )}
          </div>
          {invoiceError ? (
            <div className="p-5"><ErrorState title="Could not load invoices" message={invoiceError} /></div>
          ) : !invoices || invoices.items.length === 0 ? (
            <EmptyStateClient title="No invoices yet" description="Final invoices raised for this customer will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Invoice No.</th>
                    <th scope="col">Invoice Date</th>
                    <th scope="col">Proforma Inv.</th>
                    <th scope="col" className="text-right">Total</th>
                    <th scope="col">Due Date</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.items.map((inv) => (
                    <tr key={inv.id}>
                      <td className="whitespace-nowrap">
                        <Link href={`/final-invoices/${inv.id}`} className="font-mono text-sm font-semibold text-ink hover:text-accent hover:underline">{inv.invoiceNumber ?? <DraftNumberPill />}</Link>
                      </td>
                      <td className="whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
                      <td className="whitespace-nowrap font-mono text-sm">{inv.proformaInvoice.piNumber}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(inv.grandTotal, inv.currency)}</td>
                      <td className={inv.pastDue ? 'whitespace-nowrap font-semibold text-danger' : 'whitespace-nowrap'}>
                        {inv.dueDate ? formatDate(inv.dueDate) : <span className="text-ink-subtle">&mdash;</span>}
                        {inv.pastDue && ' (past due date)'}
                      </td>
                      <td><FinalInvoiceStatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {canReadPayments && (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <div>
              <h2 className="text-lg font-semibold text-ink">Payment History</h2>
              <p className="text-sm text-ink-muted">{payments ? `${payments.paymentCount} verified payment transaction${payments.paymentCount === 1 ? '' : 's'}` : 'Customer payment positions and transactions.'}</p>
            </div>
            {canCreatePayment && <Link href={`/payments/new?customerId=${customerId}`} className="btn-primary"><IconPlus size={16} /> Record Payment</Link>}
          </div>
          {paymentError ? (
            <div className="p-5"><ErrorState title="Could not load payments" message={paymentError} /></div>
          ) : payments ? (
            <div className="space-y-4 p-5">
              {payments.totals.map((total) => (
                <div key={total.currency} className="grid grid-cols-3 gap-3 rounded-lg border border-border p-4 text-sm">
                  <div><p className="text-ink-subtle">Invoiced</p><p className="font-semibold text-ink">{formatMoney(total.invoiced, total.currency)}</p></div>
                  <div><p className="text-ink-subtle">Verified Payments</p><p className="font-semibold text-success">{formatMoney(total.verifiedPayments, total.currency)}</p></div>
                  <div><p className="text-ink-subtle">Outstanding</p><p className="font-semibold text-ink">{formatMoney(total.outstanding, total.currency)}</p></div>
                </div>
              ))}
              {payments.payments.length === 0 ? (
                <EmptyStateClient title="No payments yet" description="Payments recorded for this customer will appear here." />
              ) : (
                <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Receipt</th><th>Date</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>{payments.payments.slice(0, 50).map((payment) => (
                  <tr key={payment.id}><td><Link href={`/payments/${payment.id}`} className="font-mono font-semibold text-accent hover:underline">{payment.receiptNumber}</Link></td><td>{formatDate(payment.paymentDate)}</td><td className="text-right font-semibold tabular-nums">{formatMoney(payment.amount, payment.currency)}</td><td>{payment.method.replace(/_/g, ' ')}</td><td>{payment.status.replace(/_/g, ' ')}</td></tr>
                ))}</tbody></table></div>
              )}
            </div>
          ) : (
            <EmptyStateClient title="No payment history" description="Payment history could not be loaded." />
          )}
        </section>
      )}
    </div>
  );
}
