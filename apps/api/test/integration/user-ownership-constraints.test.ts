import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';

const canRun = process.env.DATABASE_URL !== undefined;
const checksum = 'a'.repeat(64);
const contractVersion = 'smile-simulation-v1';

function mediaInput(input: {
  id: string;
  ownerUserId: string;
  caseId: string;
  createdById: string;
  kind?: 'source' | 'derived' | 'generated';
  sourceMediaId?: string | null;
}) {
  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    caseId: input.caseId,
    kind: input.kind ?? 'source',
    purpose: input.kind === 'generated' ? 'mock_simulation_result' : 'source_photo',
    mimeType: 'image/png',
    byteSize: 1,
    width: 1,
    height: 1,
    sha256: checksum,
    storageKey: `users/${input.ownerUserId}/tests/${input.id}`,
    sourceMediaId: input.sourceMediaId ?? null,
    createdById: input.createdById,
  } as const;
}

describe.skipIf(!canRun)('PostgreSQL personal user ownership constraints', () => {
  const prisma = new PrismaService();
  const userA = randomUUID();
  const userB = randomUUID();
  const caseA = randomUUID();
  const caseB = randomUUID();
  const sourceA = randomUUID();
  const sourceB = randomUUID();
  const generatedA = randomUUID();
  const generatedB = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();
  const jobA = randomUUID();
  const jobB = randomUUID();

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.user.createMany({
      data: [
        { id: userA, email: `ownership-a-${userA}@example.invalid`, normalizedEmail: `ownership-a-${userA}@example.invalid`, displayName: 'Personal user A', status: 'active' },
        { id: userB, email: `ownership-b-${userB}@example.invalid`, normalizedEmail: `ownership-b-${userB}@example.invalid`, displayName: 'Personal user B', status: 'active' },
      ],
    });
    await prisma.patientCase.createMany({
      data: [
        { id: caseA, ownerUserId: userA, displayLabel: 'Fictional case A', status: 'active', createdById: userA },
        { id: caseB, ownerUserId: userB, displayLabel: 'Fictional case B', status: 'active', createdById: userB },
      ],
    });
    await prisma.mediaAsset.createMany({
      data: [
        mediaInput({ id: sourceA, ownerUserId: userA, caseId: caseA, createdById: userA }),
        mediaInput({ id: sourceB, ownerUserId: userB, caseId: caseB, createdById: userB }),
        mediaInput({ id: generatedA, ownerUserId: userA, caseId: caseA, createdById: userA, kind: 'generated', sourceMediaId: sourceA }),
        mediaInput({ id: generatedB, ownerUserId: userB, caseId: caseB, createdById: userB, kind: 'generated', sourceMediaId: sourceB }),
      ],
    });
    await prisma.creationProject.createMany({
      data: [
        { id: projectA, ownerUserId: userA, caseId: caseA, type: 'smile_simulation', sourceMediaId: sourceA, createdById: userA },
        { id: projectB, ownerUserId: userB, caseId: caseB, type: 'smile_simulation', sourceMediaId: sourceB, createdById: userB },
      ],
    });
    await prisma.generationJob.createMany({
      data: [
        { id: jobA, ownerUserId: userA, caseId: caseA, projectId: projectA, sourceMediaId: sourceA, idempotencyKey: 'user-a-key', requestFingerprint: 'b'.repeat(64), generationContractVersion: contractVersion, correlationId: 'test-a', providerKey: 'mock-smile-simulation', status: 'queued' },
        { id: jobB, ownerUserId: userB, caseId: caseB, projectId: projectB, sourceMediaId: sourceB, idempotencyKey: 'user-b-key', requestFingerprint: 'c'.repeat(64), generationContractVersion: contractVersion, correlationId: 'test-b', providerKey: 'mock-smile-simulation', status: 'queued' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { ownerUserId: { in: [userA, userB] } } });
    await prisma.generationVersion.deleteMany({ where: { ownerUserId: { in: [userA, userB] } } });
    await prisma.generationJob.deleteMany({ where: { ownerUserId: { in: [userA, userB] } } });
    await prisma.creationProject.deleteMany({ where: { ownerUserId: { in: [userA, userB] } } });
    await prisma.mediaAsset.deleteMany({ where: { ownerUserId: { in: [userA, userB] } } });
    await prisma.patientCase.deleteMany({ where: { ownerUserId: { in: [userA, userB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.onModuleDestroy();
  });

  it('prevents User A media from referencing User B case', async () => {
    await expect(prisma.mediaAsset.create({ data: mediaInput({ id: randomUUID(), ownerUserId: userA, caseId: caseB, createdById: userA }) })).rejects.toThrow();
  });

  it('prevents User A generated or derived media from using User B lineage', async () => {
    await expect(prisma.mediaAsset.create({ data: mediaInput({ id: randomUUID(), ownerUserId: userA, caseId: caseA, createdById: userA, kind: 'derived', sourceMediaId: sourceB }) })).rejects.toThrow();
    await expect(prisma.mediaAsset.create({ data: mediaInput({ id: randomUUID(), ownerUserId: userA, caseId: caseA, createdById: userA, kind: 'generated', sourceMediaId: sourceB }) })).rejects.toThrow();
  });

  it('prevents User A project from referencing User B media or case', async () => {
    await expect(prisma.creationProject.create({ data: { id: randomUUID(), ownerUserId: userA, caseId: caseA, type: 'smile_simulation', sourceMediaId: sourceB, createdById: userA } })).rejects.toThrow();
    await expect(prisma.creationProject.create({ data: { id: randomUUID(), ownerUserId: userA, caseId: caseB, type: 'smile_simulation', sourceMediaId: sourceA, createdById: userA } })).rejects.toThrow();
  });

  it('prevents User A job from referencing User B project or media', async () => {
    const shared = { id: randomUUID(), ownerUserId: userA, caseId: caseA, idempotencyKey: `cross-${randomUUID()}`, requestFingerprint: 'd'.repeat(64), generationContractVersion: contractVersion, correlationId: 'cross', providerKey: 'mock-smile-simulation', status: 'queued' as const };
    await expect(prisma.generationJob.create({ data: { ...shared, projectId: projectB, sourceMediaId: sourceA } })).rejects.toThrow();
    await expect(prisma.generationJob.create({ data: { ...shared, id: randomUUID(), idempotencyKey: `cross-${randomUUID()}`, projectId: projectA, sourceMediaId: sourceB } })).rejects.toThrow();
  });

  it('prevents User A generation version from referencing User B job or output', async () => {
    const shared = { id: randomUUID(), ownerUserId: userA, caseId: caseA, projectId: projectA, versionNumber: 1, sourceMediaId: sourceA, sourceSha256: checksum, providerKey: 'mock-smile-simulation', providerVersion: 'test', generationContractVersion: contractVersion, parameters: {} };
    await expect(prisma.generationVersion.create({ data: { ...shared, generationJobId: jobB, mediaAssetId: generatedA } })).rejects.toThrow();
    await expect(prisma.generationVersion.create({ data: { ...shared, id: randomUUID(), generationJobId: jobA, mediaAssetId: generatedB } })).rejects.toThrow();
  });

  it('prevents User A audit event from referencing User B case', async () => {
    await expect(prisma.auditEvent.create({
      data: { id: randomUUID(), ownerUserId: userA, actorType: 'human', actorUserId: userA, systemActorKey: null, eventType: 'AdversarialTest', caseId: caseB, projectId: null, generationJobId: null, occurredAt: new Date(), correlationId: 'audit-cross', metadata: {} },
    })).rejects.toThrow();
  });
});
