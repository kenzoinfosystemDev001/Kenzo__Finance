import { computeGstinChecksum, isStructuredGstin, isValidGstin, isValidPan } from './tax-id';

describe('GSTIN validation', () => {
  it('accepts any 15 letters or digits, as entered from a document', () => {
    expect(isValidGstin('019291AWS192018')).toBe(true);
    expect(isValidGstin('07ABCDE1234F1Z5')).toBe(true);
    expect(isValidGstin('ABCDEFGHIJKLMNO')).toBe(true);
  });

  it('ignores surrounding and inner spaces, and case', () => {
    expect(isValidGstin('  07 abcde1234f1z5 ')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(isValidGstin('')).toBe(false);
    expect(isValidGstin('29ABCDE1234F1Z')).toBe(false); // 14 chars
    expect(isValidGstin('29ABCDE1234F1Z5X')).toBe(false); // 16 chars
  });

  it('rejects punctuation and other symbols', () => {
    expect(isValidGstin('NOT-A-GSTIN-123')).toBe(false);
    expect(isValidGstin('29ABCDE1234F1Z#')).toBe(false);
  });
});

describe('strict GSTIN check (OCR only)', () => {
  const withChecksum = (first14: string) => first14 + computeGstinChecksum(first14);

  it('accepts a real-shaped GSTIN with a correct checksum', () => {
    expect(isStructuredGstin(withChecksum('29ABCDE1234F1Z'))).toBe(true);
  });

  it('rejects a random value that is not GST-shaped', () => {
    expect(isStructuredGstin('019291AWS192018')).toBe(false);
  });
});

describe('PAN validation', () => {
  it('accepts a correctly formatted PAN', () => {
    expect(isValidPan('ABCDE1234F')).toBe(true);
    expect(isValidPan('abcde 1234f')).toBe(true);
  });

  it('rejects a malformed PAN', () => {
    expect(isValidPan('ABCDE12345')).toBe(false);
    expect(isValidPan('1234567890')).toBe(false);
    expect(isValidPan('ABCDE1234')).toBe(false);
  });
});
