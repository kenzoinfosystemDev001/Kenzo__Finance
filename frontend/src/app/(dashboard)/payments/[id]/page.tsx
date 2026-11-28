import type { Metadata } from 'next';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { PaymentDetail } from '@/lib/types';
import { formatMoney } from '@/lib/quotation-labels';
import { formatDate, formatDateTime, formatBytes } from '@/lib/vendor-labels';
import { DefinitionList, ErrorState, SectionCard } from '@/components/ui';
import { IconChevronLeft, IconDownload } from '@/components/icons';

export const metadata: Metadata = { title: 'Payment Profile' };

export default async function PaymentProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user?.permissions.includes('payment.read')) return <ErrorState title="Not allowed" message="You do not have permission to view payments." />;

  let payment: PaymentDetail;
  try {
    payment = await apiFetch<PaymentDetail>(`/payments/${id}`);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return <ErrorState title="Could not load payment" message={apiError?.messages[0] ?? 'The server could not be reached.'} />;
  }
  const allocation = payment.allocations[0];
  const invoice = allocation?.finalInvoice;
  const can = (permission: string) => user.permissions.includes(permission);

  async function changeStatus(formData: FormData) {
    'use server';
    const action = String(formData.get('action'));
    if (action === 'verify') await apiFetch(`/payments/${id}/verify`, { method: 'POST' });
    if (action === 'reject') await apiFetch(`/payments/${id}/reject`, { method: 'POST', body: { reason: String(formData.get('reason')) } });
    if (action === 'reverse') await apiFetch(`/payments/${id}/reverse`, { method: 'POST', body: { reason: String(formData.get('reason')) } });
    revalidatePath(`/payments/${id}`);
    revalidatePath('/payments');
    redirect(`/payments/${id}`);
  }

  async function uploadProof(formData: FormData) {
    'use server';
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return;
    const multipart = new FormData();
    multipart.append('file', file);
    multipart.append('kind', 'PAYMENT_PROOF');
    await apiFetch(`/payments/${id}/documents`, { method: 'POST', formData: multipart });
    revalidatePath(`/payments/${id}`);
    redirect(`/payments/${id}`);
  }

  return (
    <div className="space-y-5">
      <Link href="/payments" className="link-pill-neutral text-sm"><IconChevronLeft size={16} /> All payments</Link>
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h1 className="font-mono text-2xl font-bold text-ink">{payment.receiptNumber}</h1><span className="chip">{payment.status.replace(/_/g, ' ')}</span></div>
            <p className="mt-1 text-sm text-ink-muted">{payment.customer.name} &middot; {formatDate(payment.paymentDate)}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{formatMoney(payment.amount, payment.currency)}</p>
          </div>
          {can('payment.download') && <a className="btn-secondary" href={`/payments/${payment.id}/receipt`}><IconDownload size={16} /> Download Receipt</a>}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Payment overview">
          <DefinitionList items={[
            { label: 'Customer', value: can('customer.read') ? <Link className="link-pill" href={`/customers/${payment.customer.id}`}>{payment.customer.name}</Link> : payment.customer.name },
            { label: 'Invoice', value: invoice && can('invoice.read') ? <Link className="link-pill font-mono" href={`/final-invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link> : invoice?.invoiceNumber },
            { label: 'Payment date', value: formatDate(payment.paymentDate) },
            { label: 'Method', value: payment.methodLabel },
            { label: 'Transaction reference', value: payment.transactionReference },
            { label: 'Bank reference', value: payment.bankReference },
            { label: 'Received by', value: payment.receivedBy?.fullName },
            { label: 'Notes', value: payment.notes },
          ]} />
        </SectionCard>
        <SectionCard title="Invoice summary">
          <DefinitionList items={[
            { label: 'Invoice total', value: formatMoney(payment.invoiceSummary.invoiceTotal, payment.currency) },
            { label: 'Other verified payments', value: formatMoney(payment.invoiceSummary.otherVerifiedPayments, payment.currency) },
            { label: 'This payment', value: formatMoney(payment.invoiceSummary.thisPayment, payment.currency) },
            { label: 'Total verified', value: formatMoney(payment.invoiceSummary.totalVerified, payment.currency) },
            { label: 'Pending verification', value: formatMoney(payment.invoiceSummary.pendingVerification, payment.currency) },
            { label: 'Outstanding', value: formatMoney(payment.invoiceSummary.outstanding, payment.currency) },
            { label: 'Payment state', value: payment.invoiceSummary.paymentState.replace(/_/g, ' ') },
          ]} />
        </SectionCard>
      </div>

      {(can('payment.verify') || can('payment.reject') || can('payment.reverse')) && (
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-semibold text-ink">Payment Actions</h2>
          {payment.status === 'PENDING_VERIFICATION' && can('payment.verify') && (
            <form action={changeStatus} className="inline-flex"><input type="hidden" name="action" value="verify" /><button type="submit" className="btn-primary">Verify Payment</button></form>
          )}
          {payment.status === 'PENDING_VERIFICATION' && can('payment.reject') && (
            <form action={changeStatus} className="mt-3 grid max-w-xl gap-3 md:grid-cols-[1fr_auto]"><input type="hidden" name="action" value="reject" /><input name="reason" className="form-input" placeholder="Required rejection reason" required /><button type="submit" className="btn-danger">Reject</button></form>
          )}
          {payment.status === 'VERIFIED' && can('payment.reverse') && (
            <form action={changeStatus} className="mt-3 grid max-w-xl gap-3 md:grid-cols-[1fr_auto]"><input type="hidden" name="action" value="reverse" /><input name="reason" className="form-input" placeholder="Required reversal reason" required /><button type="submit" className="btn-danger">Reverse Payment</button></form>
          )}
        </section>
      )}

      <SectionCard title="Attachments" description="Payment proofs and supporting documents.">
        {can('payment.create') && payment.status !== 'REJECTED' && payment.status !== 'REVERSED' && (
          <form action={uploadProof} className="mb-4 flex flex-wrap items-end gap-3 border-b border-border pb-4">
            <label className="text-sm font-medium">Upload proof<input name="file" type="file" className="form-input mt-1" accept=".pdf,.png,.jpg,.jpeg,.webp" required /></label>
            <button type="submit" className="btn-secondary">Upload</button>
          </form>
        )}
        {payment.documents.length === 0 ? <p className="text-sm text-ink-muted">No attachments.</p> : (
          <div className="space-y-2">{payment.documents.map((document) => (
            <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2 last:border-0">
              <div><p className="font-medium text-ink">{document.originalFilename}</p><p className="text-xs text-ink-subtle">{formatBytes(document.sizeBytes)} &middot; {formatDateTime(document.createdAt)}</p></div>
              {can('document.download') && <a className="btn-secondary" href={`/payments/${payment.id}/documents/${document.id}/content`}>Download</a>}
            </div>
          ))}</div>
        )}
      </SectionCard>

      <SectionCard title="Activity History">
        {payment.statusHistory.length === 0 ? <p className="text-sm text-ink-muted">No status history.</p> : (
          <ol className="divide-y divide-border">{payment.statusHistory.map((entry) => (
            <li key={entry.id} className="py-3"><p className="font-medium text-ink">{entry.previousStatus ? `${entry.previousStatus.replace(/_/g, ' ')} → ` : ''}{entry.newStatus.replace(/_/g, ' ')}</p>{entry.remarks && <p className="text-sm text-ink-muted">{entry.remarks}</p>}<p className="text-xs text-ink-subtle">{formatDateTime(entry.changedAt)}{entry.changedBy ? ` · ${entry.changedBy.fullName}` : ''}</p></li>
          ))}</ol>
        )}
      </SectionCard>
    </div>
  );
}
