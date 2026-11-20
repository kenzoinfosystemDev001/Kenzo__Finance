import type { Metadata } from 'next';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { EligiblePaymentInvoice, PaginatedResponse, CustomerDetail, PaymentMethodOption } from '@/lib/types';
import { formatMoney } from '@/lib/quotation-labels';
import { formatDate } from '@/lib/vendor-labels';
import { ErrorState } from '@/components/ui';

export const metadata: Metadata = { title: 'Record Payment' };

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ customerId?: string; invoiceId?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user?.permissions.includes('payment.create')) return <ErrorState title="Not allowed" message="You do not have permission to record payments." />;

  let customers: Array<{ id: string; name: string; customerCode: string }> = [];
  let invoices: EligiblePaymentInvoice[] = [];
  let settings: { methods: PaymentMethodOption[] } = { methods: [] };
  try {
    const customerData = await apiFetch<PaginatedResponse<CustomerDetail>>('/customers?page=1&pageSize=100&status=ACTIVE');
    customers = customerData.items.map((customer) => ({ id: customer.id, name: customer.name, customerCode: customer.customerCode }));
    [settings] = await Promise.all([apiFetch<{ methods: PaymentMethodOption[] }>('/payments/settings').catch(() => ({ methods: [] }))]);
    if (params.customerId) invoices = await apiFetch<EligiblePaymentInvoice[]>(`/payments/eligible-invoices?customerId=${params.customerId}`);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return <ErrorState title="Could not load payment form" message={apiError?.messages[0] ?? 'The server could not be reached.'} />;
  }

  const methods = settings.methods.filter((method) => method.active);

  async function recordPayment(formData: FormData) {
    'use server';
    try {
      const customerId = String(formData.get('customerId'));
      const finalInvoiceId = String(formData.get('finalInvoiceId'));
      const payment = await apiFetch<{ id: string }>('/payments', {
        method: 'POST',
        body: {
          customerId,
          finalInvoiceId,
          paymentDate: String(formData.get('paymentDate')),
          amount: String(formData.get('amount')),
          method: String(formData.get('method')),
          transactionReference: String(formData.get('transactionReference') || '') || undefined,
          bankReference: String(formData.get('bankReference') || '') || undefined,
          notes: String(formData.get('notes') || '') || undefined,
          confirmDuplicateReference: formData.get('confirmDuplicateReference') === 'on',
        },
      });
      revalidatePath('/payments');
      redirect(`/payments/${payment.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.body.requiresConfirmation) {
        redirect(`/payments/new?customerId=${encodeURIComponent(String(formData.get('customerId')))}&invoiceId=${encodeURIComponent(String(formData.get('finalInvoiceId')))}&duplicate=1`);
      }
      throw error;
    }
  }

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold text-ink">Record Payment</h1><p className="text-sm text-ink-muted">Allocate a payment to an eligible customer final invoice.</p></div>
      <form className="card grid gap-4 p-5 md:grid-cols-2" method="get">
        <label className="text-sm font-medium">Customer
          <select name="customerId" defaultValue={params.customerId ?? ''} className="form-input mt-1 w-full" required>
            <option value="">Select customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} — {customer.customerCode}</option>)}
          </select>
        </label>
        <div className="flex items-end"><button type="submit" className="btn-secondary">Load Invoices</button></div>
      </form>

      {params.customerId && (
        <form action={recordPayment} className="card space-y-5 p-5">
          <input type="hidden" name="customerId" value={params.customerId} />
          <label className="block text-sm font-medium">Final Invoice
            <select name="finalInvoiceId" defaultValue={params.invoiceId ?? ''} className="form-input mt-1 w-full" required>
              <option value="">Select final invoice</option>
              {invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoiceNumber} — {formatMoney(invoice.outstanding, invoice.currency)} outstanding
                </option>
              ))}
            </select>
          </label>
          {invoices.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="data-table"><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Received</th><th className="text-right">Outstanding</th><th>Status</th></tr></thead><tbody>
                {invoices.map((invoice) => <tr key={invoice.id}><td className="font-mono font-semibold">{invoice.invoiceNumber}</td><td>{formatDate(invoice.invoiceDate)}</td><td>{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</td><td className="text-right">{formatMoney(invoice.grandTotal, invoice.currency)}</td><td className="text-right">{formatMoney(invoice.amountReceived, invoice.currency)}</td><td className="text-right font-semibold">{formatMoney(invoice.outstanding, invoice.currency)}</td><td>{invoice.paymentState.replace(/_/g, ' ')}</td></tr>)}
              </tbody></table>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium">Payment Date<input name="paymentDate" type="date" className="form-input mt-1 w-full" required /></label>
            <label className="text-sm font-medium">Amount<input name="amount" type="number" min="0.01" step="0.01" className="form-input mt-1 w-full" required /></label>
            <label className="text-sm font-medium">Payment Method<select name="method" className="form-input mt-1 w-full" required><option value="">Select method</option>{methods.map((method) => <option key={method.code} value={method.code}>{method.label}</option>)}</select></label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">Transaction Reference<input name="transactionReference" className="form-input mt-1 w-full" /></label>
            <label className="text-sm font-medium">Bank Reference<input name="bankReference" className="form-input mt-1 w-full" /></label>
          </div>
          <label className="block text-sm font-medium">Payment Notes<textarea name="notes" rows={3} className="form-input mt-1 w-full" /></label>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="confirmDuplicateReference" /> Confirm duplicate transaction reference if this is a separate payment.</label>
          <div className="flex gap-3"><button type="submit" className="btn-primary">Record Payment</button><Link href="/payments" className="btn-secondary">Cancel</Link></div>
        </form>
      )}
    </div>
  );
}
