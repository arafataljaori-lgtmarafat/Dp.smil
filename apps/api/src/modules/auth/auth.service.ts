import { Injectable } from '@nestjs/common';
import type { AuthRateLimiterPort, EmailDeliveryPort, PasswordHasherPort, RateLimitKeyDeriverPort, SessionTokenGeneratorPort, TokenDigestPort } from '@dentpilot/application';
import {
  AccountDisabledError,
  AccountNotVerifiedError,
  type AccountActionTokenPurpose,
  ActionTokenExpiredError,
  AuthRateLimitUnavailableError,
  ConflictError,
  EmailDeliveryUnavailableError,
  InvalidActionTokenError,
  InvalidCredentialsError,
  NotFoundError,
  RateLimitedError,
  SessionExpiredError,
  SessionRevokedError,
  UnauthenticatedError,
  ValidationError,
  normalizeEmail,
  validatePasswordPolicy,
} from '@dentpilot/domain';
import type { Prisma, UserStatus } from '@prisma/client';

import type { AppConfig } from '../../config/app-config.js';
import { AccountActionLinkFactory } from '../../infrastructure/email/account-action-link.factory.js';
import { PrismaService } from '../../infrastructure/persistence/prisma.service.js';

type TransactionClient = Prisma.TransactionClient;

export type AuthServicePasswordStateTestHooks = {
  readonly afterPasswordVerified?: (operation: 'login' | 'change-password') => Promise<void>;
};

type AuthenticatedSession = {
  readonly userId: string;
  readonly sessionId: string;
  readonly requestId: string;
};

@Injectable()
export class AuthService {
  private dummyHashPromise: Promise<string> | undefined;

  public constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly sessionTokens: SessionTokenGeneratorPort,
    private readonly tokenDigest: TokenDigestPort,
    private readonly emailDelivery: EmailDeliveryPort,
    private readonly actionLinks: AccountActionLinkFactory,
    private readonly rateLimiter: AuthRateLimiterPort,
    private readonly rateLimitKeyDeriver: RateLimitKeyDeriverPort,
    private readonly config: AppConfig,
    private readonly passwordStateTestHooks?: AuthServicePasswordStateTestHooks,
  ) {}

  public async register(input: { email: string; password: string; displayName: string; clientIp: string; requestId: string }): Promise<{ id: string; email: string; status: UserStatus }> {
    const normalizedEmail = normalizeEmail(input.email);
    validatePasswordPolicy(input.password);
    const displayName = input.displayName.trim();
    if (displayName.length < 1 || displayName.length > 120) throw new ValidationError('Display name is not valid.');
    await this.consumeMany([
      { scope: 'register-ip', preimage: `register-ip:${input.clientIp}`, limit: this.config.AUTH_RATE_LIMIT_REGISTER_IP_MAX },
    ], input.requestId);

    const passwordHash = await this.passwordHasher.hash(input.password);
    const now = new Date();
    let created: { id: string; email: string; displayName: string; verificationToken: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: normalizedEmail, normalizedEmail, displayName, status: 'pending_verification' },
        });
        await tx.passwordCredential.create({ data: { userId: user.id, passwordHash, passwordChangedAt: now } });
        const verificationToken = await this.createActionToken(tx, user.id, 'verify_email', this.config.EMAIL_VERIFICATION_TOKEN_TTL_SECONDS, now);
        await this.securityEvent(tx, user.id, 'UserRegistered', input.requestId);
        return { id: user.id, email: user.email, displayName: user.displayName, verificationToken };
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictError('Registration conflicts with existing account.');
      throw error;
    }

    try {
      await this.deliverAction(created.email, created.displayName, 'verify_email', created.verificationToken);
    } catch (error) {
      throw new EmailDeliveryUnavailableError('Registration persisted but verification email delivery failed.', { cause: String(error) });
    }
    return { id: created.id, email: created.email, status: 'pending_verification' };
  }

  public async verifyEmail(input: { token: string; clientIp: string; requestId: string }): Promise<void> {
    await this.consumeMany([{ scope: 'verify-ip', preimage: `verify-ip:${input.clientIp}`, limit: this.config.AUTH_RATE_LIMIT_VERIFY_IP_MAX }], input.requestId);
    const tokenHash = await this.tokenDigest.digest(input.token);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const action = await tx.accountActionToken.findUnique({ where: { tokenHash }, include: { user: true } });
      if (!action || action.purpose !== 'verify_email' || action.revokedAt || action.consumedAt) throw new InvalidActionTokenError('Verification token is invalid.');
      if (action.expiresAt <= now) throw new ActionTokenExpiredError('Verification token expired.');
      if (action.user.status === 'disabled') throw new AccountDisabledError('Account disabled.');
      const consumed = await tx.accountActionToken.updateMany({ where: { id: action.id, consumedAt: null, revokedAt: null }, data: { consumedAt: now } });
      if (consumed.count !== 1) throw new InvalidActionTokenError('Verification token was already used.');
      await tx.user.update({ where: { id: action.userId }, data: { status: 'active', emailVerifiedAt: now } });
      await tx.accountActionToken.updateMany({ where: { userId: action.userId, purpose: 'verify_email', consumedAt: null, revokedAt: null }, data: { revokedAt: now } });
      await this.securityEvent(tx, action.userId, 'EmailVerified', input.requestId);
    });
  }

  public async resendVerification(input: { email: string; clientIp: string; requestId: string }): Promise<void> {
    const normalizedEmail = normalizeEmail(input.email);
    await this.consumeMany([
      { scope: 'resend-email', preimage: `resend-email:${normalizedEmail}`, limit: this.config.AUTH_RATE_LIMIT_RESEND_EMAIL_MAX },
      { scope: 'resend-ip', preimage: `resend-ip:${input.clientIp}`, limit: this.config.AUTH_RATE_LIMIT_RESEND_IP_MAX },
    ], input.requestId);
    const user = await this.prisma.user.findUnique({ where: { normalizedEmail } });
    if (!user || user.status !== 'pending_verification') return;
    const now = new Date();
    const replacement = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
      const obsolete = await tx.accountActionToken.findMany({
        where: { userId: user.id, purpose: 'verify_email', consumedAt: null, revokedAt: null },
        select: { id: true },
      });
      const token = await this.createActionToken(tx, user.id, 'verify_email', this.config.EMAIL_VERIFICATION_TOKEN_TTL_SECONDS, now);
      return { token, obsoleteIds: obsolete.map((action) => action.id) };
    });
    try {
      await this.deliverAction(user.email, user.displayName, 'verify_email', replacement.token);
    } catch (error) {
      throw new EmailDeliveryUnavailableError('Verification email delivery failed.', { cause: String(error) });
    }
    if (replacement.obsoleteIds.length > 0) {
      await this.prisma.accountActionToken.updateMany({
        where: { id: { in: replacement.obsoleteIds }, consumedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  public async login(input: { email: string; password: string; clientIp: string; requestId: string }): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
    const normalizedEmail = normalizeEmail(input.email);
    await this.consumeMany([
      { scope: 'login-email', preimage: `login-email:${normalizedEmail}`, limit: this.config.AUTH_RATE_LIMIT_LOGIN_EMAIL_MAX },
      { scope: 'login-ip', preimage: `login-ip:${input.clientIp}`, limit: this.config.AUTH_RATE_LIMIT_LOGIN_IP_MAX },
    ], input.requestId);
    const user = await this.prisma.user.findUnique({ where: { normalizedEmail }, include: { passwordCredential: true } });
    const hash = user?.passwordCredential?.passwordHash ?? (await this.dummyHash());
    const validPassword = await this.passwordHasher.verify(input.password, hash);
    if (!user || !user.passwordCredential || !validPassword) {
      await this.securityEvent(this.prisma, null, 'LoginFailed', input.requestId);
      throw new InvalidCredentialsError('Invalid login credentials.');
    }
    if (user.status === 'pending_verification') throw new AccountNotVerifiedError('Account not verified.');
    if (user.status === 'disabled') throw new AccountDisabledError('Account disabled.');
    const credentialSnapshot = user.passwordCredential;
    if (!credentialSnapshot) throw new InvalidCredentialsError('Missing password credential.');
    await this.passwordStateTestHooks?.afterPasswordVerified?.('login');
    const rehash = this.passwordHasher.needsRehash(credentialSnapshot.passwordHash)
      ? await this.passwordHasher.hash(input.password)
      : null;

    const token = this.sessionTokens.generate();
    const tokenHash = await this.tokenDigest.digest(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.SESSION_TTL_SECONDS * 1000);
    const session = await this.prisma.$transaction(async (tx) => {
      const active = await tx.user.updateMany({ where: { id: user.id, status: 'active' }, data: { updatedAt: now } });
      if (active.count !== 1) throw new AccountDisabledError('Account became unavailable.');
      const credentialStillCurrent = await tx.passwordCredential.updateMany({
        where: {
          userId: user.id,
          credentialRevision: credentialSnapshot.credentialRevision,
          passwordHash: credentialSnapshot.passwordHash,
        },
        data: rehash === null
          ? { updatedAt: now }
          : { passwordHash: rehash, passwordChangedAt: now, credentialRevision: { increment: 1 } },
      });
      if (credentialStillCurrent.count !== 1) throw new InvalidCredentialsError('Invalid login credentials.');
      const created = await tx.authSession.create({ data: { id: crypto.randomUUID(), userId: user.id, tokenHash, expiresAt } });
      await this.securityEvent(tx, user.id, 'LoginSucceeded', input.requestId);
      await this.securityEvent(tx, user.id, 'SessionCreated', input.requestId, { sessionId: created.id });
      return created;
    });
    return { token, sessionId: session.id, expiresAt: session.expiresAt };
  }

  public async authenticateBearer(plaintextToken: string, requestId: string): Promise<AuthenticatedSession> {
    if (plaintextToken.length < 32 || plaintextToken.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(plaintextToken)) throw new UnauthenticatedError('Malformed bearer token.');
    const tokenHash = await this.tokenDigest.digest(plaintextToken);
    const session = await this.prisma.authSession.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!session) throw new UnauthenticatedError('Unknown session.');
    if (session.revokedAt) throw new SessionRevokedError('Session revoked.');
    if (session.expiresAt <= new Date()) throw new SessionExpiredError('Session expired.');
    if (session.user.status === 'disabled') throw new AccountDisabledError('Account disabled.');
    if (session.user.status !== 'active') throw new AccountNotVerifiedError('Account not active.');
    const now = new Date();
    if (now.getTime() - session.lastSeenAt.getTime() >= this.config.SESSION_LAST_SEEN_UPDATE_SECONDS * 1000) {
      await this.prisma.authSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { lastSeenAt: now } });
    }
    return { userId: session.userId, sessionId: session.id, requestId };
  }

  public async currentAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthenticatedError('Authenticated user missing.');
    return { id: user.id, email: user.email, displayName: user.displayName, emailVerified: user.emailVerifiedAt !== null, createdAt: user.createdAt };
  }

  public async updateDisplayName(userId: string, displayName: string) {
    const value = displayName.trim();
    if (value.length < 1 || value.length > 120) throw new ValidationError('Display name is not valid.');
    const user = await this.prisma.user.update({ where: { id: userId }, data: { displayName: value } });
    return { id: user.id, email: user.email, displayName: user.displayName, emailVerified: user.emailVerifiedAt !== null, createdAt: user.createdAt };
  }

  public async forgotPassword(input: { email: string; clientIp: string; requestId: string }): Promise<void> {
    const normalizedEmail = normalizeEmail(input.email);
    await this.consumeMany([
      { scope: 'forgot-email', preimage: `forgot-email:${normalizedEmail}`, limit: this.config.AUTH_RATE_LIMIT_FORGOT_EMAIL_MAX },
      { scope: 'forgot-ip', preimage: `forgot-ip:${input.clientIp}`, limit: this.config.AUTH_RATE_LIMIT_FORGOT_IP_MAX },
    ], input.requestId);
    const user = await this.prisma.user.findUnique({ where: { normalizedEmail } });
    if (!user || user.status !== 'active') return;
    const token = await this.prisma.$transaction(async (tx) => {
      const issued = await this.createActionToken(tx, user.id, 'reset_password', this.config.PASSWORD_RESET_TOKEN_TTL_SECONDS, new Date());
      await this.securityEvent(tx, user.id, 'PasswordResetRequested', input.requestId);
      return issued;
    });
    try {
      await this.deliverAction(user.email, user.displayName, 'reset_password', token);
    } catch (error) {
      throw new EmailDeliveryUnavailableError('Password reset email delivery failed.', { cause: String(error) });
    }
  }

  public async resetPassword(input: { token: string; newPassword: string; clientIp: string; requestId: string }): Promise<void> {
    validatePasswordPolicy(input.newPassword);
    await this.consumeMany([{ scope: 'reset-ip', preimage: `reset-ip:${input.clientIp}`, limit: this.config.AUTH_RATE_LIMIT_RESET_IP_MAX }], input.requestId);
    const tokenHash = await this.tokenDigest.digest(input.token);
    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const located = await tx.accountActionToken.findUnique({ where: { tokenHash }, select: { userId: true } });
      if (!located) throw new InvalidActionTokenError('Reset token invalid.');
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${located.userId}::uuid FOR UPDATE`;
      const action = await tx.accountActionToken.findUnique({ where: { tokenHash } });
      if (!action || action.purpose !== 'reset_password' || action.revokedAt || action.consumedAt) throw new InvalidActionTokenError('Reset token invalid.');
      if (action.expiresAt <= now) throw new ActionTokenExpiredError('Reset token expired.');
      const consumed = await tx.accountActionToken.updateMany({ where: { id: action.id, consumedAt: null, revokedAt: null }, data: { consumedAt: now } });
      if (consumed.count !== 1) throw new InvalidActionTokenError('Reset token already used.');
      await tx.passwordCredential.update({
        where: { userId: action.userId },
        data: { passwordHash, passwordChangedAt: now, credentialRevision: { increment: 1 } },
      });
      await tx.authSession.updateMany({ where: { userId: action.userId, revokedAt: null }, data: { revokedAt: now, revocationReason: 'password_reset' } });
      await tx.accountActionToken.updateMany({ where: { userId: action.userId, purpose: 'reset_password', consumedAt: null, revokedAt: null }, data: { revokedAt: now } });
      await this.securityEvent(tx, action.userId, 'PasswordResetCompleted', input.requestId);
    });
  }

  public async changePassword(input: { userId: string; currentPassword: string; newPassword: string; requestId: string }): Promise<void> {
    validatePasswordPolicy(input.newPassword);
    const credentialSnapshot = await this.prisma.passwordCredential.findUnique({ where: { userId: input.userId } });
    if (!credentialSnapshot || !(await this.passwordHasher.verify(input.currentPassword, credentialSnapshot.passwordHash))) throw new InvalidCredentialsError('Current password invalid.');
    await this.passwordStateTestHooks?.afterPasswordVerified?.('change-password');
    const now = new Date();
    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      const replaced = await tx.passwordCredential.updateMany({
        where: {
          userId: input.userId,
          credentialRevision: credentialSnapshot.credentialRevision,
          passwordHash: credentialSnapshot.passwordHash,
        },
        data: { passwordHash, passwordChangedAt: now, credentialRevision: { increment: 1 } },
      });
      if (replaced.count !== 1) throw new ConflictError('Password changed concurrently.');
      await tx.authSession.updateMany({ where: { userId: input.userId, revokedAt: null }, data: { revokedAt: now, revocationReason: 'password_changed' } });
      await this.securityEvent(tx, input.userId, 'PasswordChanged', input.requestId);
    });
  }

  public async logout(userId: string, sessionId: string, requestId: string): Promise<void> {
    const changed = await this.prisma.authSession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'logout' } });
    if (changed.count > 0) await this.securityEvent(this.prisma, userId, 'SessionRevoked', requestId, { sessionId });
  }

  public async logoutAll(userId: string, requestId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now, revocationReason: 'logout_all' } });
      await this.securityEvent(tx, userId, 'SessionRevoked', requestId, { scope: 'all' });
    });
  }

  public async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.authSession.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return sessions.map((session) => ({ sessionId: session.id, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt, currentSession: session.id === currentSessionId }));
  }

  public async revokeSession(userId: string, sessionId: string, requestId: string): Promise<void> {
    const changed = await this.prisma.authSession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'user_revoked' } });
    if (changed.count === 0) {
      const exists = await this.prisma.authSession.findFirst({ where: { id: sessionId, userId } });
      if (!exists) throw new NotFoundError('Session not found for authenticated user.');
      return;
    }
    await this.securityEvent(this.prisma, userId, 'SessionRevoked', requestId, { sessionId });
  }

  private async createActionToken(tx: TransactionClient, userId: string, purpose: AccountActionTokenPurpose, ttlSeconds: number, now: Date): Promise<string> {
    const plaintextToken = this.sessionTokens.generate();
    const tokenHash = await this.tokenDigest.digest(plaintextToken);
    await tx.accountActionToken.create({ data: { id: crypto.randomUUID(), userId, purpose, tokenHash, expiresAt: new Date(now.getTime() + ttlSeconds * 1000) } });
    return plaintextToken;
  }

  private async deliverAction(to: string, displayName: string, purpose: AccountActionTokenPurpose, plaintextToken: string): Promise<void> {
    await this.emailDelivery.sendAccountAction({ to, displayName, purpose, actionUrl: this.actionLinks.create(purpose, plaintextToken) });
  }

  private async consumeMany(entries: readonly { scope: string; preimage: string; limit: number }[], requestId: string): Promise<void> {
    try {
      for (const entry of entries) {
        const consumed = await this.rateLimiter.consume({
          scope: entry.scope,
          keyHash: this.rateLimitKeyDeriver.derive(entry.preimage),
          now: new Date(),
          windowSeconds: this.config.AUTH_RATE_LIMIT_WINDOW_SECONDS,
          limit: entry.limit,
        });
        if (!consumed.allowed) {
          if (consumed.count === entry.limit + 1) {
            await this.securityEvent(this.prisma, null, 'RateLimitExceeded', requestId, { scope: entry.scope });
          }
          throw new RateLimitedError('Authentication rate limit exceeded.', { retryAfterSeconds: String(consumed.retryAfterSeconds) });
        }
      }
    } catch (error) {
      if (error instanceof RateLimitedError) throw error;
      throw new AuthRateLimitUnavailableError('Authentication rate limiter unavailable.', { cause: String(error) });
    }
  }

  private async securityEvent(tx: Pick<PrismaService, 'securityEvent'> | TransactionClient, userId: string | null, eventType: string, requestId: string, metadata: Record<string, string> = {}): Promise<void> {
    await tx.securityEvent.create({ data: { id: crypto.randomUUID(), userId, eventType, occurredAt: new Date(), requestId, metadata } });
  }

  private async dummyHash(): Promise<string> {
    const promise = this.dummyHashPromise ?? this.passwordHasher.hash('not-a-real-user-password');
    this.dummyHashPromise = promise;
    return promise;
  }

  private isUniqueConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
  }
}
