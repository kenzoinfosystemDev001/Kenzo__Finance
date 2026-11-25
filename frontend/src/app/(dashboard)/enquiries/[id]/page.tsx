import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import clsx from 'clsx';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { ActivityEntry, EnquiryAssignee, EnquiryDetail, PaginatedResponse, QuotationListItem } from '@/lib/types';
import { CUSTOMER_TYPE_LABELS } from '@/lib/customer-labels';
import { ENQUIRY_STATUS_LABELS, formatBudget, isFollowUpOverdue } from '@/lib/enquiry-labels';
import { activityLabel, formatDate, formatDateTime, formatPhone, BUSINESS_TIME_ZONE } from '@/lib/vendor-labels';
import { DefinitionList, ErrorState, Pagination, Tabs, VendorStatusBadge } from '@/components/ui';
import { EmptyStateClient } from '@/components/panel-shared';
import { EnquiryPriorityBadge, EnquiryStatusBadge } from '@/components/enquiry-badges';
import { PastValidityBadge, QuotationStatusBadge } from '@/components/quotation-badges';
import { formatMoney } from '@/lib/quotation-labels';
import { CustomerSummaryCard } from '@/components/enquiry-form';
import { IconChevronLeft, IconInbox } from '@/components/icons';
import { EnquiryAttachmentsPanel, EnquiryFollowUpsPanel, EnquiryHeaderActions, EnquiryItemsPanel } from './enquiry-panels';

const TABS = ['overview', 'customer', 'products', 'followups', 'attachments', 'status', 'activity', 'quotations'] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const enquiry = await apiFetch<EnquiryDetail>(`/enquiries/${id}`).catch(() => null);
  return { title: enquiry?.enquiryNumber ?? 'Enquiry' };
}

export default async function EnquiryProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string; created?: string; updated?: string; attachmentsFailed?: string; add?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);

  let enquiry: EnquiryDetail;
  try {
    enquiry = await apiFetch<EnquiryDetail>(`/enquiries/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
  const assignees = await apiFetch<EnquiryAssignee[]>('/enquiries/assignees').catch(() => [] as EnquiryAssignee[]);

  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : 'overview';
  const href = (t: Tab) => `/enquiries/${enquiry.id}${t === 'overview' ? '' : `?tab=${t}`}`;
  const contact = enquiry.customerContact ?? enquiry.customer.contacts.find((c) => c.isPrimary) ?? null;
  const overdue = isFollowUpOverdue(enquiry.nextFollowUpDate, enquiry.status);
  const failedUploads = Number(query.attachmentsFailed ?? 0);

  return (
    <div className="space-y-5">
      <Link href="/enquiries" className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-accent"><IconChevronLeft size={16} /> All enquiries</Link>
      {query.created && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Enquiry {enquiry.enquiryNumber} created. Record follow-ups and attachments below.</p>}
      {failedUploads > 0 && (
        <p role="alert" className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-2.5 text-sm text-warning">
          {failedUploads} attachment{failedUploads === 1 ? '' : 's'} could not be uploaded. Upload {failedUploads === 1 ? 'it' : 'them'} again from the Attachments tab.
        </p>
      )}
      {query.updated && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Changes saved.</p>}

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent text-white"><IconInbox size={28} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-2xl font-bold text-ink">{enquiry.enquiryNumber}</h1>
                <EnquiryStatusBadge status={enquiry.status} />
                <EnquiryPriorityBadge priority={enquiry.priority} />
              </div>
              <p className="mt-1 text-base text-ink">
                {can('customer.read') ? <Link href={`/customers/${enquiry.customer.id}`} className="font-semibold hover:text-accent hover:underline">{enquiry.customer.name}</Link> : <span className="font-semibold">{enquiry.customer.name}</span>}
                <span className="text-ink-muted"> &middot; <span className="font-mono">{enquiry.customer.customerCode}</span> &middot; {formatDate(enquiry.enquiryDate)}</span>
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Assigned to <span className="text-ink">{enquiry.assignedTo?.fullName ?? 'nobody yet'}</span>
                {' '}&middot; Next follow-up{' '}
                <span className={clsx(overdue ? 'font-semibold text-danger' : 'text-ink')}>
                  {enquiry.nextFollowUpDate ? `${formatDate(enquiry.nextFollowUpDate)}${overdue ? ' (overdue)' : ''}` : 'not planned'}
                </span>
              </p>
            </div>
          </div>
          <EnquiryHeaderActions
            enquiry={{ id: enquiry.id, enquiryNumber: enquiry.enquiryNumber, status: enquiry.status, customerId: enquiry.customerId, assignedToId: enquiry.assignedToId }}
            permissions={permissions}
            assignees={assignees}
          />
        </div>
      </section>

      <Tabs
        active={tab}
        tabs={[
          { key: 'overview', label: 'Overview', href: href('overview') },
          { key: 'customer', label: 'Customer Details', href: href('customer') },
          { key: 'products', label: 'Products & Requirements', href: href('products'), count: enquiry.items.length },
          { key: 'followups', label: 'Follow-up History', href: href('followups'), count: enquiry.followUps.length },
          { key: 'attachments', label: 'Attachments', href: href('attachments'), count: enquiry.documents.length },
          { key: 'status', label: 'Status History', href: href('status'), count: enquiry.statusHistory.length },
          { key: 'activity', label: 'Activity History', href: href('activity') },
          { key: 'quotations', label: 'Quotation History', href: href('quotations') },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <section className="card p-5 xl:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-ink">Enquiry information</h2>
            <DefinitionList
              items={[
                { label: 'Enquiry ID', value: <span className="font-mono">{enquiry.enquiryNumber}</span> },
                { label: 'Enquiry date', value: formatDate(enquiry.enquiryDate) },
                { label: 'Status', value: <EnquiryStatusBadge status={enquiry.status} /> },
                { label: 'Priority', value: <EnquiryPriorityBadge priority={enquiry.priority} /> },
                { label: 'Source', value: enquiry.source?.name },
                { label: 'Assigned employee', value: enquiry.assignedTo?.fullName },
                { label: 'Contact person', value: contact && `${contact.name}${contact.phone ? ` · ${formatPhone(contact.phone)}` : ''}` },
                { label: 'Expected decision date', value: enquiry.expectedDecisionDate && formatDate(enquiry.expectedDecisionDate) },
                {
                  label: 'Next follow-up',
                  value: enquiry.nextFollowUpDate && <span className={clsx(overdue && 'font-semibold text-danger')}>{formatDate(enquiry.nextFollowUpDate)}{overdue && ' (overdue)'}</span>,
                },
                { label: 'Products', value: `${enquiry.items.length} requirement${enquiry.items.length === 1 ? '' : 's'}` },
              ]}
            />
            {enquiry.description && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Description</p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink">{enquiry.description}</p>
              </div>
            )}
            {enquiry.internalRemarks && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Internal remarks</p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink">{enquiry.internalRemarks}</p>
              </div>
            )}
          </section>
          <div className="space-y-5">
            <section className="card p-5">
              <h2 className="text-lg font-semibold text-ink">Commercial expectations</h2>
              <p className="mb-4 text-xs text-ink-subtle">Preliminary only &mdash; not a price or a quotation.</p>
              <DefinitionList
                items={[
                  { label: 'Expected budget', value: formatBudget(enquiry.expectedBudget, enquiry.currency) },
                  { label: 'Currency', value: enquiry.currency },
                  { label: 'Delivery timeline', value: enquiry.expectedDeliveryTimeline },
                  { label: 'Payment preference', value: enquiry.paymentPreference },
                ]}
              />
              {enquiry.commercialNotes && <p className="mt-4 whitespace-pre-line border-t border-border pt-3 text-sm text-ink">{enquiry.commercialNotes}</p>}
            </section>
            <section className="card p-5 text-sm">
              <h2 className="mb-3 text-base font-semibold text-ink">Record</h2>
              <p className="text-ink-muted">Created {formatDateTime(enquiry.createdAt)}{enquiry.createdBy && ` by ${enquiry.createdBy.fullName}`}</p>
              <p className="text-ink-muted">Last updated {formatDateTime(enquiry.updatedAt)}{enquiry.updatedBy && ` by ${enquiry.updatedBy.fullName}`}</p>
              {enquiry.convertedAt && (
                <p className="text-ink-muted">Converted {formatDateTime(enquiry.convertedAt)}{enquiry.convertedBy && ` by ${enquiry.convertedBy.fullName}`}</p>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === 'customer' && (
        <section className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{enquiry.customer.name}</h2>
              <VendorStatusBadge status={enquiry.customer.status} />
            </div>
            {can('customer.read') && <Link href={`/customers/${enquiry.customer.id}`} className="btn-secondary">View Customer Profile</Link>}
          </div>
          <CustomerSummaryCard customer={enquiry.customer} />
          <DefinitionList
            items={[
              { label: 'Customer type', value: CUSTOMER_TYPE_LABELS[enquiry.customer.customerType] },
              { label: 'Category', value: enquiry.customer.category?.name },
              { label: 'Industry', value: enquiry.customer.industry },
              { label: 'GSTIN', value: enquiry.customer.gstin && <span className="font-mono">{enquiry.customer.gstin}</span> },
              { label: 'Contact for this enquiry', value: enquiry.customerContact && `${enquiry.customerContact.name}${enquiry.customerContact.designation ? `, ${enquiry.customerContact.designation}` : ''}` },
              { label: 'Contact phone / email', value: enquiry.customerContact && [formatPhone(enquiry.customerContact.phone), enquiry.customerContact.email].filter(Boolean).join(' · ') },
            ]}
          />
        </section>
      )}

      {tab === 'products' && (
        <EnquiryItemsPanel enquiry={enquiry} canManage={can('enquiry.update')} canViewProducts={can('product.read')} canCreateProduct={can('product.create')} />
      )}
      {tab === 'followups' && (
        <EnquiryFollowUpsPanel
          enquiry={enquiry}
          assignees={assignees}
          canManage={can('enquiry.manage_follow_ups')}
          canDelete={can('enquiry.delete')}
          autoOpen={query.add === '1'}
        />
      )}
      {tab === 'attachments' && (
        <EnquiryAttachmentsPanel enquiry={enquiry} canUpload={can('enquiry.upload_attachments')} canRemove={can('enquiry.delete_attachments')} canDownload={can('document.download')} />
      )}
      {tab === 'status' && (
        <section className="card">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-lg font-semibold text-ink">Status history</h2>
            <p className="text-sm text-ink-muted">Every status change with its reason, newest first.</p>
          </div>
          {enquiry.statusHistory.length === 0 ? (
            <EmptyStateClient title="No status changes" description="Status changes will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Changed</th>
                    <th scope="col">From</th>
                    <th scope="col">To</th>
                    <th scope="col">Reason</th>
                    <th scope="col">By</th>
                  </tr>
                </thead>
                <tbody>
                  {enquiry.statusHistory.map((h) => (
                    <tr key={h.id}>
                      <td className="whitespace-nowrap">{formatDateTime(h.changedAt)}</td>
                      <td>{h.previousStatus ? ENQUIRY_STATUS_LABELS[h.previousStatus] : <span className="text-ink-subtle">&mdash;</span>}</td>
                      <td><EnquiryStatusBadge status={h.newStatus} /></td>
                      <td className="max-w-[360px] text-sm text-ink-muted">{h.reason ?? '—'}</td>
                      <td className="whitespace-nowrap">{h.changedBy?.fullName ?? 'System'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {tab === 'activity' && <ActivityTab enquiryId={enquiry.id} page={query.page} />}
      {tab === 'quotations' && (
        <QuotationHistoryTab
          enquiry={enquiry}
          canReadQuotations={can('quotation.read')}
        />
      )}
    </div>
  );
}

async function ActivityTab({ enquiryId, page }: { enquiryId: string; page?: string }) {
  let data: PaginatedResponse<ActivityEntry>;
  try {
    data = await apiFetch<PaginatedResponse<ActivityEntry>>(`/enquiries/${enquiryId}/activity${queryString({ page: page ?? '1', pageSize: 20 })}`);
  } catch (error) {
    return <ErrorState title="Could not load activity" message={error instanceof ApiError ? error.messages[0] : 'The server could not be reached.'} />;
  }
  return (
    <section className="card">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-lg font-semibold text-ink">Activity history</h2>
        <p className="text-sm text-ink-muted">From the audit log &mdash; the enquiry, its product requirements and follow-ups.</p>
      </div>
      {data.items.length === 0 ? (
        <EmptyStateClient title="No activity recorded" description="Changes to this enquiry will appear here." />
      ) : (
        <>
          <ol className="divide-y divide-border">
            {data.items.map((entry) => (
              <li key={entry.id} className="flex gap-4 px-5 py-3.5">
                <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">{activityLabel(entry.action)}</p>
                    <time dateTime={entry.createdAt} className="text-xs text-ink-subtle">{formatDate(entry.createdAt)} &middot; {new Date(entry.createdAt).toLocaleTimeString('en-IN', { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                  {entry.summary && <p className="text-sm text-ink-muted">{entry.summary}</p>}
                  <p className="text-xs text-ink-subtle">by {entry.actor?.fullName ?? 'System'}</p>
                </div>
              </li>
            ))}
          </ol>
          <Pagination meta={data.meta} basePath={`/enquiries/${enquiryId}`} params={{ tab: 'activity' }} noun="events" />
        </>
      )}
    </section>
  );
}

/** Quotations created from this enquiry (Quotation Management), with the conversion record. */
async function QuotationHistoryTab({ enquiry, canReadQuotations }: { enquiry: EnquiryDetail; canReadQuotations: boolean }) {
  let quotations: PaginatedResponse<QuotationListItem> | null = null;
  let error: string | null = null;
  if (canReadQuotations) {
    try {
      quotations = await apiFetch<PaginatedResponse<QuotationListItem>>(`/quotations${queryString({ enquiryId: enquiry.id, pageSize: 50 })}`);
    } catch (cause) {
      error = cause instanceof ApiError ? cause.messages[0] : 'The server could not be reached.';
    }
  }
  return (
    <section className="card">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-lg font-semibold text-ink">Quotation history</h2>
        <p className="text-sm text-ink-muted">Quotations created from this enquiry in Quotation Management. Later changes are revisions of the same quotation.</p>
      </div>
      {enquiry.convertedAt && (
        <div className="border-b border-border p-5">
          <DefinitionList
            items={[
              { label: 'Converted on', value: formatDateTime(enquiry.convertedAt) },
              { label: 'Quotation reference', value: enquiry.convertedReference && <span className="font-mono">{enquiry.convertedReference}</span> },
              { label: 'Converted by', value: enquiry.convertedBy?.fullName },
            ]}
          />
        </div>
      )}
      {!canReadQuotations ? (
        !enquiry.convertedAt && <EmptyStateClient title="No quotations yet" description="When a quotation is created from this enquiry, it will be linked here." />
      ) : error ? (
        <div className="p-5"><ErrorState title="Could not load quotations" message={error} /></div>
      ) : !quotations || quotations.items.length === 0 ? (
        <EmptyStateClient title="No quotations yet" description="When a quotation is created from this enquiry, it will be listed here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Quotation No.</th>
                <th scope="col">Date</th>
                <th scope="col" className="text-right">Revision</th>
                <th scope="col" className="text-right">Grand Total</th>
                <th scope="col">Valid Until</th>
                <th scope="col">Status</th>
                <th scope="col">Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {quotations.items.map((q) => (
                <tr key={q.id}>
                  <td className="whitespace-nowrap">
                    <Link href={`/quotations/${q.id}`} className="font-mono text-sm font-semibold text-ink hover:text-accent hover:underline">{q.quotationNumber}</Link>
                  </td>
                  <td className="whitespace-nowrap">{q.quotationDate ? formatDate(q.quotationDate) : '—'}</td>
                  <td className="text-right tabular-nums">R{q.currentRevisionNumber}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(q.currentTotal, q.currency)}</td>
                  <td className="whitespace-nowrap">
                    {q.validUntil ? formatDate(q.validUntil) : '—'}
                    {q.pastValidity && <div className="mt-0.5"><PastValidityBadge /></div>}
                  </td>
                  <td><QuotationStatusBadge status={q.status} /></td>
                  <td className="whitespace-nowrap">{q.assignedTo?.fullName ?? <span className="text-ink-subtle">Unassigned</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
