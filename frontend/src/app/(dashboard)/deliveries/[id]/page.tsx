import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { ActivityEntry, DeliveryDetail, PaginatedResponse, ProofOfDeliveryRecord } from '@/lib/types';
import { CONFIRMED_STATES, DELIVERY_STATUS_LABELS, deliveryActivityLabel, TRANSPORT_MODE_LABELS } from '@/lib/delivery-labels';
import { todayIso } from '@/lib/enquiry-labels';
import { activityLabel, formatBytes, formatDate, formatDateTime } from '@/lib/vendor-labels';
import { DefinitionList, ErrorState, Pagination, SectionCard, Tabs } from '@/components/ui';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';
import { DelayedBadge, DeliveryStatusBadge } from '@/components/delivery-badges';
import { FinalInvoiceStatusBadge } from '@/components/final-invoice-badges';
import { Pill } from '@/components/enquiry-badges';
import { IconChevronLeft, IconDownload, IconEye, IconTruck } from '@/components/icons';
import { DeliveryDocumentsPanel, DeliveryHeaderActions } from './delivery-panels';

const TABS = ['overview', 'items', 'packages', 'tracking', 'pod', 'documents', 'activity'] as const;
type Tab = (typeof TABS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const d = UUID.test(id) ? await apiFetch<DeliveryDetail>(`/deliveries/${id}`).catch(() => null) : null;
  return { title: d ? `Delivery ${d.deliveryNumber}` : 'Delivery' };
}

/** The proof that is in force: the record no later amendment points at. */
function currentProof(proofs: ProofOfDeliveryRecord[]): ProofOfDeliveryRecord | null {
  const amended = new Set(proofs.map((p) => p.amendsId).filter(Boolean));
  const open = proofs.filter((p) => !amended.has(p.id));
  return open.length ? open[open.length - 1] : null;
}

export default async function DeliveryProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string; created?: string; saved?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);
  if (!can('delivery.read')) return <ErrorState title="Not allowed" message="You do not have permission to view deliveries." />;

  let d: DeliveryDetail;
  try {
    d = await apiFetch<DeliveryDetail>(`/deliveries/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    const apiError = error instanceof ApiError ? error : null;
    return <ErrorState title="Could not load delivery" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />;
  }

  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : 'overview';
  const href = (t: Tab) => `/deliveries/${d.id}${t === 'overview' ? '' : `?tab=${t}`}`;
  const confirmed = CONFIRMED_STATES.includes(d.status);
  const pod = currentProof(d.proofsOfDelivery);
  const hasDispatchDocuments = Boolean(d.challanDocumentId || d.packingDocumentId);
  const totalDelivered = confirmed ? d.items.reduce((s, i) => s + (i.deliveredQuantity ?? 0), 0) : null;
  const carrier = d.courierCompany ?? d.transporterName;
  const today = todayIso();

  return (
    <div className="space-y-5">
      <Link href="/deliveries" className="link-pill-neutral text-sm"><IconChevronLeft size={16} /> All deliveries</Link>
      {query.created && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Draft delivery created. Its quantities are now reserved against the invoice. Schedule it when the date is known.</p>}
      {query.saved && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Delivery saved.</p>}
      {d.status === 'CANCELLED' && (
        <p role="status" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-2.5 text-sm text-danger">
          Cancelled{d.cancelledAt ? ` ${formatDateTime(d.cancelledAt)}` : ''}{d.cancellationReason ? ` — ${d.cancellationReason}` : ''}. Its quantities were released to the invoice.
        </p>
      )}
      {d.status === 'DELIVERY_FAILED' && (
        <p role="status" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-2.5 text-sm text-danger">
          Delivery failed{d.failureDate ? ` on ${formatDate(d.failureDate)}` : ''}{d.failureReason ? ` — ${d.failureReason}` : ''}.
          {d.nextAttemptDate && <> Next attempt planned for {formatDate(d.nextAttemptDate)}.</>} Reschedule it or mark the goods returned.
        </p>
      )}
      {d.status === 'RETURNED' && (
        <p role="status" className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-2.5 text-sm text-warning">
          Goods returned{d.returnReason ? ` — ${d.returnReason}` : ''}. Their quantities were released; create a redelivery to send them again.
        </p>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent text-white"><IconTruck size={28} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-2xl font-bold text-ink">{d.deliveryNumber}</h1>
                <DeliveryStatusBadge status={d.status} />
                {d.delayed && <DelayedBadge />}
              </div>
              <p className="mt-1 text-base text-ink">
                {can('customer.read') ? <Link href={`/customers/${d.customer.id}`} className="link-pill font-semibold">{d.customer.name}</Link> : <span className="font-semibold">{d.customer.name}</span>}
                <span className="text-ink-muted"> &middot; <span className="font-mono">{d.customer.customerCode}</span></span>
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Invoice{' '}
                {can('invoice.read') ? <Link href={`/final-invoices/${d.finalInvoice.id}`} className="link-pill font-mono">{d.finalInvoice.invoiceNumber ?? 'draft'}</Link> : <span className="font-mono text-ink">{d.finalInvoice.invoiceNumber ?? 'draft'}</span>}
                {' '}&middot; Delivery date {formatDate(d.deliveryDate)}
                {d.expectedDate && <> &middot; Expected <span className={d.delayed ? 'font-semibold text-danger' : 'text-ink'}>{formatDate(d.expectedDate)}</span></>}
                {d.actualDeliveryDate && <> &middot; Received {formatDate(d.actualDeliveryDate)}</>}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {d.totalQuantity} unit{d.totalQuantity === 1 ? '' : 's'} on this delivery
                {totalDelivered !== null && <> &middot; <span className="text-ink">{totalDelivered} confirmed received</span></>}
              </p>
              {d.redeliveryOf && <p className="mt-1 text-sm text-ink-muted">Redelivery of <Link href={`/deliveries/${d.redeliveryOf.id}`} className="link-pill-on-tint font-mono">{d.redeliveryOf.deliveryNumber}</Link> ({DELIVERY_STATUS_LABELS[d.redeliveryOf.status]})</p>}
              {d.redeliveries.length > 0 && (
                <p className="mt-1 text-sm text-ink-muted">
                  Redelivered as{' '}
                  {d.redeliveries.map((r, i) => (
                    <span key={r.id}>{i > 0 && ', '}<Link href={`/deliveries/${r.id}`} className="link-pill-on-tint font-mono">{r.deliveryNumber}</Link> ({DELIVERY_STATUS_LABELS[r.status]})</span>
                  ))}
                </p>
              )}
            </div>
          </div>
          <DeliveryHeaderActions
            permissions={permissions}
            today={today}
            delivery={{
              id: d.id,
              deliveryNumber: d.deliveryNumber,
              status: d.status,
              canEditItems: d.canEditItems,
              hasDispatchDocuments,
              deliveryDate: d.deliveryDate,
              expectedDate: d.expectedDate,
              dispatchDate: d.dispatchDate,
              customerId: d.customer.id,
              finalInvoiceId: d.finalInvoice.id,
              items: d.items.map((i) => ({ id: i.id, productName: i.productName, modelName: i.modelName, quantity: i.quantity, unit: i.unit })),
              packages: d.packingLists,
              currentPod: pod,
            }}
          />
        </div>
      </section>

      <Tabs
        active={tab}
        tabs={[
          { key: 'overview', label: 'Overview', href: href('overview') },
          { key: 'items', label: 'Items', href: href('items'), count: d.items.length },
          { key: 'packages', label: 'Packages', href: href('packages'), count: d.packingLists.length },
          { key: 'tracking', label: 'Tracking', href: href('tracking'), count: d.trackingEvents.length },
          { key: 'pod', label: 'Proof of Delivery', href: href('pod'), count: d.proofsOfDelivery.length },
          { key: 'documents', label: 'Documents', href: href('documents'), count: d.documents.length },
          { key: 'activity', label: 'Activity', href: href('activity') },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <SectionCard title="Delivery">
            <DefinitionList
              items={[
                { label: 'Delivery number', value: <span className="font-mono">{d.deliveryNumber}</span> },
                { label: 'Status', value: DELIVERY_STATUS_LABELS[d.status] },
                { label: 'Delivery date', value: formatDate(d.deliveryDate) },
                { label: 'Expected date', value: d.expectedDate ? `${formatDate(d.expectedDate)}${d.delayed ? ' (delayed)' : ''}` : null },
                { label: 'Received on', value: d.actualDeliveryDate ? formatDate(d.actualDeliveryDate) : confirmed ? null : 'Not confirmed' },
                { label: 'Contact person', value: d.contactPerson },
                { label: 'Contact number', value: d.contactNumber },
                { label: 'Internal remarks', value: d.internalRemarks },
                { label: 'Created', value: `${formatDateTime(d.createdAt)}${d.createdBy ? ` by ${d.createdBy.fullName}` : ''}` },
                { label: 'Last updated', value: `${formatDateTime(d.updatedAt)}${d.updatedBy ? ` by ${d.updatedBy.fullName}` : ''}` },
              ]}
            />
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Delivery address</p>
              <p className="mt-1 whitespace-pre-line text-base text-ink">{d.deliveryAddress}</p>
            </div>
          </SectionCard>
          <SectionCard title="Dispatch" description={d.dispatchDate ? 'As recorded when the goods left.' : 'Not dispatched yet.'}>
            {d.dispatchDate ? (
              <DefinitionList
                items={[
                  { label: 'Dispatch date', value: `${formatDate(d.dispatchDate)}${d.dispatchTime ? ` at ${d.dispatchTime}` : ''}` },
                  { label: 'Transport mode', value: d.transportMode ? TRANSPORT_MODE_LABELS[d.transportMode] : null },
                  { label: d.courierCompany ? 'Courier' : 'Transporter', value: carrier },
                  { label: 'Tracking number', value: d.trackingNumber },
                  { label: 'LR / GR number', value: d.lrGrNumber },
                  { label: 'Vehicle number', value: d.vehicleNumber },
                  { label: 'Driver', value: [d.driverName, d.driverContact].filter(Boolean).join(' · ') },
                  { label: 'Recorded', value: d.dispatchedAt ? formatDateTime(d.dispatchedAt) : null },
                  { label: 'Dispatch remarks', value: d.dispatchRemarks },
                ]}
              />
            ) : (
              <p className="text-sm text-ink-muted">Dispatch details are recorded with the Dispatch action.</p>
            )}
          </SectionCard>
          {(d.failureDate || d.returnReason) && (
            <SectionCard title="Failure / return">
              <DefinitionList
                items={[
                  { label: 'Failure date', value: d.failureDate ? formatDate(d.failureDate) : null },
                  { label: 'Failure reason', value: d.failureReason },
                  { label: 'Failure remarks', value: d.failureRemarks },
                  { label: 'Next attempt', value: d.nextAttemptDate ? formatDate(d.nextAttemptDate) : null },
                  { label: 'Return reason', value: d.returnReason },
                ]}
              />
            </SectionCard>
          )}
          <SectionCard title="Invoice">
            <DefinitionList
              items={[
                { label: 'Invoice', value: can('invoice.read') ? <Link href={`/final-invoices/${d.finalInvoice.id}`} className="link-pill font-mono">{d.finalInvoice.invoiceNumber ?? 'draft'}</Link> : <span className="font-mono">{d.finalInvoice.invoiceNumber}</span> },
                { label: 'Invoice date', value: formatDate(d.finalInvoice.invoiceDate) },
                { label: 'Invoice status', value: <FinalInvoiceStatusBadge status={d.finalInvoice.status} /> },
              ]}
            />
            <p className="mt-3 text-xs text-ink-subtle">Delivery is independent of payment: it never changes invoice amounts or payment records.</p>
          </SectionCard>
          <section className="card xl:col-span-2">
            <PanelHeader title="Dispatch documents" description={hasDispatchDocuments ? 'Stored at dispatch; every download returns these exact documents.' : 'Not dispatched yet: downloads are previews watermarked DRAFT.'} />
            <div className="divide-y divide-border">
              {([['Delivery challan', 'challan', d.challanDocument], ['Packing list', 'packing-list', d.packingDocument]] as const).map(([label, path, doc]) => (
                <div key={path} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="font-medium text-ink">{label}</p>
                    <p className="text-xs text-ink-subtle">{doc ? `${doc.originalFilename} · ${formatBytes(doc.sizeBytes)} · ${formatDateTime(doc.createdAt)}` : 'Draft preview'}</p>
                  </div>
                  {can('delivery.download') ? (
                    <div className="flex gap-2">
                      <a href={`/deliveries/${d.id}/${path}?inline=1`} target="_blank" rel="noopener" className="btn-secondary"><IconEye size={16} /> Preview / Print</a>
                      <a href={`/deliveries/${d.id}/${path}`} className="btn-secondary"><IconDownload size={16} /> {doc ? 'Download' : 'Download draft'}</a>
                    </div>
                  ) : (
                    <span className="text-xs text-ink-subtle">No permission to download</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'items' && (
        <div className="space-y-5">
          <section className="card overflow-hidden">
            <PanelHeader title="Items on this delivery" description={confirmed ? 'Received quantities as confirmed with proof of delivery.' : 'Received quantities are recorded only when the delivery is confirmed.'} />
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Brand / model</th>
                    <th scope="col" className="text-right">Quantity</th>
                    <th scope="col" className="text-right">Received</th>
                    <th scope="col" className="text-right">Packages</th>
                    <th scope="col">Packed in</th>
                    <th scope="col">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.productName}<span className="block font-mono text-xs text-ink-subtle">{i.productCode}</span></td>
                      <td>{i.brandName}{(i.modelName || i.modelNumber) && <span className="block text-xs text-ink-subtle">{[i.modelName, i.modelNumber].filter(Boolean).join(' · ')}</span>}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{i.quantity} {i.unit}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {confirmed && i.deliveredQuantity !== null ? (
                          <span className={i.deliveredQuantity < i.quantity ? 'font-semibold text-warning' : 'text-success'}>{i.deliveredQuantity} {i.unit}</span>
                        ) : (
                          <span className="text-ink-subtle">{d.dispatchDate && d.status !== 'RETURNED' && d.status !== 'CANCELLED' ? 'Awaiting confirmation' : '—'}</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{i.packageCount ?? '—'}</td>
                      <td>{i.packingItems.length ? i.packingItems.map((p) => `#${p.packingList.packageNumber} (${p.quantity})`).join(', ') : '—'}</td>
                      <td className="max-w-xs whitespace-pre-line text-sm">{i.remarks ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card overflow-hidden">
            <PanelHeader title="Invoice delivery position" description={`All deliveries of invoice ${d.finalInvoice.invoiceNumber ?? ''}. Reserved = on deliveries that are not cancelled or returned.`} />
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col" className="text-right">Invoiced</th>
                    <th scope="col" className="text-right">Reserved on deliveries</th>
                    <th scope="col" className="text-right">Confirmed delivered</th>
                    <th scope="col" className="text-right">Not yet on a delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {d.invoicePositions.map((p) => (
                    <tr key={p.invoiceItemId}>
                      <td>{p.productName}{p.modelName && <span className="block text-xs text-ink-subtle">{p.modelName}</span>}</td>
                      <td className="text-right tabular-nums">{p.invoicedQuantity} {p.unit}</td>
                      <td className="text-right tabular-nums">{p.allocatedQuantity}</td>
                      <td className="text-right tabular-nums">{p.confirmedDeliveredQuantity}</td>
                      <td className="text-right font-semibold tabular-nums">{p.remainingQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 'packages' && (
        <section className="card">
          <PanelHeader title="Packages" description="The packing list. Changed with the Packages action until dispatch." />
          {d.packingLists.length === 0 ? (
            <EmptyStateClient title="No packages" description="Packages have not been recorded for this delivery." />
          ) : (
            <div className="divide-y divide-border">
              {d.packingLists.map((p) => (
                <div key={p.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">Package {p.packageNumber}{p.description ? ` — ${p.description}` : ''}</p>
                    <p className="font-mono text-xs text-ink-subtle">{p.packingNumber}</p>
                  </div>
                  <p className="text-sm text-ink-muted">
                    Weight: {p.weight ?? 'not recorded'} &middot; Dimensions: {p.dimensions ?? 'not recorded'}
                  </p>
                  <ul className="mt-2 list-inside list-disc text-sm text-ink">
                    {p.items.map((l) => <li key={l.id}>{l.quantity} {l.deliveryItem.unit} {l.deliveryItem.productName}{l.deliveryItem.modelName ? ` (${l.deliveryItem.modelName})` : ''}</li>)}
                  </ul>
                  {p.remarks && <p className="mt-1 text-sm text-ink-muted">{p.remarks}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'tracking' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <section className="card">
            <PanelHeader title="Shipment tracking" description="Newest first. Manual updates are recorded with the person who entered them." />
            {d.trackingEvents.length === 0 ? (
              <EmptyStateClient title="No tracking updates" description="Updates appear here once the delivery is dispatched." />
            ) : (
              <ol className="divide-y divide-border">
                {d.trackingEvents.map((e) => (
                  <li key={e.id} className="flex gap-4 px-5 py-3.5">
                    <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent-subtle" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold capitalize text-ink">{e.status}</p>
                        <time dateTime={e.eventAt} className="text-xs text-ink-subtle">{formatDateTime(e.eventAt)}</time>
                      </div>
                      {e.location && <p className="text-sm text-ink">{e.location}</p>}
                      {e.remarks && <p className="text-sm text-ink-muted">{e.remarks}</p>}
                      <p className="text-xs text-ink-subtle">
                        {e.source === 'EXTERNAL' ? `From ${e.provider ?? 'courier'}${e.externalReference ? ` (${e.externalReference})` : ''}` : `Manual${e.recordedBy ? ` · ${e.recordedBy.fullName}` : ''}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="card">
            <PanelHeader title="Status history" description="Every lifecycle step, who made it and why." />
            <ol className="divide-y divide-border">
              {d.statusHistory.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{h.previousStatus ? `${DELIVERY_STATUS_LABELS[h.previousStatus]} → ` : ''}{DELIVERY_STATUS_LABELS[h.newStatus]}</p>
                    {h.remarks && <p className="text-sm text-ink-muted">{h.remarks}</p>}
                  </div>
                  <p className="text-xs text-ink-subtle">{formatDateTime(h.changedAt)} &middot; {h.changedBy?.fullName ?? 'System'}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {tab === 'pod' && (
        <section className="card">
          <PanelHeader title="Proof of delivery" description="The original confirmation and every amendment. Records are never overwritten." />
          {d.proofsOfDelivery.length === 0 ? (
            <EmptyStateClient title="Not confirmed" description="Proof of delivery is recorded with the Confirm delivery action after dispatch." />
          ) : (
            <ol className="divide-y divide-border">
              {[...d.proofsOfDelivery].reverse().map((p) => (
                <li key={p.id} className="space-y-1 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{p.amendsId ? 'Amendment' : 'Original confirmation'}</p>
                    {pod?.id === p.id ? <Pill tone="success">In force</Pill> : <Pill tone="neutral">Superseded</Pill>}
                  </div>
                  <p className="text-sm text-ink">Received by <span className="font-medium">{p.receiverName}</span>{p.receiverContact ? ` (${p.receiverContact})` : ''} on {formatDate(p.actualDeliveryDate)}</p>
                  {p.amendmentReason && <p className="text-sm text-ink-muted">Reason for amendment: {p.amendmentReason}</p>}
                  {p.remarks && <p className="text-sm text-ink-muted">{p.remarks}</p>}
                  <p className="text-xs text-ink-subtle">Recorded {formatDateTime(p.confirmedAt)}{p.confirmedBy ? ` by ${p.confirmedBy.fullName}` : ''}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {tab === 'documents' && (
        <DeliveryDocumentsPanel
          deliveryId={d.id}
          documents={d.documents}
          canUpload={can('delivery.upload_pod') && d.status !== 'CANCELLED'}
          canRemove={can('delivery.upload_pod') && d.status !== 'CANCELLED' && d.proofsOfDelivery.length === 0}
          canDownload={can('document.download')}
          canDownloadDispatchDocuments={can('delivery.download')}
          removeBlockedReason={d.proofsOfDelivery.length > 0 ? 'Proof of delivery is confirmed: its documents are kept. Add a new document or amend the proof instead.' : null}
        />
      )}

      {tab === 'activity' && <ActivityTab deliveryId={d.id} page={query.page} reference={d.deliveryNumber} />}
    </div>
  );
}

async function ActivityTab({ deliveryId, page, reference }: { deliveryId: string; page?: string; reference: string }) {
  let data: PaginatedResponse<ActivityEntry>;
  try {
    data = await apiFetch<PaginatedResponse<ActivityEntry>>(`/deliveries/${deliveryId}/activity${queryString({ page: /^\d+$/.test(page ?? '') ? page : '1', pageSize: 20 })}`);
  } catch (error) {
    return <ErrorState title="Could not load activity" message={error instanceof ApiError ? error.messages[0] : 'The server could not be reached.'} />;
  }
  return (
    <section className="card">
      <PanelHeader title="Activity history" description={`From the audit log for ${reference}: creation, edits, lifecycle steps and tracking.`} />
      {data.items.length === 0 ? (
        <EmptyStateClient title="No activity recorded" description="Changes to this delivery will appear here." />
      ) : (
        <>
          <ol className="divide-y divide-border">
            {data.items.map((entry) => (
              <li key={entry.id} className="flex gap-4 px-5 py-3.5">
                <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">{deliveryActivityLabel(entry.action, activityLabel)}</p>
                    <time dateTime={entry.createdAt} className="text-xs text-ink-subtle">{formatDateTime(entry.createdAt)}</time>
                  </div>
                  {entry.summary && <p className="text-sm text-ink-muted">{entry.summary}</p>}
                  <p className="text-xs text-ink-subtle">by {entry.actor?.fullName ?? 'System'}</p>
                </div>
              </li>
            ))}
          </ol>
          <Pagination meta={data.meta} basePath={`/deliveries/${deliveryId}`} params={{ tab: 'activity' }} noun="events" />
        </>
      )}
    </section>
  );
}
