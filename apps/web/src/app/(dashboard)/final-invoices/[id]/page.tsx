import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { ActivityEntry, FinalInvoiceDetail, InvoicePaymentHistory, PaginatedResponse } from '@/lib/types';
import { formatMoney } from '@/lib/quotation-labels';
import { PROFORMA_STATUS_LABELS } from '@/lib/proforma-labels';
import { asLineItems, FINAL_INVOICE_STATUS_LABELS } from '@/lib/final-invoice-labels';
import { activityLabel, formatBytes, formatDate, formatDateTime } from '@/lib/vendor-labels';
import { DefinitionList, ErrorState, Pagination, SectionCard, Tabs } from '@/components/ui';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';
import { FinalInvoiceStatusBadge, PastDueBadge } from '@/components/final-invoice-badges';
import { ProformaLines } from '@/components/proforma-lines';
import { IconChevronLeft, IconDownload, IconFile } from '@/components/icons';
import { InvoiceDeliveriesPanel } from '@/components/delivery-history';
import { FinalInvoiceDocumentsPanel, FinalInvoiceHeaderActions } from './final-invoice-panels';

const TABS = ['overview', 'items', 'proforma', 'payments', 'deliveries', 'documents', 'activity'] as const;
type Tab = (typeof TABS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const inv = UUID.test(id) ? await apiFetch<FinalInvoiceDetail>(`/final-invoices/${id}`).catch(() => null) : null;
  return { title: inv ? `Invoice ${inv.invoiceNumber ?? '(draft)'}` : 'Final Invoice' };
}

export default async function FinalInvoiceProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string; created?: string; saved?: string; existing?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);

  let inv: FinalInvoiceDetail;
  try {
    inv = await apiFetch<FinalInvoiceDetail>(`/final-invoices/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    if (error instanceof ApiError && error.status === 403) return <ErrorState title="Not allowed" message="You do not have permission to view invoices." />;
    throw error;
  }

  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : 'overview';
  const href = (t: Tab) => `/final-invoices/${inv.id}${t === 'overview' ? '' : `?tab=${t}`}`;
  const money = (value: string) => formatMoney(value, inv.currency);
  const ref = inv.invoiceNumber ?? 'Draft invoice';
  const uploads = inv.documents.filter((d) => d.kind !== 'FINAL_INVOICE_PDF');
  const bank = inv.bankDetails ?? {};
  const snapshot = inv.customerSnapshot;
  const address = snapshot.billingAddress;
  const terms = ([
    ['Payment terms', inv.paymentTerms],
    ['Delivery terms', inv.deliveryTerms],
    ['Warranty', inv.warrantyTerms],
    ['Terms and conditions', inv.termsAndConditions],
    ['Notes', inv.notes],
  ] as Array<[string, string | null]>).filter(([, v]) => v);
  const invoiceLink = (target: { id: string; invoiceNumber: string | null }) => (
    <Link href={`/final-invoices/${target.id}`} className="font-mono font-semibold underline">{target.invoiceNumber ?? 'draft invoice'}</Link>
  );

  return (
    <div className="space-y-5">
      <Link href="/final-invoices" className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-accent"><IconChevronLeft size={16} /> All invoices</Link>
      {query.created && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Draft invoice created. The invoice number is allocated when it is issued.</p>}
      {query.saved && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Draft saved.</p>}
      {query.existing && <p role="status" className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-2.5 text-sm text-warning">Proforma invoice {inv.proformaInvoice.piNumber} already has this invoice; a duplicate was not created.</p>}
      {inv.status === 'CANCELLED' && (
        <p role="status" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-2.5 text-sm text-danger">
          Cancelled {inv.cancelledAt ? formatDateTime(inv.cancelledAt) : ''}{inv.cancellationReason ? ` — ${inv.cancellationReason}` : ''}.
          {inv.replacedBy && <> Replaced by {invoiceLink(inv.replacedBy)}.</>}
        </p>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent text-white"><IconFile size={28} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-2xl font-bold text-ink">{inv.invoiceNumber ?? 'Draft invoice'}</h1>
                <FinalInvoiceStatusBadge status={inv.status} />
                {inv.pastDue && <PastDueBadge />}
              </div>
              <p className="mt-1 text-base text-ink">
                {can('customer.read') ? <Link href={`/customers/${inv.customer.id}`} className="font-semibold hover:text-accent hover:underline">{inv.customer.name}</Link> : <span className="font-semibold">{inv.customer.name}</span>}
                <span className="text-ink-muted"> &middot; <span className="font-mono">{inv.customer.customerCode}</span> &middot; {formatDate(inv.invoiceDate)}</span>
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                From proforma invoice{' '}
                {can('proforma.read') ? <Link href={`/proforma-invoices/${inv.proformaInvoice.id}`} className="font-mono text-ink hover:text-accent hover:underline">{inv.proformaInvoice.piNumber}</Link> : <span className="font-mono text-ink">{inv.proformaInvoice.piNumber}</span>}
                {' '}&middot; Assigned to <span className="text-ink">{inv.assignedTo?.fullName ?? 'nobody'}</span>
                {inv.dueDate && <> &middot; Due <span className={inv.pastDue ? 'font-semibold text-danger' : 'text-ink'}>{formatDate(inv.dueDate)}</span></>}
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{money(inv.grandTotal)}</p>
              {!inv.invoiceNumber && inv.status !== 'CANCELLED' && <p className="mt-1 text-sm text-ink-muted">The invoice number is allocated when the invoice is issued.</p>}
              {inv.replaces && <p className="mt-1 text-sm text-ink-muted">Replaces cancelled {invoiceLink(inv.replaces)}</p>}
              {inv.replacedBy && inv.status !== 'CANCELLED' && <p className="mt-1 text-sm text-ink-muted">Replaced by {invoiceLink(inv.replacedBy)}</p>}
            </div>
          </div>
          <FinalInvoiceHeaderActions
            invoice={{ id: inv.id, invoiceNumber: inv.invoiceNumber, status: inv.status, approvalRequired: inv.approvalRequired, deletable: inv.deletable, issued: Boolean(inv.issuedAt) }}
            permissions={permissions}
          />
        </div>
      </section>

      <Tabs
        active={tab}
        tabs={[
          { key: 'overview', label: 'Overview', href: href('overview') },
          { key: 'items', label: 'Items', href: href('items'), count: inv.items.length },
          { key: 'proforma', label: 'Proforma Reference', href: href('proforma') },
          { key: 'payments', label: 'Payments', href: href('payments') },
          ...(can('delivery.read') ? [{ key: 'deliveries', label: 'Deliveries', href: href('deliveries') }] : []),
          { key: 'documents', label: 'Documents', href: href('documents'), count: uploads.length + (inv.pdfDocument ? 1 : 0) },
          { key: 'activity', label: 'Activity', href: href('activity') },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <SectionCard title="Invoice">
            <DefinitionList
              items={[
                { label: 'Invoice number', value: inv.invoiceNumber ? <span className="font-mono">{inv.invoiceNumber}</span> : 'Allocated when issued' },
                { label: 'Status', value: FINAL_INVOICE_STATUS_LABELS[inv.status] },
                { label: 'Invoice date', value: formatDate(inv.invoiceDate) },
                { label: 'Due date', value: inv.dueDate ? `${formatDate(inv.dueDate)}${inv.pastDue ? ' (past due date)' : ''}` : null },
                { label: 'Grand total', value: money(inv.grandTotal) },
                { label: 'Tax total', value: money(inv.taxTotal) },
                { label: 'Subject', value: inv.subject },
                { label: 'Customer PO no.', value: inv.purchaseOrderNumber },
                { label: 'Assigned to', value: inv.assignedTo?.fullName },
                { label: 'Issued', value: inv.issuedAt ? `${formatDateTime(inv.issuedAt)}${inv.issuedBy ? ` by ${inv.issuedBy.fullName}` : ''}` : 'Not issued' },
                { label: 'Created', value: `${formatDateTime(inv.createdAt)}${inv.createdBy ? ` by ${inv.createdBy.fullName}` : ''}` },
                { label: 'Internal remarks', value: inv.internalRemarks },
              ]}
            />
          </SectionCard>
          <SectionCard title="Customer" description={inv.issuedAt ? 'As frozen when the invoice was issued.' : 'Follows the customer record until the invoice is issued.'}>
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
          <SectionCard title="Payment details" description="Printed on the invoice.">
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
            {inv.paymentInstructions && <p className="mt-4 whitespace-pre-line text-sm text-ink">{inv.paymentInstructions}</p>}
          </SectionCard>
          <SectionCard title="Terms">
            {terms.length ? (
              <div className="space-y-3">
                {terms.map(([title, body]) => (
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
              {inv.statusHistory.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {h.previousStatus ? `${FINAL_INVOICE_STATUS_LABELS[h.previousStatus]} → ` : ''}{FINAL_INVOICE_STATUS_LABELS[h.newStatus]}
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

      {tab === 'items' && (
        <SectionCard title="Items" description={`Copied exactly from proforma invoice ${inv.proformaInvoice.piNumber}.`}>
          <ProformaLines items={asLineItems(inv.items)} totals={inv} currency={inv.currency} />
        </SectionCard>
      )}

      {tab === 'proforma' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <SectionCard
            title="Proforma invoice"
            description="The invoice was raised from this proforma invoice; lines and amounts are copied from it."
            actions={can('proforma.read') ? <Link href={`/proforma-invoices/${inv.proformaInvoice.id}`} className="btn-secondary">Open proforma invoice</Link> : undefined}
          >
            <DefinitionList
              items={[
                { label: 'PI number', value: <span className="font-mono">{inv.proformaInvoice.piNumber}</span> },
                { label: 'PI date', value: formatDate(inv.proformaInvoice.piDate) },
                { label: 'PI status', value: PROFORMA_STATUS_LABELS[inv.proformaInvoice.status] },
                { label: 'PI issued', value: inv.proformaInvoice.issuedAt ? formatDateTime(inv.proformaInvoice.issuedAt) : null },
                { label: 'PI total', value: money(inv.proformaInvoice.grandTotal) },
                { label: 'Advance requested on PI', value: inv.proformaInvoice.advanceAmount ? money(inv.proformaInvoice.advanceAmount) : null },
              ]}
            />
            {inv.proformaInvoice.grandTotal !== inv.grandTotal && (
              <p className="mt-4 text-sm text-danger">The invoice total differs from the proforma invoice. Report this to an administrator.</p>
            )}
          </SectionCard>
          <SectionCard
            title="Quotation"
            description="The accepted quotation revision behind the proforma invoice."
            actions={can('quotation.read') ? <Link href={`/quotations/${inv.quotation.id}?tab=revisions`} className="btn-secondary">Open quotation</Link> : undefined}
          >
            <DefinitionList
              items={[
                { label: 'Quotation', value: <span className="font-mono">{inv.quotation.quotationNumber}</span> },
                { label: 'Accepted revision', value: `Revision ${inv.quotationRevision.revisionNumber}` },
                { label: 'Quotation date', value: formatDate(inv.quotationRevision.quotationDate) },
                { label: 'Accepted amount', value: money(inv.quotationRevision.grandTotal) },
                {
                  label: 'Enquiry',
                  value: inv.quotation.enquiry
                    ? can('enquiry.read')
                      ? <Link href={`/enquiries/${inv.quotation.enquiry.id}`} className="font-mono hover:text-accent hover:underline">{inv.quotation.enquiry.enquiryNumber}</Link>
                      : inv.quotation.enquiry.enquiryNumber
                    : 'Manual quotation',
                },
              ]}
            />
          </SectionCard>
        </div>
      )}

      {tab === 'deliveries' && (
        <InvoiceDeliveriesPanel invoiceId={inv.id} customerId={inv.customerId} invoiceDeliverable={inv.status === 'ISSUED' || inv.status === 'SENT'} permissions={permissions} />
      )}

      {tab === 'payments' && (
        <InvoicePaymentsTab invoiceId={inv.id} customerId={inv.customerId} currency={inv.currency} canReadPayments={can('payment.read')} canCreatePayment={can('payment.create') && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT'} />
      )}

      {tab === 'documents' && (
        <div className="space-y-5">
          <SectionCard title="Invoice PDF" description={inv.issuedAt ? 'Stored when the invoice was issued; every download returns this exact document.' : 'Not issued yet: downloads are previews marked DRAFT.'}>
            {inv.pdfDocument ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{inv.pdfDocument.originalFilename}</p>
                  <p className="text-xs text-ink-subtle">{formatBytes(inv.pdfDocument.sizeBytes)} &middot; {formatDateTime(inv.pdfDocument.createdAt)}</p>
                </div>
                {can('invoice.download') && <a href={`/final-invoices/${inv.id}/pdf`} className="btn-secondary"><IconDownload size={16} /> Download</a>}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">{inv.issuedAt ? 'The PDF will be stored on the first download.' : 'No stored PDF yet.'}</p>
            )}
          </SectionCard>
          <section className="card">
            <PanelHeader title="Supporting documents" description="Uploaded files linked to this invoice." />
            <div className="p-4">
              <FinalInvoiceDocumentsPanel invoiceId={inv.id} documents={uploads} canManage={can('invoice.update') && inv.status !== 'CANCELLED'} canDownload={can('document.download')} />
            </div>
          </section>
        </div>
      )}

      {tab === 'activity' && <ActivityTab invoiceId={inv.id} page={query.page} reference={ref} />}
    </div>
  );
}

async function InvoicePaymentsTab({ invoiceId, customerId, currency, canReadPayments, canCreatePayment }: { invoiceId: string; customerId: string; currency: string; canReadPayments: boolean; canCreatePayment: boolean }) {
  if (!canReadPayments) return <ErrorState title="Not allowed" message="You do not have permission to view payments." />;
  let history: InvoicePaymentHistory;
  try {
    history = await apiFetch<InvoicePaymentHistory>(`/payments/invoices/${invoiceId}/history`);
  } catch (error) {
    return <ErrorState title="Could not load payments" message={error instanceof ApiError ? error.messages[0] : 'The server could not be reached.'} />;
  }
  return (
    <div className="space-y-5">
      <SectionCard title="Payment Position" description="Calculated from verified payment allocations.">
        <DefinitionList items={[
          { label: 'Invoice total', value: formatMoney(history.invoice.grandTotal, currency) },
          { label: 'Total verified payments', value: formatMoney(history.invoice.amountReceived, currency) },
          { label: 'Pending verification', value: formatMoney(history.invoice.pendingVerification, currency) },
          { label: 'Outstanding', value: formatMoney(history.invoice.outstanding, currency) },
          { label: 'Payment status', value: history.invoice.paymentState.replace(/_/g, ' ') },
        ]} />
        {canCreatePayment && <Link href={`/payments/new?customerId=${encodeURIComponent(customerId)}&invoiceId=${encodeURIComponent(invoiceId)}`} className="btn-primary mt-4 inline-flex">Record Payment</Link>}
      </SectionCard>
      <section className="card overflow-hidden">
        <PanelHeader title="Payment history" description="Every recorded transaction, including pending, rejected and reversed records." />
        {history.payments.length === 0 ? (
          <EmptyStateClient title="No payments yet" description="Payments recorded against this invoice will appear here." />
        ) : (
          <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Receipt</th><th>Payment Date</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>{history.payments.map((payment) => (
            <tr key={payment.id}><td><Link href={`/payments/${payment.id}`} className="font-mono font-semibold text-accent hover:underline">{payment.receiptNumber}</Link></td><td>{formatDate(payment.paymentDate)}</td><td className="font-semibold tabular-nums">{formatMoney(payment.amount, payment.currency)}</td><td>{payment.method.replace(/_/g, ' ')}</td><td>{payment.status.replace(/_/g, ' ')}</td></tr>
          ))}</tbody></table></div>
        )}
      </section>
    </div>
  );
}

async function ActivityTab({ invoiceId, page, reference }: { invoiceId: string; page?: string; reference: string }) {
  let data: PaginatedResponse<ActivityEntry>;
  try {
    data = await apiFetch<PaginatedResponse<ActivityEntry>>(`/final-invoices/${invoiceId}/activity${queryString({ page: page ?? '1', pageSize: 20 })}`);
  } catch (error) {
    return <ErrorState title="Could not load activity" message={error instanceof ApiError ? error.messages[0] : 'The server could not be reached.'} />;
  }
  return (
    <section className="card">
      <PanelHeader title="Activity history" description={`From the audit log for ${reference}: creation, edits, approvals, status changes and documents.`} />
      {data.items.length === 0 ? (
        <EmptyStateClient title="No activity recorded" description="Changes to this invoice will appear here." />
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
          <Pagination meta={data.meta} basePath={`/final-invoices/${invoiceId}`} params={{ tab: 'activity' }} noun="events" />
        </>
      )}
    </section>
  );
}
