import { formatMoney, formatRate } from '@/lib/quotation-labels';
import type { ProformaItem, ProformaTotals, Specification } from '@/lib/types';

/** Read-only line items and totals of a PI (copied from the accepted quotation revision). Server- and client-safe. */

const specText = (specs: ProformaItem['specifications']) => {
  if (!specs) return '';
  const list: Specification[] = Array.isArray(specs) ? specs : Object.entries(specs).map(([name, value]) => ({ name, value }));
  return list.map((s) => `${s.name}: ${s.value}`).join('; ');
};

export function ProformaLines({ items, totals, currency, advanceAmount }: { items: ProformaItem[]; totals: ProformaTotals; currency: string; advanceAmount?: string | null }) {
  const money = (v: string) => formatMoney(v, currency);
  const advance = advanceAmount && Number(advanceAmount) > 0 ? advanceAmount : null;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col" className="w-10">#</th>
              <th scope="col">Product / Model</th>
              <th scope="col" className="text-right">Qty</th>
              <th scope="col" className="text-right">Unit Price</th>
              <th scope="col" className="text-right">Discount</th>
              <th scope="col" className="text-right">Tax</th>
              <th scope="col" className="text-right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const specs = specText(item.specifications);
              return (
                <tr key={item.id ?? item.quotationItemId ?? index}>
                  <td className="tabular-nums text-ink-subtle">{index + 1}</td>
                  <td className="min-w-[220px]">
                    <p className="font-semibold text-ink">
                      {item.productName}
                      {item.modelName ? ` — ${item.modelName}` : ''}
                    </p>
                    <p className="text-xs text-ink-subtle">{[item.brandName, item.modelNumber && `Model no. ${item.modelNumber}`, item.productCode].filter(Boolean).join(' · ')}</p>
                    {item.description && <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{item.description}</p>}
                    {specs && <p className="mt-1 text-xs text-ink-muted">{specs}</p>}
                    {item.remarks && <p className="mt-1 text-xs italic text-ink-muted">{item.remarks}</p>}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{item.quantity} {item.unit}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{money(item.unitPrice)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {Number(item.discountAmount) === 0 ? <span className="text-ink-subtle">&mdash;</span> : money(item.discountAmount)}
                    {item.discountType === 'PERCENT' && Number(item.discountAmount) !== 0 && <p className="text-xs text-ink-subtle">{formatRate(item.discountValue)}%</p>}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {Number(item.taxRate) === 0 ? <span className="text-ink-subtle">&mdash;</span> : money(item.taxAmount)}
                    {Number(item.taxRate) !== 0 && <p className="text-xs text-ink-subtle">{item.taxLabel ? `${item.taxLabel} ` : ''}{formatRate(item.taxRate)}%</p>}
                  </td>
                  <td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(item.lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="ml-auto w-full max-w-md space-y-1.5 text-sm">
        <Row label="Subtotal" value={money(totals.subtotal)} />
        {Number(totals.itemDiscountTotal) !== 0 && <Row label="Item discounts" value={`- ${money(totals.itemDiscountTotal)}`} />}
        <Row label="Taxable amount" value={money(totals.taxableAmount)} />
        {(totals.taxBreakdown ?? []).map((g) => (
          <Row key={`${g.label}-${g.rate}`} label={`${g.label} ${formatRate(g.rate)}% on ${money(g.taxable)}`} value={money(g.tax)} />
        ))}
        {Number(totals.otherCharges) !== 0 && <Row label={totals.otherChargesLabel || 'Other charges'} value={money(totals.otherCharges)} />}
        {Number(totals.additionalDiscount) !== 0 && <Row label="Additional discount" value={`- ${money(totals.additionalDiscount)}`} />}
        <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-bold text-ink">
          <dt>Grand total ({currency})</dt>
          <dd className="tabular-nums">{money(totals.grandTotal)}</dd>
        </div>
        {advance && (
          <>
            <Row label="Advance payable" value={money(advance)} />
            <Row label="Balance" value={formatMoney((Math.round(Number(totals.grandTotal) * 100) - Math.round(Number(advance) * 100)) / 100, currency)} />
          </>
        )}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
}
