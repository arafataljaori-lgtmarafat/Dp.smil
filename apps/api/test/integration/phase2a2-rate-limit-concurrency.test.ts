import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HmacSha256RateLimitKeyDeriver, PostgresAuthRateLimiter } from '../../src/infrastructure/security/postgres-auth-rate-limiter.adapter.js';
import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';

const canRun = process.env.DATABASE_URL !== undefined;

describe.skipIf(!canRun)('Phase 2A.2 persistent auth rate limiting', () => {
  const prisma = new PrismaService();
  const limiter = new PostgresAuthRateLimiter(prisma);
  const keys = new HmacSha256RateLimitKeyDeriver('phase2a2-test-secret-that-is-long-enough-for-hmac');
  const scope = `test-login-${randomUUID()}`;
  const keyHash = keys.derive('login-email:user@example.invalid');

  beforeAll(async () => prisma.onModuleInit());
  afterAll(async () => {
    await prisma.authRateLimitBucket.deleteMany({ where: { scope } });
    await prisma.onModuleDestroy();
  });

  it('enforces one persistent limit atomically under concurrent requests without retaining the raw preimage', async () => {
    const now = new Date();
    const results = await Promise.all(Array.from({ length: 12 }, () => limiter.consume({ scope, keyHash, now, windowSeconds: 120, limit: 4 })));
    expect(results.filter((result) => result.allowed)).toHaveLength(4);
    expect(results.filter((result) => !result.allowed)).toHaveLength(8);
    const rows = await prisma.authRateLimitBucket.findMany({ where: { scope } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.keyHash).toBe(keyHash);
    expect(rows[0]?.keyHash).not.toContain('user@example.invalid');
    expect(rows[0]?.count).toBe(12);
  });
});
