import { BadRequestException } from '@nestjs/common';
import { DiscountType, Prisma } from '@prisma/client';

/**
 * Quotation arithmetic. Exact decimals throughout (never floating point),
 * rounded half-up to 2 places per line. No tax rate, discount policy or
 * round-off is assumed: rates and discounts come from the user per line.
 *
 * Per line:
 *   gross    = quantity x unitPrice
 *   discount = PERCENT: gross x value / 100 | AMOUNT: value (<= gross)
 *   taxable  = gross - discount
 *   tax      = taxable x taxRate / 100
 *   total    = taxable + tax
 *
 * Revision:
 *   subtotal = sum(gross); taxable = sum(line taxable); tax = sum(line tax)
 *   grandTotal = taxable + tax + otherCharges - additionalDiscount
 *
 * PENDING BUSINESS DECISION: how an additional (header) discount interacts
 * with tax. It is applied after tax, as a flat reduction of the grand
 * total, and is shown separately on the document. Confirm with accounts
 * before relying on it for tax-invoice purposes.
 */

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;
const ZERO = new D(0);
const HUNDRED = new D(100);
const round = (value: Dec) => value.toDecimalPlaces(2, D.ROUND_HALF_UP);

/** Largest value the Decimal(14,2) money columns hold. */
const MAX_AMOUNT = new D('999999999999.99');

/** A value past the column limit is a 400 here, not a numeric-overflow 500 from Postgres. */
function assertStorable(value: Dec, what: string): void {
  if (value.abs().greaterThan(MAX_AMOUNT)) {
    throw new BadRequestException(`${what} is too large (the maximum is 999,999,999,999.99).`);
  }
}

export interface LineInput {
  quantity: number;
  unitPrice: string | number;
  discountType?: DiscountType;
  discountValue?: string | number;
  taxRate?: string | number;
  taxLabel?: string | null;
}

export interface LineResult {
  gross: Dec;
  discountAmount: Dec;
  taxable: Dec;
  taxAmount: Dec;
  lineTotal: Dec;
}

export function calculateLine(line: LineInput, index: number): LineResult {
  const label = `Item ${index + 1}`;
  const unitPrice = new D(line.unitPrice);
  const value = new D(line.discountValue ?? 0);
  const taxRate = new D(line.taxRate ?? 0);
  if (unitPrice.isNegative()) throw new BadRequestException(`${label}: unit price cannot be negative.`);
  if (value.isNegative()) throw new BadRequestException(`${label}: discount cannot be negative.`);
  if (taxRate.isNegative() || taxRate.greaterThan(100)) throw new BadRequestException(`${label}: tax rate must be between 0 and 100.`);

  const gross = round(unitPrice.times(line.quantity));
  let discountAmount = ZERO;
  switch (line.discountType ?? DiscountType.NONE) {
    case DiscountType.PERCENT:
      if (value.greaterThan(100)) throw new BadRequestException(`${label}: a percentage discount cannot exceed 100%.`);
      discountAmount = round(gross.times(value).dividedBy(HUNDRED));
      break;
    case DiscountType.AMOUNT:
      if (value.greaterThan(gross)) throw new BadRequestException(`${label}: the discount cannot exceed the line amount.`);
      discountAmount = round(value);
      break;
    default:
      discountAmount = ZERO;
  }
  const taxable = gross.minus(discountAmount);
  const taxAmount = round(taxable.times(taxRate).dividedBy(HUNDRED));
  const lineTotal = taxable.plus(taxAmount);
  assertStorable(gross, `${label}: the line amount`);
  assertStorable(lineTotal, `${label}: the line total`);
  return { gross, discountAmount, taxable, taxAmount, lineTotal };
}

export interface TotalsResult {
  subtotal: Dec;
  itemDiscountTotal: Dec;
  additionalDiscount: Dec;
  taxableAmount: Dec;
  taxTotal: Dec;
  otherCharges: Dec;
  grandTotal: Dec;
  taxBreakdown: Array<{ label: string; rate: string; taxable: string; tax: string }>;
}

export function calculateTotals(
  lines: Array<LineInput & { result: LineResult }>,
  additionalDiscountInput: string | number | undefined,
  otherChargesInput: string | number | undefined,
): TotalsResult {
  const sum = (pick: (r: LineResult) => Dec) => lines.reduce((acc, l) => acc.plus(pick(l.result)), ZERO);
  const subtotal = sum((r) => r.gross);
  const itemDiscountTotal = sum((r) => r.discountAmount);
  const taxableAmount = sum((r) => r.taxable);
  const taxTotal = sum((r) => r.taxAmount);
  const additionalDiscount = round(new D(additionalDiscountInput ?? 0));
  const otherCharges = round(new D(otherChargesInput ?? 0));
  if (additionalDiscount.isNegative() || otherCharges.isNegative()) {
    throw new BadRequestException('Additional discount and other charges cannot be negative.');
  }
  const grandTotal = taxableAmount.plus(taxTotal).plus(otherCharges).minus(additionalDiscount);
  if (grandTotal.isNegative()) throw new BadRequestException('The additional discount is larger than the quotation total.');
  assertStorable(subtotal, 'The quotation subtotal');
  assertStorable(taxableAmount.plus(taxTotal).plus(otherCharges), 'The quotation total');

  // Group tax by label + rate, e.g. "GST 18%": a breakdown, not a policy.
  const groups = new Map<string, { label: string; rate: Dec; taxable: Dec; tax: Dec }>();
  for (const line of lines) {
    const rate = new D(line.taxRate ?? 0);
    if (rate.isZero()) continue;
    const label = line.taxLabel?.trim() || 'Tax';
    const key = `${label}|${rate.toString()}`;
    const group = groups.get(key) ?? { label, rate, taxable: ZERO, tax: ZERO };
    group.taxable = group.taxable.plus(line.result.taxable);
    group.tax = group.tax.plus(line.result.taxAmount);
    groups.set(key, group);
  }

  return {
    subtotal,
    itemDiscountTotal,
    additionalDiscount,
    taxableAmount,
    taxTotal,
    otherCharges,
    grandTotal,
    taxBreakdown: [...groups.values()].map((g) => ({
      label: g.label,
      rate: g.rate.toFixed(2),
      taxable: g.taxable.toFixed(2),
      tax: g.tax.toFixed(2),
    })),
  };
}
