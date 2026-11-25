import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import clsx from 'clsx';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type {
  ActivityEntry,
  PaginatedResponse,
  QuotationAddressSnapshot,
  QuotationCompareResult,
  QuotationDetail,
  QuotationRevision,
  QuotationStatus,
} from '@/lib/types';
import { CUSTOMER_TYPE_LABELS } from '@/lib/customer-labels';
import {
  COMPARE_FIELD_LABELS,
  DISCOUNT_TYPE_LABELS,
  formatMoney,
  formatRate,
  isPastDate,
  QUOTATION_STATUS_LABELS,
} from '@/lib/quotation-labels';
import { activityLabel, formatAddress, formatBytes, formatDate, formatDateTime, formatPhone, specificationList } from '@/lib/vendor-labels';
import { DefinitionList, ErrorState, Pagination, Tabs } from '@/components/ui';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';
import { PastValidityBadge, QuotationStatusBadge } from '@/components/quotation-badges';
import { IconChevronLeft, IconDownload, IconFile, IconInvoice, IconQuote } from '@/components/icons';
import { QuotationCommunicationPanel, QuotationDocumentsPanel, QuotationHeaderActions } from './quotation-panels';
import { QuotationEmailButton } from './quotation-email-dialog';
import { EmailHistory } from './email-history';

const TABS = ['overview', 'products', 'revisions', 'documents', 'communication', 'emails', 'activity'] as const;
type Tab = (typeof TABS)[number];

/** States in which a passed validity date matters (still open). */
const OPEN: QuotationStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'UNDER_NEGOTIATION'];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const quotation = await apiFetch<QuotationDetail>(`/quotations/${id}`).catch(() => null);
  return { title: quotation?.quotationNumber ?? 'Quotation' };
}

export default async function QuotationProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string; created?: string; updated?: string; from?: string; to?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);

  let quotation: QuotationDetail;
  try {
    quotation = await apiFetch<QuotationDetail>(`/quotations/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  const current = quotation.revisions[0];
  const accepted = quotation.acceptedRevisionId ? quotation.revisions.find((r) => r.id === quotation.acceptedRevisionId) ?? null : null;
  const validityPassed = Boolean(current && OPEN.includes(quotation.status) && isPastDate(current.validUntil));
  const uploads = quotation.documents.filter((d) => d.kind !== 'QUOTATION_PDF');
  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : 'overview';
  const href = (t: Tab) => `/quotations/${quotation.id}${t === 'overview' ? '' : `?tab=${t}`}`;
  const money = (value: string) => formatMoney(value, quotation.currency);

  return (
    <div className="space-y-5">
      <Link href="/quotations" className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-accent"><IconChevronLeft size={16} /> All quotations</Link>
      {query.created && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Quotation {quotation.quotationNumber} created as a draft.</p>}
      {query.updated && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Draft saved.</p>}

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent text-white"><IconQuote size={28} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-2xl font-bold text-ink">{quotation.quotationNumber}</h1>
                <QuotationStatusBadge status={quotation.status} />
                <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-ink-muted">Revision {quotation.currentRevisionNumber}</span>
                {validityPassed && <PastValidityBadge />}
              </div>
              <p className="mt-1 text-base text-ink">
                {can('customer.read') ? <Link href={`/customers/${quotation.customer.id}`} className="font-semibold hover:text-accent hover:underline">{quotation.customer.name}</Link> : <span className="font-semibold">{quotation.customer.name}</span>}
                <span className="text-ink-muted"> &middot; <span className="font-mono">{quotation.customer.customerCode}</span>{current && <> &middot; {formatDate(current.quotationDate)}</>}</span>
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {quotation.enquiry ? (
                  <>From enquiry {can('enquiry.read') ? <Link href={`/enquiries/${quotation.enquiry.id}`} className="font-mono text-ink hover:text-accent hover:underline">{quotation.enquiry.enquiryNumber}</Link> : <span className="font-mono text-ink">{quotation.enquiry.enquiryNumber}</span>}</>
                ) : (
                  'Manual quotation'
                )}
                {' '}&middot; Assigned to <span className="text-ink">{quotation.assignedTo?.fullName ?? 'nobody'}</span>
                {current?.validUntil && <> &middot; Valid until <span className={clsx(validityPassed ? 'font-semibold text-warning' : 'text-ink')}>{formatDate(current.validUntil)}</span></>}
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{money(quotation.currentTotal)}</p>
            </div>
          </div>
          <QuotationHeaderActions
            quotation={{
              id: quotation.id,
              quotationNumber: quotation.quotationNumber,
              status: quotation.status,
              currentRevisionNumber: quotation.currentRevisionNumber,
              approvalRequired: quotation.approvalRequired,
              validityPassed,
              deletable: quotation.revisions.length === 1 && current?.status === 'DRAFT' && !current.issuedAt && quotation.documents.length === 0,
            }}
            permissions={permissions}
          />
        </div>
      </section>

      {accepted && (
        <section className="card flex flex-wrap items-start gap-4 border-success/40 p-5">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success-subtle text-success"><IconInvoice size={22} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink">Accepted: revision {accepted.revisionNumber} &middot; {money(accepted.grandTotal)}</h2>
            <p className="text-sm text-ink-muted">
              The customer accepted revision {accepted.revisionNumber}. A proforma invoice is raised from this exact revision.
            </p>
            {quotation.proformaInvoices.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {quotation.proformaInvoices.map((p) => (
                  <li key={p.id}>
                    {can('proforma.read') ? (
                      <Link href={`/proforma-invoices/${p.id}`} className="font-mono font-semibold text-ink hover:text-accent hover:underline">{p.piNumber}</Link>
                    ) : (
                      <span className="font-mono font-semibold text-ink">{p.piNumber}</span>
                    )}
                    <span className="text-ink-muted"> &middot; {formatDate(p.piDate)} &middot; {money(p.grandTotal)} &middot; {p.status.toLowerCase().replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {can('proforma.create') && !quotation.proformaInvoices.some((p) => p.activeRevisionId) && (
            <Link href={`/proforma-invoices/new?quotationId=${quotation.id}`} className="btn-primary">
              <IconInvoice size={16} /> {quotation.proformaInvoices.length ? 'Raise replacement PI' : 'Create Proforma Invoice'}
            </Link>
          )}
        </section>
      )}

      <Tabs
        active={tab}
        tabs={[
          { key: 'overview', label: 'Overview', href: href('overview') },
          { key: 'products', label: 'Products', href: href('products'), count: current?.items.length ?? 0 },
          { key: 'revisions', label: 'Revisions', href: href('revisions'), count: quotation.revisions.length },
          { key: 'documents', label: 'Documents', href: href('documents'), count: uploads.length + quotation.revisions.filter((r) => r.pdfDocument).length },
          { key: 'communication', label: 'Communication', href: href('communication'), count: quotation.communications.length },
          { key: 'emails', label: 'Emails', href: href('emails') },
          { key: 'activity', label: 'Activity', href: href('activity') },
        ]}
      />

      {tab === 'overview' && current && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <section className="card p-5 xl:col-span-2">
              <h2 className="mb-4 text-lg font-semibold text-ink">Quotation information</h2>
              <DefinitionList
                items={[
                  { label: 'Quotation number', value: <span className="font-mono">{quotation.quotationNumber}</span> },
                  { label: 'Current revision', value: `Revision ${current.revisionNumber}${current.issuedAt ? ` · issued ${formatDateTime(current.issuedAt)}` : ' · not issued'}` },
                  { label: 'Quotation date', value: formatDate(current.quotationDate) },
                  { label: 'Valid until', value: current.validUntil && <span className={clsx(validityPassed && 'font-semibold text-warning')}>{formatDate(current.validUntil)}{validityPassed && ' (passed)'}</span> },
                  { label: 'Subject', value: quotation.subject },
                  { label: 'Customer reference', value: quotation.referenceNumber },
                  { label: 'Contact person', value: quotation.contact && `${quotation.contact.name}${quotation.contact.phone ? ` · ${formatPhone(quotation.contact.phone)}` : ''}` },
                  { label: 'Assigned employee', value: quotation.assignedTo?.fullName },
                  { label: 'Currency', value: quotation.currency },
                  { label: 'Approval', value: quotation.approvalRequired ? 'Required before sending' : 'Not required (switched off in Settings)' },
                ]}
              />
              <p className="mt-4 border-t border-border pt-3 text-sm text-ink-muted">
                Created {formatDateTime(quotation.createdAt)}{quotation.createdBy && ` by ${quotation.createdBy.fullName}`} &middot; Last updated {formatDateTime(quotation.updatedAt)}{quotation.updatedBy && ` by ${quotation.updatedBy.fullName}`}
              </p>
            </section>
            <PricingSummary revision={current} currency={quotation.currency} />
          </div>

          <CustomerSnapshotCard revision={current} />

          <section className="card p-5">
            <h2 className="mb-4 text-lg font-semibold text-ink">Terms</h2>
            <TermsBlock revision={current} />
            {current.internalRemarks && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Internal remarks (not printed)</p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink">{current.internalRemarks}</p>
              </div>
            )}
          </section>

          <StatusHistory quotation={quotation} />
        </div>
      )}

      {tab === 'products' && current && <ProductsTable revision={current} currency={quotation.currency} enquiryLinked={Boolean(quotation.enquiryId)} />}

      {tab === 'revisions' && <RevisionsTab quotation={quotation} canDownload={can('quotation.download')} from={query.from} to={query.to} />}

      {tab === 'documents' && (
        <div className="space-y-5">
          <section className="card">
            <PanelHeader title="Generated quotation PDFs" description="Stored when a revision is issued (marked as sent). They cannot be changed or removed." />
            {quotation.revisions.some((r) => r.pdfDocument) ? (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Document</th>
                      <th scope="col">Revision</th>
                      <th scope="col" className="text-right">Size</th>
                      <th scope="col">Generated</th>
                      <th scope="col" className="text-right">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotation.revisions.filter((r) => r.pdfDocument).map((r) => (
                      <tr key={r.id}>
                        <td className="min-w-[200px]">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent"><IconFile size={16} /></span>
                            <p className="truncate font-medium">{r.pdfDocument!.originalFilename}</p>
                          </div>
                        </td>
                        <td>Revision {r.revisionNumber}</td>
                        <td className="text-right tabular-nums">{formatBytes(r.pdfDocument!.sizeBytes)}</td>
                        <td className="whitespace-nowrap">{formatDateTime(r.pdfDocument!.createdAt)}</td>
                        <td>
                          <div className="flex items-center justify-end gap-2">
                            {can('quotation.download') ? (
                              <a href={`/quotations/${quotation.id}/revisions/${r.revisionNumber}/pdf`} className="icon-btn" aria-label={`Download revision ${r.revisionNumber} PDF`} title="Download"><IconDownload /></a>
                            ) : (
                              <span className="text-xs text-ink-subtle">No download permission</span>
                            )}
                            {can('quotation.send') && (
                              <QuotationEmailButton quotationId={quotation.id} quotationNumber={quotation.quotationNumber} revisionNumber={r.revisionNumber} />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyStateClient title="No issued PDFs yet" description="A PDF is stored for each revision when it is marked as sent. Drafts can be previewed with Draft PDF." />
            )}
          </section>
          <QuotationDocumentsPanel
            quotationId={quotation.id}
            documents={uploads}
            canManage={can('quotation.update')}
            canDownload={can('document.download')}
          />
        </div>
      )}

      {tab === 'communication' && (
        <QuotationCommunicationPanel
          quotationId={quotation.id}
          quotationNumber={quotation.quotationNumber}
          communications={quotation.communications}
          defaultContactName={quotation.contact?.name ?? current?.customerSnapshot.contactName ?? ''}
          canLog={can('quotation.send')}
        />
      )}

      {tab === 'emails' && <EmailHistory quotationId={quotation.id} />}

      {tab === 'activity' && <ActivityTab quotationId={quotation.id} page={query.page} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function PricingSummary({ revision, currency }: { revision: QuotationRevision; currency: string }) {
  const money = (value: string) => formatMoney(value, currency);
  const positive = (value: string) => Number(value) > 0;
  const row = (label: string, value: string, minus = false, indent = false) => (
    <div key={label} className={clsx('flex justify-between gap-4', indent && 'pl-3')}>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular-nums text-ink">{minus && positive(value) ? '- ' : ''}{money(value)}</dd>
    </div>
  );
  return (
    <section className="card p-5">
      <h2 className="mb-1 text-lg font-semibold text-ink">Pricing summary</h2>
      <p className="mb-4 text-xs text-ink-subtle">Revision {revision.revisionNumber}, as calculated by the server.</p>
      <dl className="space-y-1.5 text-sm">
        {row('Subtotal', revision.subtotal)}
        {row('Item discounts', revision.itemDiscountTotal, true)}
        {row('Taxable amount', revision.taxableAmount)}
        {(revision.taxBreakdown ?? []).map((g) => row(`${g.label} ${formatRate(g.rate)}% on ${money(g.taxable)}`, g.tax, false, true))}
        {row('Tax total', revision.taxTotal)}
        {positive(revision.otherCharges) && row(revision.otherChargesLabel || 'Other charges', revision.otherCharges)}
        {positive(revision.additionalDiscount) && row('Additional discount (after tax)', revision.additionalDiscount, true)}
        <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
          <dt className="text-ink">Grand total</dt>
          <dd className="tabular-nums text-ink">{money(revision.grandTotal)}</dd>
        </div>
      </dl>
    </section>
  );
}

function AddressLines({ title, address }: { title: string; address: QuotationAddressSnapshot | null }) {
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

function CustomerSnapshotCard({ revision }: { revision: QuotationRevision }) {
  const s = revision.customerSnapshot;
  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-ink">Customer details on this quotation</h2>
      <p className="mb-4 text-xs text-ink-subtle">
        {revision.issuedAt ? `Frozen when revision ${revision.revisionNumber} was issued.` : `Taken from Customer Management; refreshed each time the draft is saved and frozen when it is issued.`}
      </p>
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface-muted p-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Customer</p>
          <p className="mt-1 font-semibold text-ink">{s.name}</p>
          <p className="text-sm text-ink-muted"><span className="font-mono">{s.customerCode}</span> &middot; {CUSTOMER_TYPE_LABELS[s.customerType]}</p>
          {(s.gstin || s.pan || s.taxRegistrationNumber) && (
            <p className="mt-1 text-xs text-ink-muted">
              {s.gstin && <>GSTIN <span className="font-mono text-ink">{s.gstin}</span> </>}
              {s.pan && <>PAN <span className="font-mono text-ink">{s.pan}</span> </>}
              {s.taxRegistrationNumber && <>Tax reg. <span className="font-mono text-ink">{s.taxRegistrationNumber}</span></>}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Contact</p>
          {s.contactName ? (
            <div className="mt-1 text-sm text-ink">
              <p>{s.contactName}{s.contactDesignation && <span className="text-ink-muted">, {s.contactDesignation}</span>}</p>
              {s.phone && <p className="text-ink-muted">{formatPhone(s.phone)}</p>}
              {s.email && <p className="truncate text-ink-muted">{s.email}</p>}
            </div>
          ) : (
            <p className="mt-1 text-sm text-ink-subtle">Not provided</p>
          )}
        </div>
        <AddressLines title="Billing address" address={s.billingAddress} />
        <AddressLines title="Shipping address" address={s.shippingAddress} />
      </div>
    </section>
  );
}

function TermsBlock({ revision }: { revision: QuotationRevision }) {
  const entries = [
    ['Terms and conditions', revision.termsAndConditions],
    ['Payment terms', revision.paymentTerms],
    ['Delivery terms', revision.deliveryTerms],
    ['Warranty terms', revision.warrantyTerms],
    ['Notes', revision.notes],
  ].filter((e): e is [string, string] => Boolean(e[1]));
  if (entries.length === 0) return <p className="text-sm text-ink-subtle">No terms were entered on this revision.</p>;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {entries.map(([label, value]) => (
        <div key={label} className={label === 'Terms and conditions' ? 'md:col-span-2' : undefined}>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
          <p className="mt-1 whitespace-pre-line text-sm text-ink">{value}</p>
        </div>
      ))}
    </div>
  );
}

function StatusHistory({ quotation }: { quotation: QuotationDetail }) {
  return (
    <section className="card">
      <PanelHeader title="Status history" description="Every step of every revision with its remarks, newest first." />
      {quotation.statusHistory.length === 0 ? (
        <EmptyStateClient title="No status changes" description="Status changes will appear here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Changed</th>
                <th scope="col">Revision</th>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">Remarks</th>
                <th scope="col">By</th>
              </tr>
            </thead>
            <tbody>
              {quotation.statusHistory.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap">{formatDateTime(h.changedAt)}</td>
                  <td>R{h.revision.revisionNumber}</td>
                  <td>{h.previousStatus ? QUOTATION_STATUS_LABELS[h.previousStatus] : <span className="text-ink-subtle">&mdash;</span>}</td>
                  <td><QuotationStatusBadge status={h.newStatus} /></td>
                  <td className="max-w-[360px] whitespace-pre-line text-sm text-ink-muted">{h.remarks ?? '—'}</td>
                  <td className="whitespace-nowrap">{h.changedBy?.fullName ?? 'System'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProductsTable({ revision, currency, enquiryLinked }: { revision: QuotationRevision; currency: string; enquiryLinked: boolean }) {
  const money = (value: string) => formatMoney(value, currency);
  return (
    <div className="space-y-5">
      <section className="card">
        <PanelHeader
          title={`Products · revision ${revision.revisionNumber}`}
          description={revision.status === 'DRAFT' ? 'Draft: change items with Edit draft.' : 'Issued revisions are frozen; changes need a new revision.'}
        />
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col" className="w-10">#</th>
                <th scope="col">Product</th>
                <th scope="col">Model</th>
                <th scope="col">Description</th>
                <th scope="col" className="text-right">Quantity</th>
                <th scope="col" className="text-right">Unit Price</th>
                <th scope="col" className="text-right">Discount</th>
                <th scope="col" className="text-right">Tax</th>
                <th scope="col" className="text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {revision.items.map((item, index) => {
                const specs = specificationList(item.specifications);
                return (
                  <tr key={item.id}>
                    <td className="tabular-nums text-ink-subtle">{index + 1}</td>
                    <td className="min-w-[180px]">
                      <p className="font-semibold">{item.productName}</p>
                      <p className="text-xs text-ink-muted"><span className="font-mono">{item.productCode}</span> &middot; {item.brandName}</p>
                      {enquiryLinked && <p className="text-xs text-ink-subtle">{item.enquiryItemId ? 'From enquiry requirement' : 'Added on the quotation'}</p>}
                    </td>
                    <td className="min-w-[150px]">
                      {item.modelName ? (
                        <>
                          <p>{item.modelName} {item.modelNumber && <span className="font-mono text-xs text-ink-muted">{item.modelNumber}</span>}</p>
                          {specs.length > 0 && <p className="mt-0.5 text-xs text-ink-subtle">{specs.map((s) => `${s.name}: ${s.value}`).join(' · ')}</p>}
                        </>
                      ) : (
                        <span className="text-ink-subtle">Not specified</span>
                      )}
                    </td>
                    <td className="max-w-[280px] text-sm text-ink-muted">
                      <p className="whitespace-pre-line">{item.description ?? '—'}</p>
                      {item.remarks && <p className="mt-1 text-xs">Remarks: {item.remarks}</p>}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{item.quantity} {item.unit}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{money(item.unitPrice)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {item.discountType === 'NONE' ? (
                        <span className="text-ink-subtle">&mdash;</span>
                      ) : (
                        <>
                          {money(item.discountAmount)}
                          <p className="text-xs text-ink-subtle">{item.discountType === 'PERCENT' ? `${formatRate(item.discountValue)}%` : DISCOUNT_TYPE_LABELS.AMOUNT}</p>
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {Number(item.taxRate) === 0 ? (
                        <span className="text-ink-subtle">&mdash;</span>
                      ) : (
                        <>
                          {money(item.taxAmount)}
                          <p className="text-xs text-ink-subtle">{item.taxLabel ?? 'Tax'} {formatRate(item.taxRate)}%</p>
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(item.lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid grid-cols-1 xl:grid-cols-3">
        <div className="xl:col-start-3"><PricingSummary revision={revision} currency={currency} /></div>
      </div>
    </div>
  );
}

async function RevisionsTab({ quotation, canDownload, from, to }: { quotation: QuotationDetail; canDownload: boolean; from?: string; to?: string }) {
  const numbers = quotation.revisions.map((r) => r.revisionNumber);
  const fromN = Number(from);
  const toN = Number(to);
  const comparing = numbers.includes(fromN) && numbers.includes(toN) && fromN !== toN;
  let compare: QuotationCompareResult | null = null;
  let compareError: string | null = null;
  if (comparing) {
    try {
      compare = await apiFetch<QuotationCompareResult>(`/quotations/${quotation.id}/compare${queryString({ from: fromN, to: toN })}`);
    } catch (error) {
      compareError = error instanceof ApiError ? error.messages[0] : 'The comparison could not be loaded.';
    }
  }
  const money = (value: string) => formatMoney(value, quotation.currency);
  const show = (value: string | null) => (value === null || value === '' ? <span className="text-ink-subtle">empty</span> : <span className="whitespace-pre-line">{value}</span>);

  return (
    <div className="space-y-5">
      <section className="card">
        <PanelHeader title="Revisions" description="Every revision is kept exactly as it was. Only the current revision can change status." />
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Revision</th>
                <th scope="col">Status</th>
                <th scope="col">Quotation Date</th>
                <th scope="col">Valid Until</th>
                <th scope="col" className="text-right">Items</th>
                <th scope="col" className="text-right">Grand Total</th>
                <th scope="col">Created</th>
                <th scope="col">Issued</th>
                <th scope="col" className="text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {quotation.revisions.map((r, index) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap font-semibold">
                    R{r.revisionNumber}
                    {index === 0 && <span className="ml-2 rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">Current</span>}
                    {r.id === quotation.acceptedRevisionId && <span className="ml-2 rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">Accepted</span>}
                  </td>
                  <td><QuotationStatusBadge status={r.status} /></td>
                  <td className="whitespace-nowrap">{formatDate(r.quotationDate)}</td>
                  <td className="whitespace-nowrap">{r.validUntil ? formatDate(r.validUntil) : <span className="text-ink-subtle">&mdash;</span>}</td>
                  <td className="text-right tabular-nums">{r.items.length}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{money(r.grandTotal)}</td>
                  <td className="whitespace-nowrap">{formatDateTime(r.createdAt)}{r.createdBy && <p className="text-xs text-ink-subtle">by {r.createdBy.fullName}</p>}</td>
                  <td className="whitespace-nowrap">{r.issuedAt ? formatDateTime(r.issuedAt) : <span className="text-ink-subtle">Not issued</span>}</td>
                  <td>
                    <div className="flex justify-end">
                      {canDownload ? (
                        <a href={`/quotations/${quotation.id}/revisions/${r.revisionNumber}/pdf`} className="icon-btn" aria-label={`Download revision ${r.revisionNumber} PDF`} title={r.issuedAt ? 'Download PDF' : 'Download draft preview'}><IconDownload /></a>
                      ) : (
                        <span className="text-xs text-ink-subtle">&mdash;</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <PanelHeader title="Compare revisions" description="Item and header differences between two revisions, as stored." />
        <div className="p-5">
          {numbers.length < 2 ? (
            <p className="text-sm text-ink-muted">There is only one revision, so there is nothing to compare yet.</p>
          ) : (
            <form method="get" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="tab" value="revisions" />
              <div>
                <label htmlFor="cmp-from" className="field-label">From</label>
                <select id="cmp-from" name="from" defaultValue={comparing ? fromN : numbers[1]} className="field-input h-10 w-auto">
                  {numbers.map((n) => <option key={n} value={n}>Revision {n}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="cmp-to" className="field-label">To</label>
                <select id="cmp-to" name="to" defaultValue={comparing ? toN : numbers[0]} className="field-input h-10 w-auto">
                  {numbers.map((n) => <option key={n} value={n}>Revision {n}</option>)}
                </select>
              </div>
              <button type="submit" className="btn-primary h-10">Compare</button>
              {from && to && !comparing && <p className="text-sm text-danger">Choose two different revisions.</p>}
            </form>
          )}

          {compareError && <div className="mt-4"><ErrorState title="Could not compare" message={compareError} /></div>}
          {compare && (
            <div className="mt-5 space-y-5">
              <p className="text-sm text-ink-muted">
                Revision {compare.from.revisionNumber} ({QUOTATION_STATUS_LABELS[compare.from.status]}) → revision {compare.to.revisionNumber} ({QUOTATION_STATUS_LABELS[compare.to.status]})
              </p>
              {compare.items.length === 0 && compare.header.length === 0 && <p className="text-sm text-ink">No differences.</p>}
              {compare.items.length > 0 && (
                <div>
                  <h3 className="mb-2 text-base font-semibold text-ink">Items</h3>
                  <ul className="space-y-2">
                    {compare.items.map((c, index) => (
                      <li key={`${c.change}-${c.item}-${index}`} className={clsx('rounded-lg border px-3 py-2 text-sm', c.change === 'added' ? 'border-success/30 bg-success-subtle' : c.change === 'removed' ? 'border-danger/30 bg-danger-subtle' : 'border-warning/30 bg-warning-subtle')}>
                        <p className="font-semibold text-ink">
                          <span className={clsx('mr-2 text-xs uppercase', c.change === 'added' ? 'text-success' : c.change === 'removed' ? 'text-danger' : 'text-warning')}>{c.change}</span>
                          {c.item}
                        </p>
                        {c.fields.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-ink-muted">
                            {c.fields.map((f) => (
                              <li key={f.field}>{COMPARE_FIELD_LABELS[f.field] ?? f.field}: {show(f.from)} → <span className="text-ink">{show(f.to)}</span></li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {compare.header.length > 0 && (
                <div>
                  <h3 className="mb-2 text-base font-semibold text-ink">Header, totals and terms</h3>
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">Field</th>
                          <th scope="col">Revision {compare.from.revisionNumber}</th>
                          <th scope="col">Revision {compare.to.revisionNumber}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compare.header.map((f) => (
                          <tr key={f.field}>
                            <td className="whitespace-nowrap font-medium">{COMPARE_FIELD_LABELS[f.field] ?? f.field}</td>
                            <td className="max-w-[360px] text-sm text-ink-muted">{show(f.from)}</td>
                            <td className="max-w-[360px] text-sm text-ink">{show(f.to)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <StatusHistory quotation={quotation} />
    </div>
  );
}

async function ActivityTab({ quotationId, page }: { quotationId: string; page?: string }) {
  let data: PaginatedResponse<ActivityEntry>;
  try {
    data = await apiFetch<PaginatedResponse<ActivityEntry>>(`/quotations/${quotationId}/activity${queryString({ page: page ?? '1', pageSize: 20 })}`);
  } catch (error) {
    return <ErrorState title="Could not load activity" message={error instanceof ApiError ? error.messages[0] : 'The server could not be reached.'} />;
  }
  return (
    <section className="card">
      <PanelHeader title="Activity history" description="From the audit log: the quotation, its revisions, status changes, communication and documents." />
      {data.items.length === 0 ? (
        <EmptyStateClient title="No activity recorded" description="Changes to this quotation will appear here." />
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
          <Pagination meta={data.meta} basePath={`/quotations/${quotationId}`} params={{ tab: 'activity' }} noun="events" />
        </>
      )}
    </section>
  );
}
