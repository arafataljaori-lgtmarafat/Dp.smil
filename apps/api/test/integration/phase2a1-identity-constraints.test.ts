import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';

const canRun = process.env.DATABASE_URL !== undefined;
const hex = (character: string): string => character.repeat(64);

async function expectDatabaseRejection(work: () => Promise<unknown>): Promise<void> {
  await expect(work()).rejects.toThrow();
}

describe.skipIf(!canRun)('Phase 2A.1 identity PostgreSQL constraints', () => {
  const prisma = new PrismaService();
  const userId = randomUUID();
  const secondaryUserId = randomUUID();

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.user.create({
      data: {
        id: userId,
        email: 'identity-user@example.invalid',
        normalizedEmail: 'identity-user@example.invalid',
        displayName: 'Identity constraint user',
        status: 'active',
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.user.create({
      data: {
        id: secondaryUserId,
        email: 'identity-secondary@example.invalid',
        normalizedEmail: 'identity-secondary@example.invalid',
        displayName: 'Secondary constraint user',
        status: 'pending_verification',
      },
    });
  });

  afterAll(async () => {
    await prisma.securityEvent.deleteMany({ where: { userId: { in: [userId, secondaryUserId] } } });
    await prisma.accountActionToken.deleteMany({ where: { userId: { in: [userId, secondaryUserId] } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: [userId, secondaryUserId] } } });
    await prisma.passwordCredential.deleteMany({ where: { userId: { in: [userId, secondaryUserId] } } });
    await prisma.auditEvent.deleteMany({ where: { ownerUserId: { in: [userId, secondaryUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, secondaryUserId] } } });
    await prisma.onModuleDestroy();
  });

  it('enforces normalized email uniqueness and one password credential per user', async () => {
    await expectDatabaseRejection(() => prisma.user.create({
      data: {
        id: randomUUID(),
        email: 'another@example.invalid',
        normalizedEmail: 'identity-user@example.invalid',
        displayName: 'Duplicate normalized email',
        status: 'active',
      },
    }));

    await prisma.passwordCredential.create({
      data: { userId, passwordHash: '$argon2id$example', passwordChangedAt: new Date() },
    });
    await expectDatabaseRejection(() => prisma.passwordCredential.create({
      data: { userId, passwordHash: '$argon2id$duplicate', passwordChangedAt: new Date() },
    }));
  });

  it('enforces session token hash uniqueness, SHA-256 shape, and valid time range', async () => {
    const now = new Date();
    await prisma.authSession.create({
      data: { id: randomUUID(), userId, tokenHash: hex('a'), createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + 60_000) },
    });
    await expectDatabaseRejection(() => prisma.authSession.create({
      data: { id: randomUUID(), userId, tokenHash: hex('a'), createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + 60_000) },
    }));
    await expectDatabaseRejection(() => prisma.authSession.create({
      data: { id: randomUUID(), userId, tokenHash: 'not-a-sha256-digest', createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + 60_000) },
    }));
    await expectDatabaseRejection(() => prisma.authSession.create({
      data: { id: randomUUID(), userId, tokenHash: hex('b'), createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() - 1) },
    }));
  });

  it('enforces action-token hash, purpose, and time invariants', async () => {
    const now = new Date();
    await prisma.accountActionToken.create({
      data: { id: randomUUID(), userId, purpose: 'verify_email', tokenHash: hex('c'), createdAt: now, expiresAt: new Date(now.getTime() + 60_000) },
    });
    await expectDatabaseRejection(() => prisma.accountActionToken.create({
      data: { id: randomUUID(), userId, purpose: 'reset_password', tokenHash: 'bad-hash', createdAt: now, expiresAt: new Date(now.getTime() + 60_000) },
    }));
    await expectDatabaseRejection(() => prisma.$executeRaw(Prisma.sql`
      INSERT INTO "account_action_tokens" ("id", "userId", "purpose", "tokenHash", "createdAt", "expiresAt")
      VALUES (${randomUUID()}::uuid, ${userId}::uuid, 'not_a_purpose'::text::"AccountActionTokenPurpose", ${hex('d')}, ${now}, ${new Date(now.getTime() + 60_000)})
    `));
  });

  it('enforces human audit actor ownership while preserving valid human and system events', async () => {
    const occurredAt = new Date();
    await prisma.auditEvent.create({
      data: {
        id: randomUUID(),
        ownerUserId: userId,
        actorType: 'human',
        actorUserId: userId,
        systemActorKey: null,
        eventType: 'IdentityConstraintValidHuman',
        caseId: null,
        projectId: null,
        generationJobId: null,
        occurredAt,
        correlationId: 'phase2a1-human',
        metadata: {},
      },
    });
    await expectDatabaseRejection(() => prisma.$executeRaw(Prisma.sql`
      INSERT INTO "audit_events" ("id", "ownerUserId", "actorType", "actorUserId", "systemActorKey", "eventType", "occurredAt", "correlationId", "metadata")
      VALUES (${randomUUID()}::uuid, ${userId}::uuid, 'human'::"AuditActorType", NULL, NULL, 'InvalidHuman', ${occurredAt}, 'phase2a1-invalid-human', '{}'::jsonb)
    `));
    await expectDatabaseRejection(() => prisma.auditEvent.create({
      data: {
        id: randomUUID(), ownerUserId: userId, actorType: 'human', actorUserId: secondaryUserId, systemActorKey: null,
        eventType: 'CrossUserHumanAttribution', caseId: null, projectId: null, generationJobId: null, occurredAt,
        correlationId: 'phase2-security-cross-user-human', metadata: {},
      },
    }));
    await expectDatabaseRejection(() => prisma.$executeRaw(Prisma.sql`
      INSERT INTO "audit_events" ("id", "ownerUserId", "actorType", "actorUserId", "systemActorKey", "eventType", "occurredAt", "correlationId", "metadata")
      VALUES (${randomUUID()}::uuid, ${userId}::uuid, 'system'::"AuditActorType", ${userId}::uuid, 'worker', 'InvalidSystem', ${occurredAt}, 'phase2a1-invalid-system', '{}'::jsonb)
    `));
    await expect(prisma.auditEvent.create({
      data: {
        id: randomUUID(), ownerUserId: userId, actorType: 'system', actorUserId: null, systemActorKey: 'generation-worker',
        eventType: 'IdentityConstraintValidSystem', caseId: null, projectId: null, generationJobId: null, occurredAt,
        correlationId: 'phase2-security-system', metadata: {},
      },
    })).resolves.toMatchObject({ actorType: 'system', actorUserId: null, systemActorKey: 'generation-worker' });
  });
});
