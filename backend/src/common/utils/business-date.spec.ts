import { businessDateIso, businessToday, isValidTimeZone } from './business-date';

describe('business-date', () => {
  const original = process.env.BUSINESS_TIMEZONE;
  afterEach(() => {
    process.env.BUSINESS_TIMEZONE = original;
  });

  it('uses the India calendar day by default (00:30 IST is still the previous UTC day)', () => {
    delete process.env.BUSINESS_TIMEZONE;
    const at = new Date('2026-11-19T19:00:00Z'); // 00:30 IST on 20 Nov
    expect(businessDateIso(at)).toBe('2026-11-20');
    expect(businessToday(at).toISOString()).toBe('2026-11-20T00:00:00.000Z');
  });

  it('honours a configured zone', () => {
    process.env.BUSINESS_TIMEZONE = 'America/New_York';
    expect(businessDateIso(new Date('2026-11-20T03:00:00Z'))).toBe('2026-11-19');
  });

  it('validates zone names', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
