import { validateEnv } from './env.validation';

/**
 * The environment contract is the only thing standing between a typo in a
 * hosting dashboard and a container that restart-loops with a stack trace.
 * These cases are all ones that have actually happened in deployment.
 */
describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:pass@host/db',
    AUTH_ACCESS_SECRET: 'a'.repeat(48),
    AUTH_REFRESH_SECRET: 'b'.repeat(48),
  };

  const CLOUDINARY_URL = 'cloudinary://123456789:s3cr3tValue@my-cloud';

  it('accepts a minimal valid environment', () => {
    const env = validateEnv({ ...base });

    expect(env.NODE_ENV).toBe('development');
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(env.API_PORT).toBe(4000);
  });

  it('rejects identical auth secrets', () => {
    expect(() =>
      validateEnv({
        ...base,
        AUTH_REFRESH_SECRET: base.AUTH_ACCESS_SECRET,
      }),
    ).toThrow(/must be different/i);
  });

  describe('cloudinary storage', () => {
    it('accepts CLOUDINARY_URL on its own', () => {
      const env = validateEnv({
        ...base,
        STORAGE_DRIVER: 'cloudinary',
        CLOUDINARY_URL,
      });

      expect(env.CLOUDINARY_URL).toBe(CLOUDINARY_URL);
    });

    it('accepts the three separate values instead', () => {
      expect(() =>
        validateEnv({
          ...base,
          STORAGE_DRIVER: 'cloudinary',
          CLOUDINARY_CLOUD_NAME: 'my-cloud',
          CLOUDINARY_API_KEY: '123456789',
          CLOUDINARY_API_SECRET: 's3cr3tValue',
        }),
      ).not.toThrow();
    });

    // Copying a line out of a dashboard brings the key name along with it.
    it('strips a pasted "CLOUDINARY_URL=" prefix from the value', () => {
      const env = validateEnv({
        ...base,
        STORAGE_DRIVER: 'cloudinary',
        CLOUDINARY_URL: `CLOUDINARY_URL=${CLOUDINARY_URL}`,
      });

      expect(env.CLOUDINARY_URL).toBe(CLOUDINARY_URL);
    });

    it('strips wrapping quotes and surrounding whitespace', () => {
      const env = validateEnv({
        ...base,
        STORAGE_DRIVER: 'cloudinary',
        CLOUDINARY_URL: `  "${CLOUDINARY_URL}"  `,
      });

      expect(env.CLOUDINARY_URL).toBe(CLOUDINARY_URL);
    });

    it('rejects a value that is not a cloudinary:// URL', () => {
      expect(() =>
        validateEnv({
          ...base,
          STORAGE_DRIVER: 'cloudinary',
          CLOUDINARY_URL: 'https://cloudinary.com/console',
        }),
      ).toThrow(/cloudinary:\/\//);
    });

    // The failure that cost a deployment: every value was correct, but two
    // were under names the application does not read.
    it('names misspelled variables instead of only restating the rule', () => {
      let message = '';

      try {
        validateEnv({
          ...base,
          STORAGE_DRIVER: 'cloudinary',
          CLOUD_NAME: 'my-cloud',
          CLOUDINRY_URL: CLOUDINARY_URL,
          CLOUDINARY_API_KEY: '123456789',
        });
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toContain('CLOUD_NAME');
      expect(message).toContain('CLOUDINRY_URL');
      expect(message).toMatch(/NOT read by this application/i);
      // The one correct variable is reported as recognised, so the reader can
      // see which names are right and which are not.
      expect(message).toContain('Recognised and set: CLOUDINARY_API_KEY');
    });

    it('never puts a credential in the error message', () => {
      let message = '';

      try {
        validateEnv({
          ...base,
          STORAGE_DRIVER: 'cloudinary',
          CLOUDINRY_URL: CLOUDINARY_URL,
        });
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toContain('CLOUDINRY_URL');
      expect(message).not.toContain('s3cr3tValue');
    });

    it('says a local driver needs no Cloudinary configuration', () => {
      expect(() =>
        validateEnv({ ...base, STORAGE_DRIVER: 'local' }),
      ).not.toThrow();
    });
  });

  describe('ocr', () => {
    it('refuses a non-stub provider without a key', () => {
      expect(() =>
        validateEnv({ ...base, OCR_PROVIDER: 'google-vision' }),
      ).toThrow(/OCR_API_KEY/);
    });

    it('accepts google-vision with a key', () => {
      expect(() =>
        validateEnv({
          ...base,
          OCR_PROVIDER: 'google-vision',
          OCR_API_KEY: 'key-123',
        }),
      ).not.toThrow();
    });
  });
});
