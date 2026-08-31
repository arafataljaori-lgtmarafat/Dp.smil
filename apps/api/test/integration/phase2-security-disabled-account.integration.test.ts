import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadAppConfig } from '../../src/config/app-config.js';
import { AccountActionLinkFactory } from '../../src/infrastructure/email/account-action-link.factory.js';
import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';
import { Argon2idPasswordHasher } from '../../src/infrastructure/security/argon2id-password-hasher.adapter.js';
import { HmacSha256RateLimitKeyDeriver, PostgresAuthRateLimiter } from '../../src/infrastructure/security/postgres-auth-rate-limiter.adapter.js';
import { SecureSessionTokenGenerator, Sha256TokenDigest } from '../../src/infrastructure/security/secure-token-primitives.adapter.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';

const canRun = process.env.DATABASE_URL !== undefined;

function tokenFrom(url: string): string {
  const token = new URL(url).searchParams.get('token');
  if (!token) throw new Error('Expected verification token.');
  return token;
}

describe.skipIf(!canRun)('Phase 2 security closure disabled-account authentication', () => {
  const prisma = new PrismaService();
  const runId = randomUUID();
  const email = `disabled-session-${runId}@example.invalid`;
  const delivered: string[] = [];
  const config = loadAppConfig({
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: 'test',
    AUTH_ACTION_URL_BASE: 'dentpilot://auth/action',
    AUTH_RATE_LIMIT_HMAC_SECRET: 'phase2-security-disabled-test-secret-at-least-32-characters',
    AUTH_RATE_LIMIT_WINDOW_SECONDS: '60',
    AUTH_RATE_LIMIT_REGISTER_IP_MAX: '100',
    AUTH_RATE_LIMIT_VERIFY_IP_MAX: '200',
    AUTH_RATE_LIMIT_RESEND_EMAIL_MAX: '100',
    AUTH_RATE_LIMIT_RESEND_IP_MAX: '200',
    AUTH_RATE_LIMIT_LOGIN_EMAIL_MAX: '100',
    AUTH_RATE_LIMIT_LOGIN_IP_MAX: '200',
    AUTH_RATE_LIMIT_FORGOT_EMAIL_MAX: '100',
    AUTH_RATE_LIMIT_FORGOT_IP_MAX: '200',
    AUTH_RATE_LIMIT_RESET_IP_MAX: '200',
  });
  const service = new AuthService(
    prisma,
    new Argon2idPasswordHasher({ memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 }),
    new SecureSessionTokenGenerator(),
    new Sha256TokenDigest(),
    { sendAccountAction: async (input) => { delivered.push(input.actionUrl); } },
    new AccountActionLinkFactory(config.AUTH_ACTION_URL_BASE),
    new PostgresAuthRateLimiter(prisma),
    new HmacSha256RateLimitKeyDeriver(config.AUTH_RATE_LIMIT_HMAC_SECRET),
    config,
  );

  beforeAll(async () => prisma.onModuleInit());
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { normalizedEmail: { contains: runId } }, select: { id: true } });
    const userIds = users.map((user) => user.id);
    if (userIds.length > 0) {
      await prisma.securityEvent.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.accountActionToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.passwordCredential.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.onModuleDestroy();
  });

  it('rejects a previously valid session at the authentication boundary after the account is disabled', async () => {
    const ip = '203.0.113.77';
    const created = await service.register({ email, password: 'disabled-account-password', displayName: 'Disabled account', clientIp: ip, requestId: runId });
    await service.verifyEmail({ token: tokenFrom(delivered.at(-1) ?? ''), clientIp: ip, requestId: `${runId}-verify` });
    const session = await service.login({ email, password: 'disabled-account-password', clientIp: ip, requestId: `${runId}-login` });
    await expect(service.authenticateBearer(session.token, `${runId}-before-disable`)).resolves.toMatchObject({ userId: created.id });
    await prisma.user.update({ where: { id: created.id }, data: { status: 'disabled' } });
    await expect(service.authenticateBearer(session.token, `${runId}-after-disable`)).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });
});
