import { detectFileType } from './file-validation';

const pdf = (): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(32)]);
const png = (): Buffer =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16),
  ]);
const jpeg = (): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);

describe('detectFileType', () => {
  it('detects PDF, PNG and JPEG from their signatures', () => {
    expect(detectFileType(pdf(), 'anything.bin')?.mimeType).toBe('application/pdf');
    expect(detectFileType(png(), 'anything.bin')?.mimeType).toBe('image/png');
    expect(detectFileType(jpeg(), 'anything.bin')?.mimeType).toBe('image/jpeg');
  });

  it('ignores a misleading extension and trusts the bytes', () => {
    // A PDF renamed to .png is still reported as a PDF.
    expect(detectFileType(pdf(), 'invoice.png')?.mimeType).toBe('application/pdf');
  });

  it('rejects an executable disguised as a PDF', () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);

    expect(detectFileType(exe, 'vendor-profile.pdf')).toBeNull();
  });

  it('rejects an HTML file masquerading as an image', () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');

    expect(detectFileType(html, 'logo.png')).toBeNull();
  });

  it('accepts text files by extension when the content looks like text', () => {
    const text = Buffer.from('Company Name: Shree Computers\nCity: Pune\n');

    expect(detectFileType(text, 'vendor.txt')?.mimeType).toBe('text/plain');
    expect(detectFileType(text, 'vendor.csv')?.mimeType).toBe('text/csv');
  });

  it('rejects binary content claiming a .txt extension', () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff, 0xfe]);

    expect(detectFileType(binary, 'vendor.txt')).toBeNull();
  });

  it('rejects an unknown extension with no recognised signature', () => {
    expect(detectFileType(Buffer.from('plain text'), 'vendor.exe')).toBeNull();
  });

  it('handles an empty buffer without throwing', () => {
    expect(detectFileType(Buffer.alloc(0), 'empty.pdf')).toBeNull();
  });
});
