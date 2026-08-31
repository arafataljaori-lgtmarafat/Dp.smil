import { describe, expect, it } from 'vitest';

import { OpaqueAuthTokenFactory } from '@dentpilot/application';

import { Argon2idPasswordHasher } from '../src/infrastructure/security/argon2id-password-hasher.adapter.js';
import { SecureSessionTokenGenerator, Sha256TokenDigest } from '../src/infrastructure/security/secure-token-primitives.adapter.js';

describe('Phase 2A.1 security primitives', () => {
  const hasher = new Argon2idPasswordHasher({ memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 });

  it('hashes with Argon2id and verifies only the correct password', async () => {
    const password = 'correct horse battery staple';
    const encodedHash = await hasher.hash(password);

    expect(encodedHash.startsWith('$argon2id$')).toBe(true);
    await expect(hasher.verify(password, encodedHash)).resolves.toBe(true);
    await expect(hasher.verify('incorrect password value', encodedHash)).resolves.toBe(false);
  });

  it('detects Argon2 parameter changes for future rehash-on-login', async () => {
    const encodedHash = await hasher.hash('correct horse battery staple');
    expect(hasher.needsRehash(encodedHash)).toBe(false);
    expect(new Argon2idPasswordHasher({ memoryCost: 32 * 1024, timeCost: 2, parallelism: 1 }).needsRehash(encodedHash)).toBe(true);
  });

  it('generates independent header-safe 256-bit session tokens and deterministic SHA-256 digests', async () => {
    const generator = new SecureSessionTokenGenerator();
    const digest = new Sha256TokenDigest();
    const first = generator.generate();
    const second = generator.generate();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(first).not.toBe(second);
    await expect(digest.digest(first)).resolves.toMatch(/^[0-9a-f]{64}$/u);
    expect(await digest.digest(first)).toBe(await digest.digest(first));
    expect(await digest.digest(first)).not.toBe(await digest.digest(second));
  });

  it('issues action tokens with an opaque plaintext token, stored digest, and configured expiry', async () => {
    const generator = new SecureSessionTokenGenerator();
    const digest = new Sha256TokenDigest();
    const now = new Date('2026-08-27T00:00:00.000Z');
    const factory = new OpaqueAuthTokenFactory(generator, digest, { now: () => now }, {
      sessionTtlSeconds: 30 * 24 * 60 * 60,
      emailVerificationTokenTtlSeconds: 24 * 60 * 60,
      passwordResetTokenTtlSeconds: 60 * 60,
    });

    const token = await factory.issueAccountAction('reset_password');
    expect(token.plaintextToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(token.tokenHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(token.tokenHash).not.toBe(token.plaintextToken);
    expect(token.expiresAt.toISOString()).toBe('2026-08-27T01:00:00.000Z');
  });
});
