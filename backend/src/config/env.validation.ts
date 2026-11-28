import { z } from 'zod';
import { isValidTimeZone } from '../common/utils/business-date';

/** The only Cloudinary variable names the application reads. */
const CLOUDINARY_KEYS = [
  'CLOUDINARY_URL',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_FOLDER',
] as const;

function hasValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Repairs the two ways a connection string gets mangled when it is copied out
 * of a dashboard: the `KEY=` prefix comes along with the value, and the value
 * arrives wrapped in quotes. Both produce a string that is not a URL at all,
 * and the resulting failure points at the wrong thing.
 */
function normalizeCloudinaryUrl(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const cleaned = value
    .trim()
    .replace(/^CLOUDINARY_URL\s*=\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  // `CLOUDINARY_URL=` (as in .env.example) reaches here as ''. That means
  // "not set", not "set to an invalid URL", or STORAGE_DRIVER=local could
  // not boot from the example file.
  return cleaned === '' ? undefined : cleaned;
}

/**
 * Says what was actually found, not just what is required.
 *
 * A misspelled or wrongly-named variable is indistinguishable from a missing
 * one if the error only restates the requirement, so this also names any
 * other Cloudinary-looking variable that is set - which is what a typo such
 * as CLOUD_NAME or CLOUDINRY_URL looks like from in here. Names only; a
 * credential must never reach a log.
 */
function describeCloudinaryEnv(raw: Record<string, unknown>): string {
  const recognised = CLOUDINARY_KEYS.filter((key) => hasValue(raw[key]));

  const unrecognised = Object.keys(raw).filter(
    (key) =>
      /cloudin|cloud_name/i.test(key) &&
      !(CLOUDINARY_KEYS as readonly string[]).includes(key) &&
      hasValue(raw[key]),
  );

  const lines = [
    recognised.length
      ? `  Recognised and set: ${recognised.join(', ')}`
      : '  Recognised and set: none',
  ];

  if (unrecognised.length) {
    lines.push(
      `  Set but NOT read by this application: ${unrecognised.join(', ')}`,
      '  -> These look like Cloudinary variables under the wrong name.',
      `  -> Rename them to one of: ${CLOUDINARY_KEYS.join(', ')}`,
    );
  }

  return lines.join('\n');
}

/**
 * Environment contract. Validated once at startup so the process fails fast
 * and loudly instead of throwing an obscure error on the first request.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),

  // Render, Railway, Heroku and most PaaS hosts inject PORT and require the
  // process to bind to it. API_PORT stays for local development, but PORT
  // wins when the host sets it - otherwise the platform sees no open port and
  // marks the deploy as failed.
  PORT: z.coerce.number().int().positive().optional(),
  API_PORT: z.coerce.number().int().positive().default(4000),

  // Browser origin allowed by CORS. In production this must be the deployed
  // frontend URL, with no trailing slash.
  WEB_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required (Neon PostgreSQL connection string)'),
  DIRECT_URL: z.string().optional(),

  AUTH_ACCESS_SECRET: z
    .string()
    .min(32, 'AUTH_ACCESS_SECRET must be at least 32 characters'),
  AUTH_REFRESH_SECRET: z
    .string()
    .min(32, 'AUTH_REFRESH_SECRET must be at least 32 characters'),
  // Same grammar AuthService.parseTtlMs accepts; anything else would boot
  // fine and then fail every sign-in.
  AUTH_ACCESS_TTL: z
    .string()
    .trim()
    .regex(/^\d+[smhd]$/, 'AUTH_ACCESS_TTL must look like 15m, 2h or 7d')
    .default('15m'),
  AUTH_REFRESH_TTL: z
    .string()
    .trim()
    .regex(/^\d+[smhd]$/, 'AUTH_REFRESH_TTL must look like 15m, 2h or 7d')
    .default('7d'),

  // Where NEW files are written. 'database' (default) keeps every file in
  // PostgreSQL (table stored_files). 'local' needs a persistent disk;
  // 'cloudinary' is a remote file service. Files saved earlier stay readable
  // whichever is chosen.
  STORAGE_DRIVER: z.enum(['database', 'local', 'cloudinary']).default('database'),
  STORAGE_LOCAL_ROOT: z.string().default('./storage'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),

  // Required only when STORAGE_DRIVER=cloudinary. Either CLOUDINARY_URL, or
  // the three separate values; the cross-field check below enforces that.
  CLOUDINARY_URL: z.preprocess(
    normalizeCloudinaryUrl,
    z
      .string()
      .startsWith(
        'cloudinary://',
        'CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>',
      )
      .optional(),
  ),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default('kenzo-erp'),

  // stub: reads text files only and never guesses at scanned documents.
  // tesseract: free, open-source engine that runs in the API; reads PNG/JPEG/WEBP. No key needed.
  // google-vision: Google Cloud Vision REST API, requires OCR_API_KEY.
  OCR_PROVIDER: z.enum(['stub', 'tesseract', 'google-vision']).default('stub'),
  OCR_API_KEY: z.string().optional(),

  // Calendar day used for "today", default dates and overdue checks.
  BUSINESS_TIMEZONE: z.string().trim().optional(),

  // Outgoing mail (quotation emails). Sending is refused with a 503 until
  // SMTP_HOST is set; the API still starts without it.
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
  SMTP_USER: z.string().trim().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().trim().email('SMTP_FROM must be an email address').optional().or(z.literal('')),

  // Payment reminders. Besides the hourly in-process timer, an external
  // scheduler may call POST /api/v1/payment-alerts/cron with header
  // x-alert-token = PAYMENT_ALERT_CRON_TOKEN (min 16 chars, else off).
  PAYMENT_ALERTS_ENABLED: z.enum(['true', 'false']).optional(),
  PAYMENT_ALERT_CRON_TOKEN: z
    .string()
    .min(16, 'PAYMENT_ALERT_CRON_TOKEN must be at least 16 characters')
    .optional()
    .or(z.literal('')),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration.\n${details}\n\n` +
        'Copy .env.example to .env and fill the missing values.',
    );
  }

  // AUTH secrets must differ: reusing one secret lets a refresh token be
  // replayed as an access token.
  if (parsed.data.AUTH_ACCESS_SECRET === parsed.data.AUTH_REFRESH_SECRET) {
    throw new Error(
      'AUTH_ACCESS_SECRET and AUTH_REFRESH_SECRET must be different values.',
    );
  }

  // The .env.example placeholders are long enough to pass the length rule;
  // a production deployment copied from the template would sign tokens with
  // a publicly known secret.
  if (parsed.data.NODE_ENV === 'production') {
    for (const key of ['AUTH_ACCESS_SECRET', 'AUTH_REFRESH_SECRET'] as const) {
      if (/replace-with|changeme|change-me|example|placeholder/i.test(parsed.data[key])) {
        throw new Error(`${key} still holds the .env.example placeholder. Generate a random secret (e.g. openssl rand -base64 48).`);
      }
    }
    // schema.prisma declares directUrl = env("DIRECT_URL"); migrations fail without it.
    if (!parsed.data.DIRECT_URL?.trim()) {
      throw new Error('DIRECT_URL is required in production (the non-pooled Neon connection string used for migrations).');
    }
  }

  // Both checks fail at startup rather than on the user's first upload, when
  // they would surface as an opaque 500 after a file had been chosen.
  if (parsed.data.STORAGE_DRIVER === 'cloudinary') {
    const hasUrl = Boolean(parsed.data.CLOUDINARY_URL);
    const hasTriple =
      Boolean(parsed.data.CLOUDINARY_CLOUD_NAME) &&
      Boolean(parsed.data.CLOUDINARY_API_KEY) &&
      Boolean(parsed.data.CLOUDINARY_API_SECRET);

    if (!hasUrl && !hasTriple) {
      throw new Error(
        'STORAGE_DRIVER=cloudinary requires either CLOUDINARY_URL, or all of ' +
          'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.\n' +
          describeCloudinaryEnv(raw) +
          '\n  Or set STORAGE_DRIVER=database to keep files in PostgreSQL.',
      );
    }
  }

  // Only the cloud provider needs a key; stub and tesseract run without one.
  if (parsed.data.OCR_PROVIDER === 'google-vision' && !parsed.data.OCR_API_KEY?.trim()) {
    throw new Error(
      `OCR_PROVIDER=${parsed.data.OCR_PROVIDER} requires OCR_API_KEY. ` +
        'Set the key, or use OCR_PROVIDER=tesseract.',
    );
  }

  if (parsed.data.BUSINESS_TIMEZONE && !isValidTimeZone(parsed.data.BUSINESS_TIMEZONE)) {
    throw new Error(`BUSINESS_TIMEZONE="${parsed.data.BUSINESS_TIMEZONE}" is not a valid IANA time zone (e.g. Asia/Kolkata).`);
  }

  return parsed.data;
}
