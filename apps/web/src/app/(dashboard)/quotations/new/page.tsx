import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerDetail, EnquiryAssignee, PaginatedResponse, QuotationEnquiryHandoff, QuotationListItem, QuotationSettings } from '@/lib/types';
import { ErrorState, PageHeader } from '@/components/ui';
import { QuotationForm } from '@/components/quotation-form';
import { IconAlert } from '@/components/icons';

export const metadata: Metadata = { title: 'New Quotation' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ enquiryId?: string; customerId?: string }> }) {
  const { enquiryId, customerId } = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);
  const canCreateProduct = can('product.create');

  // --- From an enquiry ------------------------------------------------------
  if (enquiryId) {
    if (!UUID.test(enquiryId)) notFound();
    // Same rule as the API: converting needs both permissions.
    if (!can('quotation.create') || !can('enquiry.convert')) redirect(`/enquiries/${enquiryId}`);

    let handoff: QuotationEnquiryHandoff;
    try {
      handoff = await apiFetch<QuotationEnquiryHandoff>(`/quotations/from-enquiry/${enquiryId}`);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
      const apiError = error instanceof ApiError ? error : null;
      return (
        <div className="mx-auto max-w-3xl">
          <PageHeader title="New Quotation" />
          <ErrorState title="Could not load the enquiry" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />
        </div>
      );
    }

    if (!handoff.ready) {
      const existing = await apiFetch<PaginatedResponse<QuotationListItem>>(`/quotations${queryString({ enquiryId, pageSize: 1 })}`).catch(() => null);
      const quotation = existing?.items[0];
      return (
        <div className="mx-auto max-w-3xl">
          <PageHeader title="New Quotation" description={`From enquiry ${handoff.enquiryNumber} · ${handoff.enquiry.customer.name}`} />
          <div className="card space-y-4 p-6">
            <div className="flex items-start gap-3">
              <IconAlert className="mt-0.5 shrink-0 text-warning" size={20} />
              <div>
                <p className="text-base font-semibold text-ink">{handoff.enquiryNumber} cannot be converted yet</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-ink">
                  {handoff.problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/enquiries/${enquiryId}`} className="btn-secondary">Back to enquiry</Link>
              {quotation && <Link href={`/quotations/${quotation.id}`} className="btn-primary">Open quotation {quotation.quotationNumber}</Link>}
            </div>
          </div>
        </div>
      );
    }

    const [assignees, customer] = await Promise.all([
      apiFetch<EnquiryAssignee[]>('/quotations/assignees').catch(() => [] as EnquiryAssignee[]),
      apiFetch<CustomerDetail>(`/customers/${handoff.customerId}`).catch(() => null),
    ]);

    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="New Quotation"
          description={`From enquiry ${handoff.enquiryNumber} · ${handoff.enquiry.customer.name}. Products and quantities are copied from the enquiry; enter prices, discounts and tax for each line.`}
        />
        <QuotationForm
          mode="create"
          handoff={handoff}
          initialCustomer={customer}
          assignees={assignees}
          defaultTerms={handoff.defaultTerms}
          canCreateProduct={canCreateProduct}
        />
      </div>
    );
  }

  // --- Manual ---------------------------------------------------------------
  if (!can('quotation.create_manual')) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="New Quotation" />
        <div className="card space-y-3 p-6">
          <p className="text-base text-ink">Quotations are created from enquiries.</p>
          <p className="text-sm text-ink-muted">
            Open an enquiry that is ready for quotation and choose <span className="font-medium text-ink">Convert to Quotation</span>.
            Creating a quotation without an enquiry needs the manual quotation permission.
          </p>
          {can('enquiry.read') && <Link href="/enquiries?status=READY_FOR_QUOTATION" className="btn-secondary">Enquiries ready for quotation</Link>}
        </div>
      </div>
    );
  }

  const [assignees, settings, customer] = await Promise.all([
    apiFetch<EnquiryAssignee[]>('/quotations/assignees').catch(() => [] as EnquiryAssignee[]),
    apiFetch<QuotationSettings>('/quotations/settings').catch(() => null),
    customerId && UUID.test(customerId) ? apiFetch<CustomerDetail>(`/customers/${customerId}`).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="New Quotation" description="A manual quotation, not linked to an enquiry. Choose the customer and the products, then enter prices, discounts and tax per line." />
      <QuotationForm
        mode="create"
        initialCustomer={customer && customer.status === 'ACTIVE' ? customer : null}
        assignees={assignees}
        defaultTerms={settings?.defaultTerms || null}
        canCreateProduct={canCreateProduct}
      />
    </div>
  );
}
