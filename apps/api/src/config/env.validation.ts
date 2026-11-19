import { z } from 'zod';

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
  AUTH_ACCESS_TTL: z.string().default('15m'),
  AUTH_REFRESH_TTL: z.string().default('7d'),

  // 'local' needs a persistent disk in production; 'cloudinary' survives an
  // ephemeral container such as Render.
  STORAGE_DRIVER: z.enum(['local', 'cloudinary']).default('local'),
  STORAGE_LOCAL_ROOT: z.string().default('./storage'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),

  // Required only when STORAGE_DRIVER=cloudinary. Either CLOUDINARY_URL, or
  // the three separate values; the cross-field check below enforces that.
  CLOUDINARY_URL: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default('kenzo-erp'),

  // stub: reads text files only and never guesses at scanned documents.
  // google-vision: Google Cloud Vision REST API, requires OCR_API_KEY.
  OCR_PROVIDER: z.enum(['stub', 'google-vision']).default('stub'),
  OCR_API_KEY: z.string().optional(),
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
          'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      );
    }
  }

  if (parsed.data.OCR_PROVIDER !== 'stub' && !parsed.data.OCR_API_KEY?.trim()) {
    throw new Error(
      `OCR_PROVIDER=${parsed.data.OCR_PROVIDER} requires OCR_API_KEY. ` +
        'Set the key, or use OCR_PROVIDER=stub.',
    );
  }

  return parsed.data;
}
