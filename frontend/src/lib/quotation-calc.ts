import type { DiscountType } from './types';

/**
 * Live preview of the quotation arithmetic, mirroring apps/api
 * quotation-calc.ts exactly. Amounts are held as integer hundredths
 * (BigInt), never floating point, and rounded half-up to 2 places per line.
 * The server recalculates everything on save and is authoritative.
 *
 * Per line:
 *   gross    = quantity x unitPrice
 *   discount = PERCENT: gross x value / 100 | AMOUNT: value (<= gross)
 *   taxable  = gross - discount
 *   tax      = taxable x taxRate / 100
 *   total    = taxable + tax
 *
 * Revision:
 *   grandTotal = sum(taxable) + sum(tax) + otherCharges - additionalDiscount
 *   (the additional discount is a flat reduction after tax)
 */

export const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
export const RATE_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

const HUNDRED = BigInt(100);
const TEN_THOUSAND = BigInt(10000);
const ZERO = BigInt(0);

/** "12.5" -> 1250n (hundredths). Blank is zero; anything else that is not a plain decimal is null. */
export function toHundredths(value: string): bigint | null {
  const text = value.trim();
  if (text === '') return ZERO;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [int, frac = ''] = text.split('.');
  return BigInt(int) * HUNDRED + BigInt((frac + '00').slice(0, 2));
}

/** Non-negative a / b rounded half-up. */
const divideHalfUp = (a: bigint, b: bigint) => (a + b / BigInt(2)) / b;

/** 123456n -> "1234.56". */
export function hundredthsToString(value: bigint): string {
  const negative = value < ZERO;
  const abs = negative ? -value : value;
  return `${negative ? '-' : ''}${abs / HUNDRED}.${(abs % HUNDRED).toString().padStart(2, '0')}`;
}

export interface CalcLineInput {
  quantity: string;
  unitPrice: string;
  discountType: DiscountType;
  discountValue: string;
  taxLabel: string;
  taxRate: string;
}

export interface CalcLineResult {
  gross: bigint;
  discountAmount: bigint;
  taxable: bigint;
  taxAmount: bigint;
  lineTotal: bigint;
}

/** Computes one line, or explains why it cannot be computed (same rules as the API). */
export function calculateLine(line: CalcLineInput, index: number): { result?: CalcLineResult; error?: string } {
  const label = `Item ${index + 1}`;
  const quantity = /^\d+$/.test(line.quantity.trim()) ? BigInt(line.quantity.trim()) : null;
  const unitPrice = line.unitPrice.trim() === '' ? null : toHundredths(line.unitPrice);
  const value = toHundredths(line.discountType === 'NONE' ? '' : line.discountValue);
  const taxRate = toHundredths(line.taxRate);
  if (quantity === null || quantity < BigInt(1)) return { error: `${label}: quantity must be a whole number of at least 1.` };
  if (unitPrice === null) return { error: `${label}: enter a unit price with up to 2 decimals.` };
  if (value === null) return { error: `${label}: the discount must be a number with up to 2 decimals.` };
  if (taxRate === null) return { error: `${label}: the tax rate must be a percentage with up to 2 decimals.` };
  if (taxRate > TEN_THOUSAND) return { error: `${label}: tax rate must be between 0 and 100.` };

  const gross = unitPrice * quantity;
  let discountAmount = ZERO;
  if (line.discountType === 'PERCENT') {
    if (value > TEN_THOUSAND) return { error: `${label}: a percentage discount cannot exceed 100%.` };
    discountAmount = divideHalfUp(gross * value, TEN_THOUSAND);
  } else if (line.discountType === 'AMOUNT') {
    if (value > gross) return { error: `${label}: the discount cannot exceed the line amount.` };
    discountAmount = value;
  }
  const taxable = gross - discountAmount;
  const taxAmount = divideHalfUp(taxable * taxRate, TEN_THOUSAND);
  return { result: { gross, discountAmount, taxable, taxAmount, lineTotal: taxable + taxAmount } };
}

export interface CalcTotals {
  subtotal: bigint;
  itemDiscountTotal: bigint;
  taxableAmount: bigint;
  taxTotal: bigint;
  otherCharges: bigint;
  additionalDiscount: bigint;
  grandTotal: bigint;
  taxBreakdown: Array<{ label: string; rate: string; taxable: string; tax: string }>;
}

/** Totals over the lines that could be computed, plus header adjustments. */
export function calculateTotals(
  lines: Array<{ input: CalcLineInput; result: CalcLineResult }>,
  additionalDiscountInput: string,
  otherChargesInput: string,
): { totals: CalcTotals; error?: string } {
  const sum = (pick: (r: CalcLineResult) => bigint) => lines.reduce((acc, l) => acc + pick(l.result), ZERO);
  const additionalDiscount = toHundredths(additionalDiscountInput) ?? ZERO;
  const otherCharges = toHundredths(otherChargesInput) ?? ZERO;
  const taxableAmount = sum((r) => r.taxable);
  const taxTotal = sum((r) => r.taxAmount);
  const grandTotal = taxableAmount + taxTotal + otherCharges - additionalDiscount;

  // Grouped by label + rate, e.g. "GST 18%": a breakdown, not a policy.
  const groups = new Map<string, { label: string; rate: bigint; taxable: bigint; tax: bigint }>();
  for (const line of lines) {
    const rate = toHundredths(line.input.taxRate) ?? ZERO;
    if (rate === ZERO) continue;
    const label = line.input.taxLabel.trim() || 'Tax';
    const key = `${label}|${rate}`;
    const group = groups.get(key) ?? { label, rate, taxable: ZERO, tax: ZERO };
    group.taxable += line.result.taxable;
    group.tax += line.result.taxAmount;
    groups.set(key, group);
  }

  return {
    totals: {
      subtotal: sum((r) => r.gross),
      itemDiscountTotal: sum((r) => r.discountAmount),
      taxableAmount,
      taxTotal,
      otherCharges,
      additionalDiscount,
      grandTotal,
      taxBreakdown: [...groups.values()].map((g) => ({
        label: g.label,
        rate: hundredthsToString(g.rate),
        taxable: hundredthsToString(g.taxable),
        tax: hundredthsToString(g.tax),
      })),
    },
    error: grandTotal < ZERO ? 'The additional discount is larger than the quotation total.' : undefined,
  };
}
