import { describe, expect, it } from 'vitest';

import {
  ValidationError,
  actorAuditShape,
  assertHumanActor,
  assertSystemActor,
  normalizeEmail,
  validatePasswordPolicy,
} from '../index.js';

describe('identity domain primitives', () => {
  it('normalizes Unicode email input once at the domain boundary', () => {
    expect(normalizeEmail('  USER@Example.COM  ')).toBe('user@example.com');
    expect(normalizeEmail('u\uFF53er@EXAMPLE.com')).toBe('user@example.com');
  });

  it('rejects malformed email input', () => {
    expect(() => normalizeEmail('not-an-email')).toThrow(ValidationError);
    expect(() => normalizeEmail('user@localhost')).toThrow(ValidationError);
  });

  it('allows Unicode and spaces in long-passphrase passwords but enforces length', () => {
    expect(() => validatePasswordPolicy('correct horse battery staple')).not.toThrow();
    expect(() => validatePasswordPolicy('كلمة مرور طويلة وآمنة ١٢٣')).not.toThrow();
    expect(() => validatePasswordPolicy('short')).toThrow(ValidationError);
    expect(() => validatePasswordPolicy('a'.repeat(129))).toThrow(ValidationError);
  });

  it('validates and serializes human actors without a synthetic owner field', () => {
    const actor = { actorType: 'human' as const, userId: 'user-1', sessionId: 'session-1', requestId: 'request-1' };
    expect(assertHumanActor(actor)).toEqual(actor);
    expect(actorAuditShape(actor)).toEqual({ actorType: 'human', actorUserId: 'user-1', systemActorKey: null });
  });

  it('validates and serializes system actors without impersonating a user', () => {
    const actor = { actorType: 'system' as const, systemActorKey: 'generation-worker', ownerUserId: 'owner-1', requestId: 'request-2' };
    expect(assertSystemActor(actor)).toEqual(actor);
    expect(actorAuditShape(actor)).toEqual({ actorType: 'system', actorUserId: null, systemActorKey: 'generation-worker' });
  });
});
