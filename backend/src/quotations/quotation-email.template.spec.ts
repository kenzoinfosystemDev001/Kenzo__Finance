import { buildQuotationEmail, cleanPersonalMessage } from './quotation-email.template';

const base = { recipientName: 'Asha Rao', quotationNumber: 'KI/QT/00042', senderAddress: 'jitender.saini@kenzoinfosystem.com' };

describe('buildQuotationEmail', () => {
  it('uses the agreed subject with the quotation number', () => {
    expect(buildQuotationEmail(base).subject).toBe('Quotation KI/QT/00042 – Kenzo Infosystems');
  });

  it('addresses the recipient and names the attachment in the body', () => {
    const { text } = buildQuotationEmail(base);
    expect(text.startsWith('Dear Asha Rao,')).toBe(true);
    expect(text).toContain('Please find attached our quotation KI/QT/00042 for your review.');
    expect(text).toContain('Regards,\nKenzo Infosystems\njitender.saini@kenzoinfosystem.com');
  });

  it('includes the personal message only when one is given', () => {
    expect(buildQuotationEmail(base).text).not.toContain('Thank you for the enquiry');
    const withNote = buildQuotationEmail({ ...base, message: 'Thank you for the enquiry.' }).text;
    expect(withNote).toContain('\n\nThank you for the enquiry.\n\n');
  });

  it('adds the company phone when the profile has one and skips blanks', () => {
    expect(buildQuotationEmail({ ...base, companyPhone: '+91 11 0000 0000' }).text).toContain('+91 11 0000 0000');
    expect(buildQuotationEmail({ ...base, companyPhone: '   ' }).text).not.toMatch(/\n\s*\n\s*$/);
  });
});

describe('cleanPersonalMessage', () => {
  it('drops control characters and normalises line endings', () => {
    expect(cleanPersonalMessage('Hello\u0007\r\nThere  ')).toBe('Hello\nThere');
  });

  it('returns an empty string for missing input', () => {
    expect(cleanPersonalMessage(undefined)).toBe('');
    expect(cleanPersonalMessage(null)).toBe('');
  });
});
