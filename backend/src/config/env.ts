import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Every secret and tunable the API needs, validated once at boot.
 *
 * The process refuses to start on a bad or missing value rather than failing
 * later in a request. Nothing here is ever sent to the browser — the frontend
 * has its own, separate `NEXT_PUBLIC_*` surface.
 */

loadDotenv({ quiet: true });

const nonEmpty = (label: string) => z.string().trim().min(1, `${label} is required.`);

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    /** Comma-separated list of browser origins allowed to send credentials. */
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    /** Public base URL of the API, used to build absolute upload URLs. */
    API_PUBLIC_URL: z.string().default('http://localhost:4000'),
    APP_PUBLIC_URL: z.string().default('http://localhost:3000'),

    DB_HOST: z.string().default('127.0.0.1'),
    DB_PORT: z.coerce.number().int().default(3306),
    DB_USER: nonEmpty('DB_USER'),
    DB_PASSWORD: z.string().default(''),
    DB_NAME: nonEmpty('DB_NAME'),
    DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),

    /**
     * Must be at least 32 characters. Rotating this value invalidates every
     * access token immediately, which is the intended emergency lever.
     */
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters.'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters.'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),
    REFRESH_TOKEN_TTL_DAYS_REMEMBER: z.coerce.number().int().min(1).max(365).default(30),
    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: booleanish.default(false),

    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

    /**
     * Master switch for WhatsApp. Off until the integration ships: no codes or
     * order messages are sent, and an unverified number costs no ranking points.
     */
    WHATSAPP_ENABLED: booleanish.default(false),
    /** Which WhatsAppProvider implementation to load. */
    WHATSAPP_PROVIDER: z.enum(['log', 'meta', 'twilio']).default('log'),
    WHATSAPP_META_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_META_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_META_API_VERSION: z.string().default('v21.0'),
    WHATSAPP_TWILIO_ACCOUNT_SID: z.string().optional(),
    WHATSAPP_TWILIO_AUTH_TOKEN: z.string().optional(),
    WHATSAPP_TWILIO_FROM: z.string().optional(),

    /**
     * Email transport for sign-up and password-reset codes.
     *   log    → prints the email (and code) to the server log — development only
     *   resend → sends through Resend (https://resend.com)
     */
    EMAIL_PROVIDER: z.enum(['log', 'resend']).default('log'),
    RESEND_API_KEY: z.string().trim().optional(),
    /** Must be on a domain verified in Resend, e.g. "Nayaro Food <no-reply@yourdomain.com>". */
    EMAIL_FROM: z.string().trim().default('Nayaro Food <onboarding@resend.dev>'),

    OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
    OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    /** Minimum gap between two code requests for the same number. */
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(600).default(60),

    UPLOAD_DRIVER: z.enum(['local', 's3']).default('local'),
    UPLOAD_DIR: z.string().default('uploads'),
    UPLOAD_MAX_BYTES: z.coerce.number().int().default(3 * 1024 * 1024),

    /**
     * VAPID keypair for Web Push. Generate with:
     *   pnpm exec web-push generate-vapid-keys
     * Push is simply disabled when these are absent, so local development
     * works without them.
     */
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default('mailto:support@nayaro.tech'),

    RATE_LIMIT_ENABLED: booleanish.default(true),
    /**
     * Header carrying the real visitor IP when a CDN sits in front, e.g.
     * `cf-connecting-ip` for Cloudflare. Without it every visitor appears to
     * come from the CDN's address and they all share one rate-limit bucket.
     * Only set this when ALL traffic reaches the server through that CDN —
     * otherwise a client could send the header itself and pick its own IP.
     */
    CLIENT_IP_HEADER: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]*$/, 'CLIENT_IP_HEADER must be a header name like cf-connecting-ip.')
      .default(''),

    /** Offset that defines a platform "day" in admin reports. Nepal is +05:45. */
    PLATFORM_UTC_OFFSET: z
      .string()
      .regex(/^[+-]\d{2}:\d{2}$/, 'PLATFORM_UTC_OFFSET must look like +05:45.')
      .default('+05:45'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((v, ctx) => {
    // A provider is only usable if its credentials are actually present.
    if (v.WHATSAPP_PROVIDER === 'meta') {
      if (!v.WHATSAPP_META_PHONE_NUMBER_ID || !v.WHATSAPP_META_ACCESS_TOKEN) {
        ctx.addIssue({
          code: 'custom',
          message:
            'WHATSAPP_PROVIDER=meta requires WHATSAPP_META_PHONE_NUMBER_ID and WHATSAPP_META_ACCESS_TOKEN.',
          path: ['WHATSAPP_PROVIDER'],
        });
      }
    }
    if (v.WHATSAPP_PROVIDER === 'twilio') {
      if (!v.WHATSAPP_TWILIO_ACCOUNT_SID || !v.WHATSAPP_TWILIO_AUTH_TOKEN || !v.WHATSAPP_TWILIO_FROM) {
        ctx.addIssue({
          code: 'custom',
          message:
            'WHATSAPP_PROVIDER=twilio requires WHATSAPP_TWILIO_ACCOUNT_SID, WHATSAPP_TWILIO_AUTH_TOKEN and WHATSAPP_TWILIO_FROM.',
          path: ['WHATSAPP_PROVIDER'],
        });
      }
    }
    if (v.EMAIL_PROVIDER === 'resend' && !v.RESEND_API_KEY) {
      ctx.addIssue({ code: 'custom', message: 'EMAIL_PROVIDER=resend requires RESEND_API_KEY.', path: ['RESEND_API_KEY'] });
    }

    // The `log` provider prints codes to stdout — never acceptable in production.
    if (v.NODE_ENV === 'production') {
      if (v.EMAIL_PROVIDER !== 'resend') {
        ctx.addIssue({
          code: 'custom',
          message: 'Set EMAIL_PROVIDER=resend (with RESEND_API_KEY) in production — sign-up and password reset send codes by email.',
          path: ['EMAIL_PROVIDER'],
        });
      }
      // Only matters once WhatsApp is switched on; while it is off nothing is sent.
      if (v.WHATSAPP_ENABLED && v.WHATSAPP_PROVIDER === 'log') {
        ctx.addIssue({
          code: 'custom',
          message: 'WHATSAPP_PROVIDER=log writes verification codes to the log. Configure a real provider in production.',
          path: ['WHATSAPP_PROVIDER'],
        });
      }
      if (!v.COOKIE_SECURE) {
        ctx.addIssue({
          code: 'custom',
          message: 'COOKIE_SECURE must be true in production.',
          path: ['COOKIE_SECURE'],
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration. Fix your .env file:\n${details}\n\n` +
        'See backend/.env.example for the full list.',
    );
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Parsed, trimmed allow-list of browser origins. */
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
