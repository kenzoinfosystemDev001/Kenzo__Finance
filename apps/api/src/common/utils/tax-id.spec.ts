import {
  computeGstinChecksum,
  isValidGstin,
  isValidPan,
  panFromGstin,
} from './tax-id';

describe('GSTIN validation', () => {
  /** Builds a GSTIN with a correct checksum from its first 14 characters. */
  const withChecksum = (first14: string): string =>
    first14 + computeGstinChecksum(first14);

  it('accepts a well-formed GSTIN with a correct checksum', () => {
    const gstin = withChecksum('29ABCDE1234F1Z');
    expect(gstin).toHaveLength(15);
    expect(isValidGstin(gstin)).toBe(true);
  });

  it('rejects a GSTIN whose checksum does not match', () => {
    const valid = withChecksum('29ABCDE1234F1Z');
    const wrongCheckDigit = valid[14] === 'A' ? 'B' : 'A';
    const tampered = valid.slice(0, 14) + wrongCheckDigit;

    expect(isValidGstin(tampered)).toBe(false);
  });

  it('rejects a single-character typo in the body', () => {
    const valid = withChecksum('29ABCDE1234F1Z');
    // Change one PAN character but keep the original check digit.
    const typo = `29ABCDF1234F1Z${valid[14]}`;

    expect(isValidGstin(typo)).toBe(false);
  });

  it('rejects an invalid state code', () => {
    expect(isValidGstin(withChecksum('99ABCDE1234F1Z'))).toBe(true); // 99 = centre
    expect(isValidGstin(withChecksum('00ABCDE1234F1Z'))).toBe(false);
    expect(isValidGstin(withChecksum('45ABCDE1234F1Z'))).toBe(false);
  });

  it('rejects wrong lengths and malformed input', () => {
    expect(isValidGstin('')).toBe(false);
    expect(isValidGstin('29ABCDE1234F1Z')).toBe(false); // 14 chars
    expect(isValidGstin('29ABCDE1234F1Z5X')).toBe(false); // 16 chars
    expect(isValidGstin('NOT-A-GSTIN-123')).toBe(false);
  });

  it('requires Z at position 14', () => {
    const base = '29ABCDE1234F1Y';
    expect(isValidGstin(base + computeGstinChecksum(base))).toBe(false);
  });

  it('ignores surrounding whitespace and case', () => {
    const gstin = withChecksum('29ABCDE1234F1Z');
    expect(isValidGstin(`  ${gstin.toLowerCase()}  `)).toBe(true);
  });
});

describe('PAN validation', () => {
  it('accepts a correctly formatted PAN', () => {
    expect(isValidPan('ABCDE1234F')).toBe(true);
    expect(isValidPan('abcde1234f')).toBe(true);
  });

  it('rejects malformed PANs', () => {
    expect(isValidPan('ABCD1234F')).toBe(false); // too short
    expect(isValidPan('ABCDE12345')).toBe(false); // missing trailing letter
    expect(isValidPan('12345ABCDE')).toBe(false); // wrong order
    expect(isValidPan('')).toBe(false);
  });
});

describe('panFromGstin', () => {
  it('extracts the embedded PAN', () => {
    const gstin = `29ABCDE1234F1Z${computeGstinChecksum('29ABCDE1234F1Z')}`;
    expect(panFromGstin(gstin)).toBe('ABCDE1234F');
  });

  it('returns null when the length is wrong', () => {
    expect(panFromGstin('29ABCDE')).toBeNull();
  });
});
