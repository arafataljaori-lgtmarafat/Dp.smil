import { describe, expect, it } from 'vitest';

import { loadAppConfig } from '../src/config/app-config.js';

describe('Phase 2A.2 authentication configuration', () => {
  const base = { DATABASE_URL: 'postgresql://dentpilot:dentpilot@127.0.0.1:5432/dentpilot?schema=public' };

  it('rejects wildcard CORS origins in every environment', () => {
    expect(() => loadAppConfig({ ...base, CORS_ALLOWED_ORIGINS: '*' })).toThrow('must not contain a wildcard');
  });

  it('fails closed in production without SMTP and a non-development HMAC secret', () => {
    expect(() => loadAppConfig({ ...base, NODE_ENV: 'production' })).toThrow();
  });

  it('accepts complete production SMTP and a dedicated rate-limit HMAC secret', () => {
    const config = loadAppConfig({
      ...base,
      NODE_ENV: 'production',
      EMAIL_DELIVERY_MODE: 'smtp',
      SMTP_HOST: 'smtp.example.invalid',
      SMTP_PORT: '587',
      SMTP_USERNAME: 'smtp-user',
      SMTP_PASSWORD: 'smtp-password',
      SMTP_FROM: 'security@example.invalid',
      AUTH_RATE_LIMIT_HMAC_SECRET: 'production-secret-that-is-long-enough-and-not-development',
      OBJECT_STORAGE_DRIVER: 's3',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'private-dentpilot-media',
      CORS_ALLOWED_ORIGINS: 'https://app.example.invalid, https://admin.example.invalid',
    });
    expect(config.CORS_ALLOWED_ORIGIN_LIST).toEqual(['https://app.example.invalid', 'https://admin.example.invalid']);
    expect(config.EMAIL_DELIVERY_MODE).toBe('smtp');
    expect(config.OBJECT_STORAGE_DRIVER).toBe('s3');
  });

  it('rejects production local storage and incomplete S3 configuration without fallback', () => {
    expect(() => loadAppConfig({
      ...base,
      NODE_ENV: 'production',
      EMAIL_DELIVERY_MODE: 'smtp',
      SMTP_HOST: 'smtp.example.invalid',
      SMTP_PORT: '587',
      SMTP_USERNAME: 'smtp-user',
      SMTP_PASSWORD: 'smtp-password',
      SMTP_FROM: 'security@example.invalid',
      AUTH_RATE_LIMIT_HMAC_SECRET: 'production-secret-that-is-long-enough-and-not-development',
    })).toThrow('Production requires OBJECT_STORAGE_DRIVER=s3');

    expect(() => loadAppConfig({
      ...base,
      OBJECT_STORAGE_DRIVER: 's3',
    })).toThrow('S3 storage requires S3_REGION');
  });
});


describe('Phase 3B recurring reconciliation configuration', () => {
  const base = { DATABASE_URL: 'postgresql://dentpilot:dentpilot@127.0.0.1:5432/dentpilot?schema=public' };

  it('rejects unbounded or too-frequent reconciliation settings', () => {
    expect(() => loadAppConfig({ ...base, MEDIA_RECONCILIATION_INTERVAL_SECONDS: '0' })).toThrow();
    expect(() => loadAppConfig({ ...base, MEDIA_RECONCILIATION_BATCH_SIZE: '0' })).toThrow();
    expect(() => loadAppConfig({ ...base, MEDIA_RECONCILIATION_BATCH_SIZE: '1001' })).toThrow();
  });

  it('accepts explicit bounded recurring reconciliation settings', () => {
    const config = loadAppConfig({ ...base, MEDIA_RECONCILIATION_INTERVAL_SECONDS: '5', MEDIA_RECONCILIATION_BATCH_SIZE: '25' });
    expect(config.MEDIA_RECONCILIATION_INTERVAL_SECONDS).toBe(5);
    expect(config.MEDIA_RECONCILIATION_BATCH_SIZE).toBe(25);
  });
});


describe('Phase 4A CreationDocument size configuration', () => {
  const base = { DATABASE_URL: 'postgresql://dentpilot:dentpilot@127.0.0.1:5432/dentpilot?schema=public' };

  it('uses the explicit 16 KiB default when no override is supplied', () => {
    expect(loadAppConfig(base).MAX_CREATION_DOCUMENT_BYTES).toBe(16_384);
  });

  it('rejects document bounds outside the safe configured interval', () => {
    expect(() => loadAppConfig({ ...base, MAX_CREATION_DOCUMENT_BYTES: '1023' })).toThrow();
    expect(() => loadAppConfig({ ...base, MAX_CREATION_DOCUMENT_BYTES: '65537' })).toThrow();
    expect(() => loadAppConfig({ ...base, MAX_CREATION_DOCUMENT_BYTES: 'not-an-integer' })).toThrow();
  });

  it('accepts an explicit bounded document maximum', () => {
    expect(loadAppConfig({ ...base, MAX_CREATION_DOCUMENT_BYTES: '8192' }).MAX_CREATION_DOCUMENT_BYTES).toBe(8192);
  });
});
