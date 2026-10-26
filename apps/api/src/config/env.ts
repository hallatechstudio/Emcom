import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Local development: read apps/api/.env (never overrides variables already set, e.g. by Docker/CI).
// Tests load .env.test explicitly instead.
if (process.env.NODE_ENV !== 'test') loadDotenv();

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes'].includes(v.toLowerCase())));

/** All runtime configuration, validated once at startup. Fails fast on missing/weak secrets. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    WORKER_METRICS_PORT: z.coerce.number().default(9464),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    CORS_ORIGINS: z.string().default('http://localhost:3001'),
    PUBLIC_WEB_URL: z.string().default('http://localhost:3001'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    REQUIRE_EMAIL_VERIFICATION: bool.default(true),
    OTP_TTL_MINUTES: z.coerce.number().int().min(2).max(60).default(10),

    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: bool.default(false),
    MAIL_FROM: z.string().default('EMCOM <no-reply@emcom.local>'),
    MAIL_TRANSPORT: z.enum(['smtp', 'memory']).default('smtp'),

    S3_ENDPOINT: z.string().optional(),
    S3_PUBLIC_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('emcom-media'),
    S3_ACCESS_KEY_ID: z.string().default(''),
    S3_SECRET_ACCESS_KEY: z.string().default(''),
    S3_FORCE_PATH_STYLE: bool.default(true),
    S3_AUTO_CREATE_BUCKET: bool.default(false),

    /** Comma-separated providers enabled for real sends. MOCK is always available outside production. */
    PUSH_PROVIDERS: z.string().default('MOCK'),
    /** Route every push to the mock transport regardless of token provider (local dev). */
    PUSH_FORCE_MOCK: bool.default(false),
    EXPO_ACCESS_TOKEN: z.string().optional(),
    FCM_PROJECT_ID: z.string().optional(),
    FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
    PUSH_INCLUDE_DETAILS: bool.default(true),
    PUSH_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(20),
    PUSH_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(6),

    OUTBOX_POLL_MS: z.coerce.number().int().min(50).default(500),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),

    CRITICAL_ALERT_COALESCE_SECONDS: z.coerce.number().int().min(0).default(120),
    CRITICAL_ALERT_USER_LIMIT: z.coerce.number().int().min(1).default(3),
    CRITICAL_ALERT_USER_WINDOW_SECONDS: z.coerce.number().int().min(10).default(600),
    REPORT_USER_LIMIT: z.coerce.number().int().min(1).default(10),
    REPORT_USER_WINDOW_SECONDS: z.coerce.number().int().min(10).default(600),

    /** Retention (days) for operational data. 0 = keep forever. Incidents and audit logs are never auto-deleted. */
    RETENTION_NOTIFICATION_DAYS: z.coerce.number().int().min(0).default(365),
    RETENTION_DELIVERY_DAYS: z.coerce.number().int().min(0).default(90),
    RETENTION_IDEMPOTENCY_DAYS: z.coerce.number().int().min(1).default(7),

    SENTRY_DSN: z.string().optional(),
    METRICS_TOKEN: z.string().optional(),
    SWAGGER_ENABLED: bool.default(true),
    TRUST_PROXY: bool.default(false),
    /** Preview/demo deployments only: load the idempotent demo dataset during startup. */
    SEED_DEMO_DATA: bool.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (/change-me|dev|example/i.test(env.JWT_ACCESS_SECRET)) {
        ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'insecure secret in production' });
      }
      if (env.PUSH_FORCE_MOCK) {
        ctx.addIssue({ code: 'custom', path: ['PUSH_FORCE_MOCK'], message: 'mock push is not allowed in production' });
      }
      if (env.MAIL_TRANSPORT !== 'smtp') {
        ctx.addIssue({ code: 'custom', path: ['MAIL_TRANSPORT'], message: 'production requires smtp' });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${msg}`);
  }
  return parsed.data;
}

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Test helper: override configuration for the current process. */
export function setEnvForTests(overrides: Partial<Env>): void {
  cached = { ...env(), ...overrides };
}
