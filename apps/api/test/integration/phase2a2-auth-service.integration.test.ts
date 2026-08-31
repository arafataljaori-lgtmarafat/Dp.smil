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

type DeliveredAction = { purpose: 'verify_email' | 'reset_password'; actionUrl: string };

function tokenFrom(url: string): string {
  const token = new URL(url).searchParams.get('token');
  if (!token) throw new Error('Expected an opaque action token in test email.');
  return token;
}

describe.skipIf(!canRun)('Phase 2A.2 AuthService lifecycle on PostgreSQL', () => {
  const prisma = new PrismaService();
  const runId = randomUUID();
  const email = `auth-service-${runId}@example.invalid`;
  const delivered: DeliveredAction[] = [];
  const config = loadAppConfig({
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: 'test',
    AUTH_ACTION_URL_BASE: 'http://localhost:8081/auth/action',
    AUTH_RATE_LIMIT_HMAC_SECRET: 'phase2a2-auth-service-test-secret-at-least-32-characters',
    AUTH_RATE_LIMIT_WINDOW_SECONDS: '60',
    AUTH_RATE_LIMIT_REGISTER_IP_MAX: '100',
    AUTH_RATE_LIMIT_VERIFY_IP_MAX: '100',
    AUTH_RATE_LIMIT_RESEND_EMAIL_MAX: '100',
    AUTH_RATE_LIMIT_RESEND_IP_MAX: '100',
    AUTH_RATE_LIMIT_LOGIN_EMAIL_MAX: '100',
    AUTH_RATE_LIMIT_LOGIN_IP_MAX: '100',
    AUTH_RATE_LIMIT_FORGOT_EMAIL_MAX: '100',
    AUTH_RATE_LIMIT_FORGOT_IP_MAX: '100',
    AUTH_RATE_LIMIT_RESET_IP_MAX: '100',
  });
  const service = new AuthService(
    prisma,
    new Argon2idPasswordHasher({ memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 }),
    new SecureSessionTokenGenerator(),
    new Sha256TokenDigest(),
    { sendAccountAction: async (input) => { delivered.push({ purpose: input.purpose, actionUrl: input.actionUrl }); } },
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
    await prisma.authRateLimitBucket.deleteMany({ where: { scope: { in: ['register-ip', 'verify-ip', 'resend-email', 'resend-ip', 'login-email', 'login-ip', 'forgot-email', 'forgot-ip', 'reset-ip'] } } });
    await prisma.onModuleDestroy();
  });

  it('keeps opaque tokens out of persistence and revokes sessions on password change and reset', async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const created = await service.register({ email, password: 'initial-password-phrase', displayName: 'Auth service test', clientIp: ip, requestId: runId });
    expect(created.status).toBe('pending_verification');
    const verification = tokenFrom(delivered.find((message) => message.purpose === 'verify_email')?.actionUrl ?? '');
    const persistedVerification = await prisma.accountActionToken.findFirstOrThrow({ where: { userId: created.id, purpose: 'verify_email' } });
    expect(persistedVerification.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(persistedVerification)).not.toContain(verification);

    await service.verifyEmail({ token: verification, clientIp: ip, requestId: runId });
    const firstLogin = await service.login({ email, password: 'initial-password-phrase', clientIp: ip, requestId: runId });
    const secondLogin = await service.login({ email, password: 'initial-password-phrase', clientIp: ip, requestId: runId });
    const persistedSession = await prisma.authSession.findUniqueOrThrow({ where: { id: firstLogin.sessionId } });
    expect(persistedSession.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(persistedSession)).not.toContain(firstLogin.token);

    const listed = await service.listSessions(created.id, firstLogin.sessionId);
    expect(listed).toHaveLength(2);
    expect(listed.filter((session) => session.currentSession)).toHaveLength(1);
    await service.revokeSession(created.id, firstLogin.sessionId, runId);
    await expect(service.authenticateBearer(firstLogin.token, runId)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    await service.changePassword({ userId: created.id, currentPassword: 'initial-password-phrase', newPassword: 'changed-password-phrase', requestId: runId });
    await expect(service.authenticateBearer(secondLogin.token, runId)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });

    const afterChange = await service.login({ email, password: 'changed-password-phrase', clientIp: ip, requestId: runId });
    await service.forgotPassword({ email, clientIp: ip, requestId: runId });
    await service.forgotPassword({ email: `unknown-${runId}@example.invalid`, clientIp: ip, requestId: runId });
    const reset = tokenFrom(delivered.filter((message) => message.purpose === 'reset_password').at(-1)?.actionUrl ?? '');
    await service.resetPassword({ token: reset, newPassword: 'reset-password-phrase', clientIp: ip, requestId: runId });
    await expect(service.authenticateBearer(afterChange.token, runId)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    const finalLogin = await service.login({ email, password: 'reset-password-phrase', clientIp: ip, requestId: runId });
    await expect(service.authenticateBearer(finalLogin.token, runId)).resolves.toMatchObject({ userId: created.id });
  });

  it('leaves exactly one usable verification token after concurrent resends', async () => {
    const secondaryEmail = `resend-${runId}@example.invalid`;
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    const created = await service.register({ email: secondaryEmail, password: 'resend-password-phrase', displayName: 'Resend race test', clientIp: ip, requestId: runId });
    await Promise.all([service.resendVerification({ email: secondaryEmail, clientIp: ip, requestId: runId }), service.resendVerification({ email: secondaryEmail, clientIp: ip, requestId: runId })]);
    const active = await prisma.accountActionToken.findMany({ where: { userId: created.id, purpose: 'verify_email', revokedAt: null, consumedAt: null } });
    expect(active).toHaveLength(1);
  });
});
