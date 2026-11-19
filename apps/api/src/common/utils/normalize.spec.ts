import {
  cleanOptional,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeTaxId,
} from './normalize';
import { toCsv } from './csv';

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
