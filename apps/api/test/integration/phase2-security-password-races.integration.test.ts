import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadAppConfig } from '../../src/config/app-config.js';
import { AccountActionLinkFactory } from '../../src/infrastructure/email/account-action-link.factory.js';
import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';
import { Argon2idPasswordHasher } from '../../src/infrastructure/security/argon2id-password-hasher.adapter.js';
import { HmacSha256RateLimitKeyDeriver, PostgresAuthRateLimiter } from '../../src/infrastructure/security/postgres-auth-rate-limiter.adapter.js';
import { SecureSessionTokenGenerator, Sha256TokenDigest } from '../../src/infrastructure/security/secure-token-primitives.adapter.js';
import { AuthService, type AuthServicePasswordStateTestHooks } from '../../src/modules/auth/auth.service.js';

const canRun = process.env.DATABASE_URL !== undefined;

type DeliveredAction = { purpose: 'verify_email' | 'reset_password'; actionUrl: string };

type Barrier = { waitUntilReached(): Promise<void>; release(): void; hook: NonNullable<AuthServicePasswordStateTestHooks['afterPasswordVerified']> };

function createBarrier(operation: 'login' | 'change-password'): Barrier {
  let reached!: () => void;
  let released!: () => void;
  const reachedPromise = new Promise<void>((resolve) => { reached = resolve; });
  const releasePromise = new Promise<void>((resolve) => { released = resolve; });
  return {
    waitUntilReached: () => reachedPromise,
    release: () => released(),
    hook: async (actualOperation) => {
      if (actualOperation !== operation) return;
      reached();
      await releasePromise;
    },
  };
}

function tokenFrom(url: string): string {
  const token = new URL(url).searchParams.get('token');
  if (!token) throw new Error('Expected a reset token in the test outbox.');
  return token;
}

describe.skipIf(!canRun)('Phase 2 security closure password races on PostgreSQL', () => {
  const prisma = new PrismaService();
  const runId = randomUUID();
  const delivered: DeliveredAction[] = [];
  const config = loadAppConfig({
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: 'test',
    AUTH_ACTION_URL_BASE: 'dentpilot://auth/action',
    AUTH_RATE_LIMIT_HMAC_SECRET: 'phase2-security-race-test-secret-at-least-32-characters',
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

  function service(hooks?: AuthServicePasswordStateTestHooks): AuthService {
    return new AuthService(
      prisma,
      new Argon2idPasswordHasher({ memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 }),
      new SecureSessionTokenGenerator(),
      new Sha256TokenDigest(),
      { sendAccountAction: async (input) => { delivered.push({ purpose: input.purpose, actionUrl: input.actionUrl }); } },
      new AccountActionLinkFactory(config.AUTH_ACTION_URL_BASE),
      new PostgresAuthRateLimiter(prisma),
      new HmacSha256RateLimitKeyDeriver(config.AUTH_RATE_LIMIT_HMAC_SECRET),
      config,
      hooks,
    );
  }

  async function registerVerified(label: string): Promise<{ readonly id: string; readonly email: string; readonly password: string; readonly ip: string }> {
    const normal = service();
    const email = `${label}-${runId}@example.invalid`;
    const password = 'phase-two-initial-password';
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const created = await normal.register({ email, password, displayName: `Race ${label}`, clientIp: ip, requestId: `${runId}-${label}` });
    const verification = delivered.filter((message) => message.purpose === 'verify_email').at(-1);
    await normal.verifyEmail({ token: tokenFrom(verification?.actionUrl ?? ''), clientIp: ip, requestId: `${runId}-${label}-verify` });
    return { id: created.id, email, password, ip };
  }

  async function resetTokenFor(email: string, ip: string, requestId: string): Promise<string> {
    const normal = service();
    await normal.forgotPassword({ email, clientIp: ip, requestId });
    const reset = delivered.filter((message) => message.purpose === 'reset_password').at(-1);
    return tokenFrom(reset?.actionUrl ?? '');
  }

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
    await prisma.authRateLimitBucket.deleteMany({ where: { keyHash: { not: '' } } });
    await prisma.onModuleDestroy();
  });

  it('does not create a session when login verified an old password before reset committed', async () => {
    const account = await registerVerified('login-reset');
    const resetToken = await resetTokenFor(account.email, account.ip, `${runId}-forgot`);
    const barrier = createBarrier('login');
    const staleLogin = service({ afterPasswordVerified: barrier.hook }).login({ email: account.email, password: account.password, clientIp: account.ip, requestId: `${runId}-stale-login` });
    await barrier.waitUntilReached();
    await service().resetPassword({ token: resetToken, newPassword: 'phase-two-reset-password', clientIp: account.ip, requestId: `${runId}-reset` });
    barrier.release();
    await expect(staleLogin).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(await prisma.authSession.count({ where: { userId: account.id } })).toBe(0);
    await expect(service().login({ email: account.email, password: 'phase-two-reset-password', clientIp: account.ip, requestId: `${runId}-fresh-login` })).resolves.toMatchObject({ sessionId: expect.any(String) });
  });

  it('does not allow stale change-password verification to overwrite an authoritative reset', async () => {
    const account = await registerVerified('change-reset');
    const resetToken = await resetTokenFor(account.email, account.ip, `${runId}-forgot`);
    const barrier = createBarrier('change-password');
    const staleChange = service({ afterPasswordVerified: barrier.hook }).changePassword({ userId: account.id, currentPassword: account.password, newPassword: 'phase-two-stale-change-password', requestId: `${runId}-stale-change` });
    await barrier.waitUntilReached();
    await service().resetPassword({ token: resetToken, newPassword: 'phase-two-authoritative-reset', clientIp: account.ip, requestId: `${runId}-reset` });
    barrier.release();
    await expect(staleChange).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(service().login({ email: account.email, password: 'phase-two-authoritative-reset', clientIp: account.ip, requestId: `${runId}-reset-login` })).resolves.toMatchObject({ sessionId: expect.any(String) });
    await expect(service().login({ email: account.email, password: 'phase-two-stale-change-password', clientIp: account.ip, requestId: `${runId}-stale-login` })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('does not create a session from stale login proof after concurrent change-password commits', async () => {
    const account = await registerVerified('login-change');
    const barrier = createBarrier('login');
    const staleLogin = service({ afterPasswordVerified: barrier.hook }).login({ email: account.email, password: account.password, clientIp: account.ip, requestId: `${runId}-stale-login` });
    await barrier.waitUntilReached();
    await service().changePassword({ userId: account.id, currentPassword: account.password, newPassword: 'phase-two-new-password', requestId: `${runId}-change` });
    barrier.release();
    await expect(staleLogin).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(await prisma.authSession.count({ where: { userId: account.id } })).toBe(0);
    await expect(service().login({ email: account.email, password: 'phase-two-new-password', clientIp: account.ip, requestId: `${runId}-new-login` })).resolves.toMatchObject({ sessionId: expect.any(String) });
  });
});
