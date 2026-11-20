import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { EligibleQuotation, EnquiryAssignee, PaginatedResponse, ProformaFromQuotation } from '@/lib/types';
import { formatMoney } from '@/lib/quotation-labels';
import { formatDate } from '@/lib/vendor-labels';
import { EmptyState, ErrorState, Pagination } from '@/components/ui';
import { ProformaForm } from '@/components/proforma-form';
import { IconChevronLeft, IconInvoice, IconSearch } from '@/components/icons';

export const metadata: Metadata = { title: 'New Proforma Invoice' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewProformaPage({ searchParams }: { searchParams: Promise<{ quotationId?: string; search?: string; page?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user?.permissions.includes('proforma.create')) {
    return <ErrorState title="Not allowed" message="You do not have permission to create proforma invoices." />;
  }

  if (params.quotationId && UUID.test(params.quotationId)) return <Step2 quotationId={params.quotationId} />;

  const search = params.search?.trim() || undefined;
  let data: PaginatedResponse<EligibleQuotation>;
  try {
    data = await apiFetch<PaginatedResponse<EligibleQuotation>>(`/proforma-invoices/eligible-quotations${queryString({ search, page: params.page ?? '1', pageSize: 10 })}`);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return <ErrorState title="Could not load accepted quotations" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />;
  }

  return (
    <div className="space-y-5">
      <Header subtitle="Step 1 of 2 — choose the quotation the customer accepted." />
      <form className="card relative p-3" role="search" action="/proforma-invoices/new">
        <label htmlFor="eligible-search" className="sr-only">Search accepted quotations</label>
        <IconSearch className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-ink-subtle" />
        <input id="eligible-search" name="search" type="search" defaultValue={search} placeholder="Quotation number or customer" className="field-input h-10 pl-10" />
      </form>
      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={search ? 'No accepted quotation matches' : 'No quotations are ready for a proforma invoice'}
            description="Only quotations the customer accepted, and that do not already have a live proforma invoice, are listed. Record the customer's acceptance on the quotation first."
            action={search ? <Link href="/proforma-invoices/new" className="btn-secondary">Clear search</Link> : <Link href="/quotations?status=ACCEPTED" className="btn-secondary">Accepted quotations</Link>}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Quotation</th>
                    <th scope="col" className="text-right">Revision</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Accepted</th>
                    <th scope="col" className="text-right">Accepted Amount</th>
                    <th scope="col">Assigned To</th>
                    <th scope="col" className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((q) => (
                    <tr key={q.id}>
                      <td className="whitespace-nowrap font-mono text-sm font-semibold">{q.quotationNumber}</td>
                      <td className="text-right tabular-nums">R{q.revisionNumber}</td>
                      <td className="min-w-[180px]">
                        <span className="font-semibold text-ink">{q.customer.name}</span>
                        <p className="font-mono text-xs text-ink-subtle">{q.customer.customerCode}</p>
                      </td>
                      <td className="whitespace-nowrap">{q.acceptedAt ? formatDate(q.acceptedAt) : <span className="text-ink-subtle">&mdash;</span>}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(q.grandTotal, q.currency)}</td>
                      <td className="whitespace-nowrap">{q.assignedTo?.fullName ?? <span className="text-ink-subtle">Unassigned</span>}</td>
                      <td className="text-right">
                        <Link href={`/proforma-invoices/new?quotationId=${q.id}`} className="btn-primary h-9 px-3 text-sm">Select</Link>
                        {q.cancelledProforma && <p className="mt-1 text-xs text-warning">Replaces cancelled {q.cancelledProforma.piNumber}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={data.meta} basePath="/proforma-invoices/new" params={{ search }} noun="accepted quotations" />
          </>
        )}
      </div>
    </div>
  );
}

async function Step2({ quotationId }: { quotationId: string }) {
  let prefill: ProformaFromQuotation;
  let assignees: EnquiryAssignee[];
  try {
    [prefill, assignees] = await Promise.all([
      apiFetch<ProformaFromQuotation>(`/proforma-invoices/from-quotation/${quotationId}`),
      apiFetch<EnquiryAssignee[]>('/proforma-invoices/assignees').catch(() => [] as EnquiryAssignee[]),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    const problems = (apiError?.body.details as { problems?: string[] } | undefined)?.problems;
    return (
      <div className="space-y-5">
        <Header subtitle="Step 2 of 2 — review the proforma invoice." />
        <ErrorState title="This quotation cannot become a proforma invoice" message={[apiError?.messages[0] ?? 'The server could not be reached.', ...(problems ?? [])].join(' ')} correlationId={apiError?.body.correlationId} />
        <Link href="/proforma-invoices/new" className="btn-secondary w-fit"><IconChevronLeft size={16} /> Choose another quotation</Link>
      </div>
    );
  }

  // A live PI already exists: send the user to it instead of offering a duplicate.
  if (prefill.existingProforma) redirect(`/proforma-invoices/${prefill.existingProforma.id}?existing=1`);

  const bank = prefill.defaults.bankDetails ?? {};
  return (
    <div className="space-y-5">
      <Header subtitle={`Step 2 of 2 — review the proforma invoice for ${prefill.quotation.quotationNumber}.`} />
      <ProformaForm
        mode="create"
        quotationId={prefill.quotation.id}
        quotationRef={{ quotationNumber: prefill.quotation.quotationNumber, revisionNumber: prefill.quotation.revisionNumber, acceptedAt: prefill.quotation.acceptedAt, enquiryNumber: prefill.quotation.enquiry?.enquiryNumber ?? null }}
        customerName={prefill.customer.name}
        customerSnapshot={prefill.customerSnapshot}
        contacts={prefill.contacts}
        assignees={assignees}
        currency={prefill.currency}
        items={prefill.items}
        totals={prefill.totals}
        replaces={prefill.replaces}
        approvalRequired={prefill.approvalRequired}
        initial={{
          piDate: prefill.defaults.piDate,
          dueDate: '',
          contactId: prefill.contactId ?? '',
          assignedToId: prefill.assignedToId ?? '',
          subject: prefill.quotation.subject ?? '',
          referenceNumber: prefill.quotation.referenceNumber ?? '',
          internalRemarks: '',
          advanceAmount: '',
          paymentTerms: prefill.terms.paymentTerms ?? '',
          deliveryTerms: prefill.terms.deliveryTerms ?? '',
          warrantyTerms: prefill.terms.warrantyTerms ?? '',
          termsAndConditions: prefill.terms.termsAndConditions ?? '',
          notes: prefill.terms.notes ?? '',
          paymentInstructions: prefill.defaults.paymentInstructions ?? '',
          bankDetails: { bankName: bank.bankName ?? '', accountName: bank.accountName ?? '', accountNumber: bank.accountNumber ?? '', ifsc: bank.ifsc ?? '', swift: bank.swift ?? '', branch: bank.branch ?? '' },
        }}
      />
    </div>
  );
}

function Header({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle text-accent"><IconInvoice size={26} /></span>
        <div>
          <h1 className="text-2xl font-bold text-ink">New Proforma Invoice</h1>
          <p className="text-base text-ink-muted">{subtitle}</p>
        </div>
      </div>
      <Link href="/proforma-invoices" className="btn-secondary"><IconChevronLeft size={16} /> All proforma invoices</Link>
    </div>
  );
}
