import { StubOcrProvider } from './stub-ocr.provider';
import { computeGstinChecksum } from '../../common/utils/tax-id';

const VALID_GSTIN = `29ABCDE1234F1Z${computeGstinChecksum('29ABCDE1234F1Z')}`;

describe('StubOcrProvider', () => {
  const provider = new StubOcrProvider();

  const extract = (text: string, filename = 'vendor.txt', mimeType = 'text/plain') =>
    provider.extractVendor({
      buffer: Buffer.from(text),
      mimeType,
      originalFilename: filename,
    });

  it('returns an empty draft and an explanatory note for binary files', async () => {
    const result = await provider.extractVendor({
      buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
      mimeType: 'application/pdf',
      originalFilename: 'scan.pdf',
    });

    expect(result.overallConfidence).toBe(0);
    expect(result.note).toMatch(/No OCR provider is configured/i);
    // Critically: it invents nothing.
    expect(
      Object.values(result.draft).every((field) => field.value === null),
    ).toBe(true);
  });

  it('extracts a GSTIN only when its checksum is valid', async () => {
    const good = await extract(`GSTIN: ${VALID_GSTIN}`);
    expect(good.draft.gstin.value).toBe(VALID_GSTIN);

    const tampered = VALID_GSTIN.slice(0, 14) + (VALID_GSTIN[14] === 'A' ? 'B' : 'A');
    const bad = await extract(`GSTIN: ${tampered}`);
    expect(bad.draft.gstin.value).toBeNull();
  });

  it('extracts labelled fields from a text document', async () => {
    const result = await extract(
      [
        'Company Name: Shree Computers Pvt Ltd',
        'Contact Person: Ramesh Gupta',
        'City: Pune',
        'State: Maharashtra',
        'Email: sales@shreecomputers.example',
        `GSTIN: ${VALID_GSTIN}`,
      ].join('\n'),
    );

    expect(result.draft.businessName.value).toBe('Shree Computers Pvt Ltd');
    expect(result.draft.contactPerson.value).toBe('Ramesh Gupta');
    expect(result.draft.city.value).toBe('Pune');
    expect(result.draft.email.value).toBe('sales@shreecomputers.example');
    expect(result.draft.gstin.value).toBe(VALID_GSTIN);
  });

  it('captures a second phone number as the alternate', async () => {
    const result = await extract('Phone 9876543210 / 9123456780');

    expect(result.draft.phone.value).toBe('9876543210');
    expect(result.draft.alternatePhone.value).toBe('9123456780');
  });

  it('reports zero confidence when nothing recognisable is present', async () => {
    const result = await extract('Thank you for your business.');

    expect(result.overallConfidence).toBe(0);
    expect(result.note).toMatch(/no recognisable vendor fields/i);
  });

  it('attaches a per-field confidence to everything it extracts', async () => {
    const result = await extract(`GSTIN: ${VALID_GSTIN}`);

    expect(result.draft.gstin.confidence).toBeGreaterThan(0.5);
    expect(result.draft.businessName.confidence).toBeNull();
  });

  it('never throws on malformed input', async () => {
    await expect(extract('')).resolves.toBeDefined();
    await expect(extract('\u0000\u0001')).resolves.toBeDefined();
  });
});
