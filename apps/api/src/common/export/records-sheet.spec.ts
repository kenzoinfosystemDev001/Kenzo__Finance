import { assertExportSize, EXPORT_MAX_ROWS, recordsToSheet, requestedFormat } from './records-sheet';

describe('recordsToSheet', () => {
  it('uses the first record keys as the header row, in order', () => {
    const sheet = recordsToSheet('Vendors', [
      { 'Vendor Code': 'KI/VEN/0001', 'Vendor Name': 'Acme Traders', 'Mapped Products': 3 },
      { 'Vendor Code': 'KI/VEN/0002', 'Vendor Name': 'Beta Supplies', 'Mapped Products': 0 },
    ]);
    expect(sheet.name).toBe('Vendors');
    expect(sheet.rows[0]).toEqual(['Vendor Code', 'Vendor Name', 'Mapped Products']);
    expect(sheet.rows[1]).toEqual(['KI/VEN/0001', 'Acme Traders', 3]);
    expect(sheet.rows[2]).toEqual(['KI/VEN/0002', 'Beta Supplies', 0]);
  });

  it('writes missing values as blank cells, never as "undefined"', () => {
    const sheet = recordsToSheet('Customers', [{ Name: 'Gamma Ltd', GSTIN: undefined, Phone: null }]);
    expect(sheet.rows[1]).toEqual(['Gamma Ltd', '', '']);
  });

  it('states that there are no records instead of writing an empty sheet', () => {
    expect(recordsToSheet('Vendors', []).rows).toEqual([['No records']]);
  });
});

describe('requestedFormat', () => {
  it('returns xlsx only for xlsx, and csv for everything else', () => {
    expect(requestedFormat('xlsx')).toBe('xlsx');
    expect(requestedFormat('csv')).toBe('csv');
    expect(requestedFormat(undefined)).toBe('csv');
  });
});

describe('assertExportSize', () => {
  it('allows exports up to the limit', () => {
    expect(() => assertExportSize(EXPORT_MAX_ROWS)).not.toThrow();
    expect(() => assertExportSize(0)).not.toThrow();
  });

  it('refuses larger exports with a message that says what to do', () => {
    expect(() => assertExportSize(EXPORT_MAX_ROWS + 1)).toThrow(/Narrow the search or filters/);
  });
});
