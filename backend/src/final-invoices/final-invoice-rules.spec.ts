import { FinalInvoiceStatus } from '@prisma/client';
import { DEFAULT_NUMBERING, financialYearLabel, formatInvoiceNumber, sequenceFor, TRANSITIONS } from './final-invoice-rules';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('final invoice rules', () => {
  describe('financial year', () => {
    it('April starts a new Indian financial year', () => {
      expect(financialYearLabel(d('2026-03-31'), 4)).toBe('2025-26');
      expect(financialYearLabel(d('2026-04-01'), 4)).toBe('2026-27');
      expect(financialYearLabel(d('2026-11-20'), 4)).toBe('2026-27');
    });
    it('supports a calendar-year series', () => {
      expect(financialYearLabel(d('2026-01-01'), 1)).toBe('2026-27');
    });
    it('rolls the century correctly', () => {
      expect(financialYearLabel(d('2099-12-01'), 4)).toBe('2099-00');
    });
  });

  describe('sequences', () => {
    it('continuous numbering uses one series', () => {
      expect(sequenceFor(DEFAULT_NUMBERING, d('2026-11-20'))).toEqual({ key: 'FINAL_INVOICE', prefix: 'KI/INV/' });
      expect(formatInvoiceNumber('KI/INV/', 5, 7)).toBe('KI/INV/00007');
    });
    it('financial-year numbering uses one series per year (counter restarts)', () => {
      const fy = { ...DEFAULT_NUMBERING, prefix: 'INV/', padding: 4, financialYear: true };
      expect(sequenceFor(fy, d('2026-11-20'))).toEqual({ key: 'FINAL_INVOICE:2026-27', prefix: 'INV/2026-27/' });
      expect(sequenceFor(fy, d('2027-04-01')).key).toBe('FINAL_INVOICE:2027-28');
      expect(formatInvoiceNumber('INV/2026-27/', 4, 1)).toHaveLength(16);
    });
  });

  describe('lifecycle', () => {
    it('has no payment statuses and keeps cancelled final', () => {
      expect(Object.keys(TRANSITIONS).sort()).toEqual(Object.values(FinalInvoiceStatus).sort());
      expect(TRANSITIONS.CANCELLED).toEqual([]);
      expect(TRANSITIONS.ISSUED).not.toContain(FinalInvoiceStatus.DRAFT);
      expect(TRANSITIONS.SENT).toEqual([FinalInvoiceStatus.CANCELLED]);
    });
  });
});
