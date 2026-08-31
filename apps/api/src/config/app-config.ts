import { z } from 'zod';

const productionSecretSchema = z.string().min(32);
const strictBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');
const optionalNonBlankString = z.string().trim().min(1).optional();

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    DATABASE_URL: z.string().url(),
    OBJECT_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    LOCAL_OBJECT_STORAGE_ROOT: z.string().min(1).default('./.local/object-storage'),
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: optionalNonBlankString,
    S3_BUCKET: optionalNonBlankString,
    S3_FORCE_PATH_STYLE: strictBoolean.default('false'),
    S3_ACCESS_KEY_ID: optionalNonBlankString,
    S3_SECRET_ACCESS_KEY: optionalNonBlankString,
    S3_SERVER_SIDE_ENCRYPTION: z.enum(['AES256', 'aws:kms']).optional(),
    S3_SSE_KMS_KEY_ID: optionalNonBlankString,
    MAX_MEDIA_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
    MEDIA_STREAM_COLLECTION_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
    MAX_MEDIA_DIMENSION: z.coerce.number().int().min(1).max(12000).default(6000),
    MAX_MEDIA_PIXELS: z.coerce.number().int().positive().max(100_000_000).default(36_000_000),
    MEDIA_TEMP_ROOT: z.string().min(1).default('./.local/media-temp'),
    MEDIA_TEMP_CLEANUP_AGE_SECONDS: z.coerce.number().int().min(60).max(7 * 24 * 60 * 60).default(24 * 60 * 60),
    MAX_CONCURRENT_MEDIA_INSPECTIONS: z.coerce.number().int().min(1).max(16).default(2),
    MEDIA_UPLOAD_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(24 * 60 * 60).default(60 * 60),
    MEDIA_UPLOAD_PROCESSING_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(24 * 60 * 60).default(15 * 60),
    MEDIA_RECONCILIATION_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(24 * 60 * 60).default(60),
    MEDIA_RECONCILIATION_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
    MAX_CREATION_DOCUMENT_BYTES: z.coerce.number().int().min(1024).max(65536).default(16 * 1024),
    MOCK_GENERATION_DELAY_MS: z.coerce.number().int().min(0).max(10000).default(250),
    SESSION_TTL_SECONDS: z.coerce.number().int().min(60 * 60).max(90 * 24 * 60 * 60).default(30 * 24 * 60 * 60),
    SESSION_LAST_SEEN_UPDATE_SECONDS: z.coerce.number().int().min(60).max(24 * 60 * 60).default(15 * 60),
    EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: z.coerce.number().int().min(5 * 60).max(14 * 24 * 60 * 60).default(24 * 60 * 60),
    PASSWORD_RESET_TOKEN_TTL_SECONDS: z.coerce.number().int().min(5 * 60).max(7 * 24 * 60 * 60).default(60 * 60),
    ARGON2_MEMORY_COST: z.coerce.number().int().min(19 * 1024).max(512 * 1024).default(64 * 1024),
    ARGON2_TIME_COST: z.coerce.number().int().min(2).max(10).default(3),
    ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(4).default(1),
    EMAIL_DELIVERY_MODE: z.enum(['development', 'smtp']).default('development'),
    DEVELOPMENT_EMAIL_OUTBOX_ROOT: z.string().min(1).default('./.local/email-outbox'),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SMTP_USERNAME: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().email().optional(),
    AUTH_ACTION_URL_BASE: z.string().url().default('http://localhost:8081/auth/action'),
    AUTH_RATE_LIMIT_HMAC_SECRET: z.string().min(32).default('development-only-auth-rate-limit-secret-change-me'),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(24 * 60 * 60).default(15 * 60),
    AUTH_RATE_LIMIT_LOGIN_EMAIL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    AUTH_RATE_LIMIT_LOGIN_IP_MAX: z.coerce.number().int().min(1).max(200).default(30),
    AUTH_RATE_LIMIT_REGISTER_IP_MAX: z.coerce.number().int().min(1).max(100).default(10),
    AUTH_RATE_LIMIT_VERIFY_IP_MAX: z.coerce.number().int().min(1).max(200).default(20),
    AUTH_RATE_LIMIT_RESEND_EMAIL_MAX: z.coerce.number().int().min(1).max(100).default(5),
    AUTH_RATE_LIMIT_RESEND_IP_MAX: z.coerce.number().int().min(1).max(200).default(20),
    AUTH_RATE_LIMIT_FORGOT_EMAIL_MAX: z.coerce.number().int().min(1).max(100).default(5),
    AUTH_RATE_LIMIT_FORGOT_IP_MAX: z.coerce.number().int().min(1).max(200).default(20),
    AUTH_RATE_LIMIT_RESET_IP_MAX: z.coerce.number().int().min(1).max(200).default(20),
    TRUST_PROXY: strictBoolean.default('false'),
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:8081'),
  })
  .superRefine((config, context) => {
    if (config.OBJECT_STORAGE_DRIVER === 's3') {
      if (!config.S3_REGION) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['S3_REGION'], message: 'S3 storage requires S3_REGION.' });
      }
      if (!config.S3_BUCKET) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['S3_BUCKET'], message: 'S3 storage requires S3_BUCKET.' });
      }
      if (Boolean(config.S3_ACCESS_KEY_ID) !== Boolean(config.S3_SECRET_ACCESS_KEY)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['S3_ACCESS_KEY_ID'], message: 'S3 explicit credentials require both access key and secret access key.' });
      }
      if (config.S3_SERVER_SIDE_ENCRYPTION === 'aws:kms' && !config.S3_SSE_KMS_KEY_ID) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['S3_SSE_KMS_KEY_ID'], message: 'aws:kms server-side encryption requires S3_SSE_KMS_KEY_ID.' });
      }
    }

    if (config.NODE_ENV === 'production') {
      if (config.OBJECT_STORAGE_DRIVER !== 's3') {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['OBJECT_STORAGE_DRIVER'], message: 'Production requires OBJECT_STORAGE_DRIVER=s3 and cannot fall back to local storage.' });
      }
      if (config.EMAIL_DELIVERY_MODE !== 'smtp') {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['EMAIL_DELIVERY_MODE'], message: 'Production requires SMTP email delivery.' });
      }
      if (!config.SMTP_HOST || !config.SMTP_PORT || !config.SMTP_USERNAME || !config.SMTP_PASSWORD || !config.SMTP_FROM) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['SMTP_HOST'], message: 'Production requires complete SMTP configuration.' });
      }
      if (!productionSecretSchema.safeParse(config.AUTH_RATE_LIMIT_HMAC_SECRET).success || config.AUTH_RATE_LIMIT_HMAC_SECRET.includes('development-only')) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['AUTH_RATE_LIMIT_HMAC_SECRET'], message: 'Production requires a non-development HMAC secret of at least 32 characters.' });
      }
    }
  });

export type AppConfig = z.infer<typeof environmentSchema> & {
  CORS_ALLOWED_ORIGIN_LIST: readonly string[];
};

export function loadAppConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(environment);
  const origins = parsed.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.includes('*')) throw new Error('CORS_ALLOWED_ORIGINS must not contain a wildcard.');
  return { ...parsed, CORS_ALLOWED_ORIGIN_LIST: origins };
}
