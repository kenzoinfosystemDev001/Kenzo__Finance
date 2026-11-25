import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { ActivityEntry, PaginatedResponse, ProformaDetail } from '@/lib/types';
import { formatMoney } from '@/lib/quotation-labels';
import { PROFORMA_STATUS_LABELS } from '@/lib/proforma-labels';
import { activityLabel, formatBytes, formatDate, formatDateTime } from '@/lib/vendor-labels';
import { DefinitionList, ErrorState, Pagination, SectionCard, Tabs } from '@/components/ui';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';
import { ProformaStatusBadge } from '@/components/proforma-badges';
import { ProformaLines } from '@/components/proforma-lines';
import { IconChevronLeft, IconDownload, IconInvoice, IconPlus } from '@/components/icons';
import { FinalInvoiceStatusBadge } from '@/components/final-invoice-badges';
import { ProformaDocumentsPanel, ProformaHeaderActions } from './proforma-panels';

const TABS = ['overview', 'products', 'quotation', 'documents', 'payments', 'activity'] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const pi = await apiFetch<ProformaDetail>(`/proforma-invoices/${id}`).catch(() => null);
  return { title: pi ? `PI ${pi.piNumber}` : 'Proforma Invoice' };
}

export default async function ProformaProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string; created?: string; saved?: string; existing?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);

  let pi: ProformaDetail;
  try {
    pi = await apiFetch<ProformaDetail>(`/proforma-invoices/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : 'overview';
  const href = (t: Tab) => `/proforma-invoices/${pi.id}${t === 'overview' ? '' : `?tab=${t}`}`;
  const money = (value: string) => formatMoney(value, pi.currency);
  const uploads = pi.documents.filter((d) => d.kind !== 'PROFORMA_PDF');
  const bank = pi.bankDetails ?? {};
  const snapshot = pi.customerSnapshot;
  const address = snapshot.billingAddress;
  const finalInvoices = pi.finalInvoices ?? [];
  // One live invoice per PI: offer creation only when none is live and the PI is issued.
  const canCreateInvoice = can('invoice.create') && (pi.status === 'ISSUED' || pi.status === 'SENT') && !finalInvoices.some((f) => f.activeProformaId);

  return (
    <div className="space-y-5">
      <Link href="/proforma-invoices" className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-accent"><IconChevronLeft size={16} /> All proforma invoices</Link>
      {query.created && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Proforma invoice {pi.piNumber} created as a draft.</p>}
      {query.saved && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Draft saved.</p>}
      {query.existing && <p role="status" className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-2.5 text-sm text-warning">This quotation already has proforma invoice {pi.piNumber}; a duplicate was not created.</p>}
      {pi.status === 'CANCELLED' && (
        <p role="status" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-2.5 text-sm text-danger">
          Cancelled {pi.cancelledAt ? formatDateTime(pi.cancelledAt) : ''}{pi.cancellationReason ? ` — ${pi.cancellationReason}` : ''}.
          {pi.replacedBy && <> Replaced by <Link href={`/proforma-invoices/${pi.replacedBy.id}`} className="font-semibold underline">{pi.replacedBy.piNumber}</Link>.</>}
        </p>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent text-white"><IconInvoice size={28} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-2xl font-bold text-ink">{pi.piNumber}</h1>
                <ProformaStatusBadge status={pi.status} />
              </div>
              <p className="mt-1 text-base text-ink">
                {can('customer.read') ? <Link href={`/customers/${pi.customer.id}`} className="font-semibold hover:text-accent hover:underline">{pi.customer.name}</Link> : <span className="font-semibold">{pi.customer.name}</span>}
                <span className="text-ink-muted"> &middot; <span className="font-mono">{pi.customer.customerCode}</span> &middot; {formatDate(pi.piDate)}</span>
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                From quotation{' '}
                {can('quotation.read') ? <Link href={`/quotations/${pi.quotation.id}`} className="font-mono text-ink hover:text-accent hover:underline">{pi.quotation.quotationNumber}</Link> : <span className="font-mono text-ink">{pi.quotation.quotationNumber}</span>}
                {' '}revision {pi.quotationRevision.revisionNumber} &middot; Assigned to <span className="text-ink">{pi.assignedTo?.fullName ?? 'nobody'}</span>
                {pi.dueDate && <> &middot; Payment due <span className="text-ink">{formatDate(pi.dueDate)}</span></>}
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{money(pi.grandTotal)}</p>
              {pi.replaces && (
                <p className="mt-1 text-sm text-ink-muted">Replaces cancelled <Link href={`/proforma-invoices/${pi.replaces.id}`} className="font-mono text-ink hover:text-accent hover:underline">{pi.replaces.piNumber}</Link></p>
              )}
            </div>
          </div>
          <ProformaHeaderActions
            pi={{ id: pi.id, piNumber: pi.piNumber, status: pi.status, approvalRequired: pi.approvalRequired, deletable: pi.deletable, issued: Boolean(pi.issuedAt) }}
            permissions={permissions}
          />
        </div>
      </section>

      {(finalInvoices.length > 0 || canCreateInvoice) && (
        <section className="card p-5" aria-label="Final invoices">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Final invoices</h2>
              <p className="text-sm text-ink-muted">
                {finalInvoices.length === 0 ? 'No final invoice has been raised from this proforma invoice yet.' : 'Invoices raised from this proforma invoice.'}
              </p>
            </div>
            {canCreateInvoice && <Link href={`/final-invoices/new?proformaInvoiceId=${pi.id}`} className="btn-primary"><IconPlus size={16} /> Create Final Invoice</Link>}
          </div>
          {finalInvoices.length > 0 && (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
              {finalInvoices.map((fi) => (
                <li key={fi.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {can('invoice.read') ? (
                      <Link href={`/final-invoices/${fi.id}`} className="font-mono text-sm font-semibold text-ink hover:text-accent hover:underline">{fi.invoiceNumber ?? 'Draft invoice'}</Link>
                    ) : (
                      <span className="font-mono text-sm font-semibold text-ink">{fi.invoiceNumber ?? 'Draft invoice'}</span>
                    )}
                    <FinalInvoiceStatusBadge status={fi.status} />
                  </div>
                  <p className="text-sm text-ink-muted">
                    {formatDate(fi.invoiceDate)} &middot; <span className="tabular-nums text-ink">{money(fi.grandTotal)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Tabs
        active={tab}
        tabs={[
          { key: 'overview', label: 'Overview', href: href('overview') },
          { key: 'products', label: 'Products', href: href('products'), count: pi.items.length },
          { key: 'quotation', label: 'Source Quotation', href: href('quotation') },
          { key: 'documents', label: 'Documents', href: href('documents'), count: uploads.length + (pi.pdfDocument ? 1 : 0) },
          { key: 'payments', label: 'Payments', href: href('payments') },
          { key: 'activity', label: 'Activity', href: href('activity') },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <SectionCard title="Proforma invoice">
            <DefinitionList
              items={[
                { label: 'PI number', value: <span className="font-mono">{pi.piNumber}</span> },
                { label: 'Status', value: PROFORMA_STATUS_LABELS[pi.status] },
                { label: 'PI date', value: formatDate(pi.piDate) },
                { label: 'Payment due', value: pi.dueDate ? formatDate(pi.dueDate) : null },
                { label: 'Grand total', value: money(pi.grandTotal) },
                { label: 'Advance requested', value: pi.advanceAmount ? money(pi.advanceAmount) : null },
                { label: 'Subject', value: pi.subject },
                { label: 'Customer reference', value: pi.referenceNumber },
                { label: 'Assigned to', value: pi.assignedTo?.fullName },
                { label: 'Issued', value: pi.issuedAt ? `${formatDateTime(pi.issuedAt)}${pi.issuedBy ? ` by ${pi.issuedBy.fullName}` : ''}` : 'Not issued' },
                { label: 'Created', value: `${formatDateTime(pi.createdAt)}${pi.createdBy ? ` by ${pi.createdBy.fullName}` : ''}` },
                { label: 'Internal remarks', value: pi.internalRemarks },
              ]}
            />
          </SectionCard>
          <SectionCard title="Customer" description={pi.issuedAt ? 'As frozen when the PI was issued.' : 'Follows the customer record until the PI is issued.'}>
            <DefinitionList
              items={[
                { label: 'Customer', value: snapshot.name },
                { label: 'Contact', value: [snapshot.contactName, snapshot.contactDesignation].filter(Boolean).join(', ') },
                { label: 'Phone', value: snapshot.phone },
                { label: 'Email', value: snapshot.email },
                { label: 'Billing address', value: address ? [address.addressLine1, address.addressLine2, [address.city, address.state, address.postalCode].filter(Boolean).join(', '), address.country].filter(Boolean).join(', ') : null },
                { label: 'GSTIN / PAN', value: [snapshot.gstin, snapshot.pan].filter(Boolean).join(' / ') },
              ]}
            />
          </SectionCard>
          <SectionCard title="Payment details" description="Printed on the PI.">
            <DefinitionList
              items={[
                { label: 'Bank', value: bank.bankName },
                { label: 'Account name', value: bank.accountName },
                { label: 'Account number', value: bank.accountNumber },
                { label: 'IFSC', value: bank.ifsc },
                { label: 'SWIFT / BIC', value: bank.swift },
                { label: 'Branch', value: bank.branch },
              ]}
            />
            {pi.paymentInstructions && <p className="mt-4 whitespace-pre-line text-sm text-ink">{pi.paymentInstructions}</p>}
          </SectionCard>
          <SectionCard title="Terms">
            {[['Payment terms', pi.paymentTerms], ['Delivery terms', pi.deliveryTerms], ['Warranty', pi.warrantyTerms], ['Terms and conditions', pi.termsAndConditions], ['Notes', pi.notes]].some(([, v]) => v) ? (
              <div className="space-y-3">
                {([['Payment terms', pi.paymentTerms], ['Delivery terms', pi.deliveryTerms], ['Warranty', pi.warrantyTerms], ['Terms and conditions', pi.termsAndConditions], ['Notes', pi.notes]] as Array<[string, string | null]>)
                  .filter(([, v]) => v)
                  .map(([title, body]) => (
                    <div key={title}>
                      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{title}</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-ink">{body}</p>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">No terms recorded.</p>
            )}
          </SectionCard>
          <section className="card xl:col-span-2">
            <PanelHeader title="Status history" description="Every lifecycle step, who made it and why." />
            <ol className="divide-y divide-border">
              {pi.statusHistory.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {h.previousStatus ? `${PROFORMA_STATUS_LABELS[h.previousStatus]} → ` : ''}{PROFORMA_STATUS_LABELS[h.newStatus]}
                    </p>
                    {h.remarks && <p className="text-sm text-ink-muted">{h.remarks}</p>}
                  </div>
                  <p className="text-xs text-ink-subtle">{formatDateTime(h.changedAt)} &middot; {h.changedBy?.fullName ?? 'System'}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {tab === 'products' && (
        <SectionCard title="Products" description="Copied exactly from the accepted quotation revision.">
          <ProformaLines items={pi.items} totals={pi} currency={pi.currency} advanceAmount={pi.advanceAmount} />
        </SectionCard>
      )}

      {tab === 'quotation' && (
        <SectionCard
          title="Source quotation"
          description="The proforma invoice was raised from this exact revision."
          actions={can('quotation.read') ? <Link href={`/quotations/${pi.quotation.id}?tab=revisions`} className="btn-secondary">Open quotation</Link> : undefined}
        >
          <DefinitionList
            items={[
              { label: 'Quotation', value: <span className="font-mono">{pi.quotation.quotationNumber}</span> },
              { label: 'Accepted revision', value: `Revision ${pi.quotationRevision.revisionNumber}` },
              { label: 'Quotation date', value: formatDate(pi.quotationRevision.quotationDate) },
              { label: 'Accepted on', value: pi.quotation.acceptedAt ? formatDateTime(pi.quotation.acceptedAt) : null },
              { label: 'Accepted amount', value: money(pi.quotationRevision.grandTotal) },
              { label: 'Enquiry', value: pi.quotation.enquiry ? (can('enquiry.read') ? <Link href={`/enquiries/${pi.quotation.enquiry.id}`} className="font-mono hover:text-accent hover:underline">{pi.quotation.enquiry.enquiryNumber}</Link> : pi.quotation.enquiry.enquiryNumber) : 'Manual quotation' },
            ]}
          />
          {pi.quotationRevision.grandTotal !== pi.grandTotal && (
            <p className="mt-4 text-sm text-danger">The PI total differs from the accepted revision. Report this to an administrator.</p>
          )}
        </SectionCard>
      )}

      {tab === 'documents' && (
        <div className="space-y-5">
          <SectionCard title="Generated PDF" description={pi.issuedAt ? 'Stored when the PI was issued; every download returns this exact document.' : 'Not issued yet: downloads are previews marked DRAFT.'}>
            {pi.pdfDocument ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{pi.pdfDocument.originalFilename}</p>
                  <p className="text-xs text-ink-subtle">{formatBytes(pi.pdfDocument.sizeBytes)} &middot; {formatDateTime(pi.pdfDocument.createdAt)}</p>
                </div>
                {can('proforma.download') && <a href={`/proforma-invoices/${pi.id}/pdf`} className="btn-secondary"><IconDownload size={16} /> Download</a>}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">{pi.issuedAt ? 'The PDF will be stored on the first download.' : 'No stored PDF yet.'}</p>
            )}
          </SectionCard>
          <section className="card">
            <PanelHeader title="Supporting documents" description="Uploaded files linked to this proforma invoice." />
            <div className="p-4">
              <ProformaDocumentsPanel piId={pi.id} documents={uploads} canManage={can('proforma.update') && pi.status !== 'CANCELLED'} canDownload={can('document.download')} />
            </div>
          </section>
        </div>
      )}

      {tab === 'payments' && (
        <SectionCard title="Payments" description="Payment tracking belongs to Payment Management.">
          <DefinitionList
            items={[
              { label: 'PI total', value: money(pi.grandTotal) },
              { label: 'Advance requested', value: pi.advanceAmount ? money(pi.advanceAmount) : null },
            ]}
          />
          <p className="mt-4 text-sm text-ink-muted">
            Payment Management is not part of the application yet, so no payments are recorded and no outstanding amount is calculated here. A
            proforma invoice is not a tax invoice and does not confirm that payment was received.
          </p>
        </SectionCard>
      )}

      {tab === 'activity' && <ActivityTab piId={pi.id} page={query.page} />}
    </div>
  );
}

async function ActivityTab({ piId, page }: { piId: string; page?: string }) {
  let data: PaginatedResponse<ActivityEntry>;
  try {
    data = await apiFetch<PaginatedResponse<ActivityEntry>>(`/proforma-invoices/${piId}/activity${queryString({ page: page ?? '1', pageSize: 20 })}`);
  } catch (error) {
    return <ErrorState title="Could not load activity" message={error instanceof ApiError ? error.messages[0] : 'The server could not be reached.'} />;
  }
  return (
    <section className="card">
      <PanelHeader title="Activity history" description="From the audit log: creation, edits, approvals, status changes and documents." />
      {data.items.length === 0 ? (
        <EmptyStateClient title="No activity recorded" description="Changes to this proforma invoice will appear here." />
      ) : (
        <>
          <ol className="divide-y divide-border">
            {data.items.map((entry) => (
              <li key={entry.id} className="flex gap-4 px-5 py-3.5">
                <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">{activityLabel(entry.action)}</p>
                    <time dateTime={entry.createdAt} className="text-xs text-ink-subtle">{formatDateTime(entry.createdAt)}</time>
                  </div>
                  {entry.summary && <p className="text-sm text-ink-muted">{entry.summary}</p>}
                  <p className="text-xs text-ink-subtle">by {entry.actor?.fullName ?? 'System'}</p>
                </div>
              </li>
            ))}
          </ol>
          <Pagination meta={data.meta} basePath={`/proforma-invoices/${piId}`} params={{ tab: 'activity' }} noun="events" />
        </>
      )}
    </section>
  );
}
