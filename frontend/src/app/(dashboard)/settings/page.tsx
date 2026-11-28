import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import { setStockTrackingAction } from '@/lib/inventory-actions';
import type { AppSetting, FinalInvoiceSettings, PaymentSettings, ProformaSettings, QuotationSettings } from '@/lib/types';
import { PageHeader, SectionCard } from '@/components/ui';
import { QuotationSettingsPanel } from './quotation-settings';
import { ProformaSettingsPanel } from './proforma-settings';
import { FinalInvoiceSettingsPanel } from './final-invoice-settings';
import { PaymentSettingsPanel } from './payment-settings';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const canManage = user?.permissions.includes('settings.manage') ?? false;

  const { settings } = await apiFetch<{ settings: AppSetting[] }>(
    '/settings',
  ).catch(() => ({ settings: [] as AppSetting[] }));

  const canReadQuotations = user?.permissions.includes('quotation.read') ?? false;
  // The API serves these to quotation readers and to settings managers.
  const quotationSettings = canReadQuotations || canManage
    ? await apiFetch<QuotationSettings>('/quotations/settings').catch(() => null)
    : null;

  const stockTracking =
    settings.find((s) => s.key === 'inventory.stockTrackingEnabled')?.value === true;
  const quotationApproval =
    settings.find((s) => s.key === 'quotation.approvalRequired')?.value === true;
  const proformaApproval =
    settings.find((s) => s.key === 'proforma.approvalRequired')?.value === true;
  const canReadProformas = user?.permissions.includes('proforma.read') ?? false;
  const proformaSettings =
    canManage || canReadProformas
      ? await apiFetch<ProformaSettings>('/proforma-invoices/settings').catch(() => null)
      : null;
  const canReadInvoices = user?.permissions.includes('invoice.read') ?? false;
  const invoiceSettings =
    canManage || canReadInvoices
      ? await apiFetch<FinalInvoiceSettings>('/final-invoices/settings').catch(() => null)
      : null;
  const canReadPayments = user?.permissions.includes('payment.read') ?? false;
  const paymentSettings =
    canManage || canReadPayments
      ? await apiFetch<PaymentSettings>('/payments/settings').catch(() => null)
      : null;
  const invoiceApproval =
    invoiceSettings?.approvalRequired ?? settings.find((s) => s.key === 'invoice.approvalRequired')?.value === true;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Settings"
      />

      <SectionCard
        title="Inventory"
        description="How the product catalogue treats physical quantities."
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-md">
            <p className="text-base font-medium text-ink">Track stock quantities</p>
            <p className="mt-1 text-sm text-ink-muted">
              {stockTracking
                ? 'On. Products carry an on-hand quantity derived from the stock ledger, and movements can be recorded.'
                : 'Off. Products are a catalogue only: the system records what can be supplied, not how many units are held.'}
            </p>

            {!stockTracking && (
              <p className="mt-2 text-sm text-ink-subtle">
                Turning this on starts an empty ledger. Record an opening
                balance per product to set the starting count.
              </p>
            )}

            {stockTracking && (
              <p className="mt-2 text-sm text-warning">
                Turning this off hides quantities everywhere, but keeps the
                ledger intact; switching back on restores the same figures.
              </p>
            )}
          </div>

          <div className="shrink-0">
            {canManage ? (
              <form action={setStockTrackingAction}>
                <input
                  type="hidden"
                  name="enabled"
                  value={stockTracking ? 'false' : 'true'}
                />
                <button
                  type="submit"
                  className={stockTracking ? 'btn-secondary' : 'btn-primary'}
                >
                  {stockTracking ? 'Turn off' : 'Turn on'}
                </button>
              </form>
            ) : (
              <span className="badge bg-surface-muted text-ink-muted">
                {stockTracking ? 'On' : 'Off'}
              </span>
            )}
          </div>
        </div>
      </SectionCard>

      {(canManage || canReadQuotations) && (
        <SectionCard
          title="Quotations"
          description="Approval before sending, default terms and the company details printed on quotation PDFs."
        >
          <QuotationSettingsPanel
            approvalRequired={quotationApproval}
            defaultTerms={quotationSettings ? quotationSettings.defaultTerms : null}
            companyProfile={quotationSettings ? quotationSettings.companyProfile : null}
            canManage={canManage}
          />
        </SectionCard>
      )}

      {(canManage || canReadProformas) && (
        <SectionCard
          title="Proforma Invoices"
        >
          <ProformaSettingsPanel approvalRequired={proformaApproval} settings={proformaSettings} canManage={canManage} />
        </SectionCard>
      )}

      {(canManage || canReadInvoices) && (
        <SectionCard
          title="Final Invoices"
        >
          <FinalInvoiceSettingsPanel approvalRequired={invoiceApproval} settings={invoiceSettings} canManage={canManage} />
        </SectionCard>
      )}

      {(canManage || canReadPayments) && (
        <SectionCard
          title="Payments"
        >
          <PaymentSettingsPanel settings={paymentSettings} canManage={canManage} />
        </SectionCard>
      )}

      <SectionCard
        title="All settings"
        description="Current effective values."
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Value</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {settings.map((setting) => (
                <tr key={setting.key}>
                  <td className="font-mono text-sm">{setting.key}</td>
                  <td className="font-mono text-sm">{setting.value === null ? '—' : typeof setting.value === 'object' ? JSON.stringify(setting.value) : String(setting.value)}</td>
                  <td className="text-ink-muted">{setting.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
