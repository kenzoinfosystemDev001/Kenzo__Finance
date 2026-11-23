/**
 * Plain-text quotation email. Plain text on purpose: nothing from the form is
 * rendered as HTML, so there is nothing to inject into.
 */
export interface QuotationEmailContent {
  recipientName: string;
  quotationNumber: string;
  /** Optional personal note from the sender, already validated for length. */
  message?: string | null;
  /** Sender address shown in the signature. */
  senderAddress: string;
  /** Company phone from the saved company profile; blank is skipped. */
  companyPhone?: string | null;
}

export const SUBJECT_COMPANY = 'Kenzo Infosystems';

/** Removes control characters (except line breaks) and surrounding whitespace. */
export function cleanPersonalMessage(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

export function buildQuotationEmail(input: QuotationEmailContent): { subject: string; text: string } {
  const subject = `Quotation ${input.quotationNumber} – ${SUBJECT_COMPANY}`;
  const note = cleanPersonalMessage(input.message);
  const contactLines = [input.companyPhone, input.senderAddress]
    .map((line) => (line ?? '').trim())
    .filter((line) => line.length > 0);

  const text = [
    `Dear ${input.recipientName.trim()},`,
    '',
    `Please find attached our quotation ${input.quotationNumber} for your review.`,
    ...(note ? ['', note] : []),
    '',
    'Kindly review the attached quotation and contact us if you require any clarification.',
    '',
    'We look forward to your response.',
    '',
    'Regards,',
    SUBJECT_COMPANY,
    ...contactLines,
    '',
  ].join('\n');

  return { subject, text };
}
