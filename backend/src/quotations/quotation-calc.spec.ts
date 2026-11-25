import { BadRequestException } from '@nestjs/common';
import { DiscountType } from '@prisma/client';
import { calculateLine, calculateTotals } from './quotation-calc';

const line = (input: Parameters<typeof calculateLine>[0]) => ({ ...input, result: calculateLine(input, 0) });

describe('quotation-calc', () => {
  it('computes a line exactly with percent discount and tax (half-up to 2 places)', () => {
    const r = calculateLine({ quantity: 3, unitPrice: '1000.55', discountType: DiscountType.PERCENT, discountValue: '10', taxRate: '18' }, 0);
    expect(r.gross.toFixed(2)).toBe('3001.65');
    expect(r.discountAmount.toFixed(2)).toBe('300.17'); // 300.165 rounds half-up
    expect(r.taxable.toFixed(2)).toBe('2701.48');
    expect(r.taxAmount.toFixed(2)).toBe('486.27'); // 486.2664
    expect(r.lineTotal.toFixed(2)).toBe('3187.75');
  });

  it('avoids floating point drift (0.1 x 3)', () => {
    expect(calculateLine({ quantity: 3, unitPrice: '0.10' }, 0).gross.toFixed(2)).toBe('0.30');
  });

  it('applies other charges and the additional discount after tax', () => {
    const totals = calculateTotals(
      [line({ quantity: 2, unitPrice: '100', taxRate: '18', taxLabel: 'GST' }), line({ quantity: 1, unitPrice: '50' })],
      '10',
      '25',
    );
    expect(totals.subtotal.toFixed(2)).toBe('250.00');
    expect(totals.taxTotal.toFixed(2)).toBe('36.00');
    expect(totals.grandTotal.toFixed(2)).toBe('301.00'); // 250 + 36 + 25 - 10
    expect(totals.taxBreakdown).toEqual([{ label: 'GST', rate: '18.00', taxable: '200.00', tax: '36.00' }]);
  });

  it('rejects an amount discount larger than the line', () => {
    expect(() => calculateLine({ quantity: 1, unitPrice: '10', discountType: DiscountType.AMOUNT, discountValue: '11' }, 0)).toThrow(BadRequestException);
  });

  it('rejects an additional discount larger than the total', () => {
    expect(() => calculateTotals([line({ quantity: 1, unitPrice: '10' })], '11', '0')).toThrow(BadRequestException);
  });

  it('rejects a line the Decimal(14,2) columns cannot store (instead of a database 500)', () => {
    expect(() => calculateLine({ quantity: 1000, unitPrice: '1000000000' }, 0)).toThrow(/maximum supported amount/);
  });

  it('rejects totals that overflow even when each line fits', () => {
    const big = line({ quantity: 1, unitPrice: '999999999999.99' });
    expect(() => calculateTotals([big, big], '0', '0')).toThrow(/maximum supported amount/);
  });

  it('accepts the largest storable amount', () => {
    expect(calculateLine({ quantity: 1, unitPrice: '999999999999.99' }, 0).lineTotal.toFixed(2)).toBe('999999999999.99');
  });
});
