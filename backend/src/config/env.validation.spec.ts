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
    expect(env.STORAGE_DRIVER).toBe('database');
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

  it('rejects the .env.example placeholder secrets in production only', () => {
    const placeholder = { AUTH_ACCESS_SECRET: 'replace-with-a-long-random-secret', AUTH_REFRESH_SECRET: 'replace-with-a-different-long-random-secret' };
    expect(() => validateEnv({ ...base, ...placeholder, NODE_ENV: 'production', WEB_URL: 'https://app.example.org' })).toThrow(/placeholder/i);
    expect(() => validateEnv({ ...base, ...placeholder })).not.toThrow();
  });

  it('requires DIRECT_URL in production only', () => {
    const prod = { ...base, NODE_ENV: 'production', WEB_URL: 'https://app.kenzo.test' };
    expect(() => validateEnv(prod)).toThrow(/DIRECT_URL/);
    expect(() => validateEnv({ ...prod, DIRECT_URL: 'postgresql://u:p@host/db' })).not.toThrow();
    expect(() => validateEnv({ ...base })).not.toThrow();
  });

  describe('smtp and payment alerts', () => {
    it('accepts a full SMTP configuration', () => {
      const env = validateEnv({
        ...base,
        SMTP_HOST: 'smtp.kenzo.test',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'sender',
        SMTP_PASSWORD: 'pw',
        SMTP_FROM: 'sender@kenzo.test',
      });
      expect(env.SMTP_PORT).toBe(465);
    });

    it('rejects a malformed SMTP_FROM and port', () => {
      expect(() => validateEnv({ ...base, SMTP_FROM: 'not-an-email' })).toThrow(/SMTP_FROM/);
      expect(() => validateEnv({ ...base, SMTP_PORT: '70000' })).toThrow(/SMTP_PORT/);
    });

    it('allows an empty cron token (endpoint off) but rejects a short one', () => {
      expect(() => validateEnv({ ...base, PAYMENT_ALERT_CRON_TOKEN: '' })).not.toThrow();
      expect(() => validateEnv({ ...base, PAYMENT_ALERT_CRON_TOKEN: 'short' })).toThrow(/PAYMENT_ALERT_CRON_TOKEN/);
    });
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
