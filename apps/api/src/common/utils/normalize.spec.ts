import {
  cleanMultiline,
  cleanOptional,
  normalizedNameFilter,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeTaxId,
} from './normalize';
import { toCsv } from './csv';
import { businessDayEnd, businessDayStart, businessToday } from './business-date';

describe('normalizeName', () => {
  it('treats punctuation and case differences as the same name', () => {
    expect(normalizeName('Shree Computers Pvt. Ltd.')).toBe(
      normalizeName('SHREE COMPUTERS PVT LTD'),
    );
  });

  it('collapses repeated whitespace', () => {
    expect(normalizeName('  Shree   Computers  ')).toBe('shree computers');
  });

  it('keeps genuinely different names distinct', () => {
    expect(normalizeName('Shree Computers')).not.toBe(
      normalizeName('Shree Computer Services'),
    );
  });
});

describe('normalizePhone', () => {
  it('strips formatting but keeps a leading +', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizePhone('(020) 2345 6789')).toBe('02023456789');
  });

  it('returns undefined for blank or digitless input', () => {
    expect(normalizePhone('   ')).toBeUndefined();
    expect(normalizePhone('N/A')).toBeUndefined();
    expect(normalizePhone(null)).toBeUndefined();
  });
});

describe('normalizeTaxId and normalizeEmail', () => {
  it('uppercases and strips whitespace from tax ids', () => {
    expect(normalizeTaxId(' 29abcde1234f1z5 ')).toBe('29ABCDE1234F1Z5');
  });

  it('lowercases emails', () => {
    expect(normalizeEmail('  Sales@Example.COM ')).toBe('sales@example.com');
  });

  it('maps empty strings to undefined so they are stored as NULL', () => {
    expect(normalizeTaxId('')).toBeUndefined();
    expect(normalizeEmail('   ')).toBeUndefined();
    expect(cleanOptional('  ')).toBeUndefined();
  });
});

describe('toCsv', () => {
  it('quotes values containing commas, quotes or newlines', () => {
    const csv = toCsv([{ Name: 'Shree, Computers', Note: 'He said "yes"' }]);

    expect(csv).toContain('"Shree, Computers"');
    expect(csv).toContain('"He said ""yes"""');
  });

  it('neutralises formula injection', () => {
    const csv = toCsv([{ Name: '=cmd|calc', Other: '+1', Third: '-2', Fourth: '@x' }]);

    expect(csv).toContain("'=cmd|calc");
    expect(csv).toContain("'+1");
    expect(csv).toContain("'-2");
    expect(csv).toContain("'@x");
  });

  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('normalizedNameFilter', () => {
  it('searches by the normalised term', () => {
    expect(normalizedNameFilter('Shree & Co.')).toEqual({ contains: 'shree co' });
  });

  it('matches nothing for a punctuation-only term instead of everything', () => {
    expect(normalizedNameFilter('/')).toEqual({ in: [] });
    expect(normalizedNameFilter(' & ')).toEqual({ in: [] });
  });
});

describe('cleanMultiline', () => {
  it('keeps line breaks so numbered terms stay on separate lines', () => {
    expect(cleanMultiline('1. Prices ex-works  \r\n2.   50% advance')).toBe(
      '1. Prices ex-works\n2. 50% advance',
    );
  });

  it('collapses runs of blank lines to one and trims the ends', () => {
    expect(cleanMultiline('\n\nA\n\n\n\nB\n\n')).toBe('A\n\nB');
  });

  it('returns undefined for blank input', () => {
    expect(cleanMultiline('  \n \t ')).toBeUndefined();
    expect(cleanMultiline(null)).toBeUndefined();
  });
});

describe('businessToday', () => {
  it('uses the business calendar date, not the UTC one', () => {
    // 02:00 IST on 21 Nov is still 20 Nov in UTC.
    expect(businessToday(new Date('2026-11-20T20:30:00.000Z')).toISOString()).toBe(
      '2026-11-21T00:00:00.000Z',
    );
  });

  it('agrees with UTC once both are on the same day', () => {
    expect(businessToday(new Date('2026-11-21T10:00:00.000Z')).toISOString()).toBe(
      '2026-11-21T00:00:00.000Z',
    );
  });
});

describe('businessDayStart / businessDayEnd', () => {
  it('starts an IST calendar day at 18:30 UTC the evening before', () => {
    expect(businessDayStart('2026-11-20').toISOString()).toBe('2026-11-19T18:30:00.000Z');
  });

  it('ends a day (exclusive) where the next one starts', () => {
    expect(businessDayEnd('2026-11-20').toISOString()).toBe('2026-11-20T18:30:00.000Z');
  });

  it('accepts a full ISO date-time and uses only its date part', () => {
    expect(businessDayStart('2026-11-20T23:59:00.000Z').toISOString()).toBe('2026-11-19T18:30:00.000Z');
  });
});
