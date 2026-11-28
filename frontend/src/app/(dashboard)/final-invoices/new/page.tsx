import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { EligibleProforma, EnquiryAssignee, FinalInvoiceFromProforma, PaginatedResponse } from '@/lib/types';
import { formatMoney } from '@/lib/quotation-labels';
import { formatDate } from '@/lib/vendor-labels';
import { EmptyState, ErrorState, Pagination } from '@/components/ui';
import { FinalInvoiceForm } from '@/components/final-invoice-form';
import { ProformaStatusBadge } from '@/components/proforma-badges';
import { IconChevronLeft, IconFile, IconSearch } from '@/components/icons';

export const metadata: Metadata = { title: 'New Final Invoice' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewFinalInvoicePage({ searchParams }: { searchParams: Promise<{ proformaInvoiceId?: string; search?: string; page?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user?.permissions.includes('invoice.create')) {
    return <ErrorState title="Not allowed" message="You do not have permission to create invoices." />;
  }

  if (params.proformaInvoiceId && UUID.test(params.proformaInvoiceId)) return <Step2 proformaInvoiceId={params.proformaInvoiceId} />;

  const search = params.search?.trim() || undefined;
  let data: PaginatedResponse<EligibleProforma>;
  try {
    data = await apiFetch<PaginatedResponse<EligibleProforma>>(`/final-invoices/eligible-proformas${queryString({ search, page: params.page ?? '1', pageSize: 10 })}`);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return <ErrorState title="Could not load issued proforma invoices" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />;
  }

  return (
    <div className="space-y-5">
      <Header subtitle="Step 1 of 2 — choose the issued proforma invoice to bill." />
      <form className="card relative p-3" role="search" action="/final-invoices/new">
        <label htmlFor="eligible-search" className="sr-only">Search issued proforma invoices</label>
        <IconSearch className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-ink-subtle" />
        <input id="eligible-search" name="search" type="search" defaultValue={search} className="field-input h-10 pl-10" />
      </form>
      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={search ? 'No issued proforma invoice matches' : 'No proforma invoices are ready for invoicing'}
            description="Issued proforma invoices without a final invoice. Issue the proforma first."
            action={
              search ? <Link href="/final-invoices/new" className="btn-secondary">Clear search</Link> : <Link href="/proforma-invoices?status=ISSUED,SENT" className="btn-secondary">Issued proforma invoices</Link>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">PI No.</th>
                    <th scope="col">PI Date</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Contact</th>
                    <th scope="col" className="text-right">Total</th>
                    <th scope="col">Currency</th>
                    <th scope="col">PI Status</th>
                    <th scope="col" className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((pi) => (
                    <tr key={pi.id}>
                      <td className="whitespace-nowrap font-mono text-sm font-semibold">
                        {pi.piNumber}
                        <p className="font-sans text-xs font-normal text-ink-subtle">Quotation {pi.quotation.quotationNumber}</p>
                      </td>
                      <td className="whitespace-nowrap">{formatDate(pi.piDate)}</td>
                      <td className="min-w-[180px]">
                        <span className="font-semibold text-ink">{pi.customer.name}</span>
                        <p className="font-mono text-xs text-ink-subtle">{pi.customer.customerCode}</p>
                      </td>
                      <td className="whitespace-nowrap">{pi.contact?.name ?? <span className="text-ink-subtle">&mdash;</span>}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(pi.grandTotal, pi.currency)}</td>
                      <td>{pi.currency}</td>
                      <td><ProformaStatusBadge status={pi.status} /></td>
                      <td className="text-right">
                        <Link href={`/final-invoices/new?proformaInvoiceId=${pi.id}`} className="btn-primary h-9 px-3 text-sm">Select</Link>
                        {pi.cancelledInvoice && <p className="mt-1 text-xs text-warning">Replaces cancelled {pi.cancelledInvoice.invoiceNumber ?? 'draft invoice'}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={data.meta} basePath="/final-invoices/new" params={{ search }} noun="proforma invoices" />
          </>
        )}
      </div>
    </div>
  );
}

async function Step2({ proformaInvoiceId }: { proformaInvoiceId: string }) {
  let prefill: FinalInvoiceFromProforma;
  let assignees: EnquiryAssignee[];
  try {
    [prefill, assignees] = await Promise.all([
      apiFetch<FinalInvoiceFromProforma>(`/final-invoices/from-proforma/${proformaInvoiceId}`),
      apiFetch<EnquiryAssignee[]>('/final-invoices/assignees').catch(() => [] as EnquiryAssignee[]),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    const problems = (apiError?.body.details as { problems?: string[] } | undefined)?.problems;
    return (
      <div className="space-y-5">
        <Header subtitle="Step 2 of 2 — review the invoice." />
        <ErrorState title="This proforma invoice cannot be invoiced" message={[apiError?.messages[0] ?? 'The server could not be reached.', ...(problems ?? [])].join(' ')} correlationId={apiError?.body.correlationId} />
        <Link href="/final-invoices/new" className="btn-secondary w-fit"><IconChevronLeft size={16} /> Choose another proforma invoice</Link>
      </div>
    );
  }

  // A live invoice already exists: send the user to it instead of offering a duplicate.
  if (prefill.existingInvoice) redirect(`/final-invoices/${prefill.existingInvoice.id}?existing=1`);

  const bank = prefill.defaults.bankDetails ?? {};
  // Keep the PI's assignee visible even if they are no longer assignable, so it is not silently dropped.
  const assigneeOptions = prefill.assignedToId && !assignees.some((a) => a.id === prefill.assignedToId) ? [...assignees, { id: prefill.assignedToId, fullName: 'Current assignee (inactive)', email: '' }] : assignees;
  return (
    <div className="space-y-5">
      <Header subtitle={`Step 2 of 2 — review the invoice for proforma invoice ${prefill.proforma.piNumber}.`} />
      <FinalInvoiceForm
        mode="create"
        proformaInvoiceId={prefill.proforma.id}
        proformaRef={{
          piNumber: prefill.proforma.piNumber,
          piDate: prefill.proforma.piDate,
          quotationNumber: prefill.proforma.quotation.quotationNumber,
          revisionNumber: prefill.proforma.quotationRevision.revisionNumber,
          enquiryNumber: prefill.proforma.quotation.enquiry?.enquiryNumber ?? null,
        }}
        customerName={prefill.customer.name}
        customerSnapshot={prefill.customerSnapshot}
        contacts={prefill.contacts}
        assignees={assigneeOptions}
        currency={prefill.currency}
        items={prefill.items}
        totals={prefill.totals}
        replaces={prefill.replaces}
        approvalRequired={prefill.approvalRequired}
        initial={{
          invoiceDate: prefill.defaults.invoiceDate,
          dueDate: '',
          contactId: prefill.contactId ?? '',
          assignedToId: prefill.assignedToId ?? '',
          subject: prefill.defaults.subject ?? '',
          purchaseOrderNumber: prefill.defaults.purchaseOrderNumber ?? '',
          internalRemarks: '',
          paymentTerms: prefill.terms.paymentTerms ?? '',
          deliveryTerms: prefill.terms.deliveryTerms ?? '',
          warrantyTerms: prefill.terms.warrantyTerms ?? '',
          termsAndConditions: prefill.terms.termsAndConditions ?? '',
          notes: prefill.terms.notes ?? '',
          paymentInstructions: prefill.terms.paymentInstructions ?? '',
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
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle text-accent"><IconFile size={26} /></span>
        <div>
          <h1 className="text-2xl font-bold text-ink">New Final Invoice</h1>
          <p className="text-base text-ink-muted">{subtitle}</p>
        </div>
      </div>
      <Link href="/final-invoices" className="btn-secondary"><IconChevronLeft size={16} /> All invoices</Link>
    </div>
  );
}
