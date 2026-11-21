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

  // 'local' needs a persistent disk in production; 'cloudinary' survives an
  // ephemeral container such as Render.
  STORAGE_DRIVER: z.enum(['local', 'cloudinary']).default('local'),
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
  // google-vision: Google Cloud Vision REST API, requires OCR_API_KEY.
  OCR_PROVIDER: z.enum(['stub', 'google-vision']).default('stub'),
  OCR_API_KEY: z.string().optional(),

  // Calendar day used for "today", default dates and overdue checks.
  BUSINESS_TIMEZONE: z.string().trim().optional(),
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
          '\n  Or set STORAGE_DRIVER=local to run without remote storage.',
      );
    }
  }

  if (parsed.data.OCR_PROVIDER !== 'stub' && !parsed.data.OCR_API_KEY?.trim()) {
    throw new Error(
      `OCR_PROVIDER=${parsed.data.OCR_PROVIDER} requires OCR_API_KEY. ` +
        'Set the key, or use OCR_PROVIDER=stub.',
    );
  }

  if (parsed.data.BUSINESS_TIMEZONE && !isValidTimeZone(parsed.data.BUSINESS_TIMEZONE)) {
    throw new Error(`BUSINESS_TIMEZONE="${parsed.data.BUSINESS_TIMEZONE}" is not a valid IANA time zone (e.g. Asia/Kolkata).`);
  }

  return parsed.data;
}
