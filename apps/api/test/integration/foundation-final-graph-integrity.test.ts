import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';

const canRun = process.env.DATABASE_URL !== undefined;
const checksum = 'a'.repeat(64);
const contractVersion = 'smile-simulation-v1';

function sourceAsset(input: { id: string; ownerUserId: string; caseId: string }) {
  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    caseId: input.caseId,
    kind: 'source' as const,
    purpose: 'source_photo' as const,
    mimeType: 'image/png',
    byteSize: 1,
    width: 1,
    height: 1,
    sha256: checksum,
    storageKey: `users/${input.ownerUserId}/foundation/source/${input.id}`,
    sourceMediaId: null,
    createdById: input.ownerUserId,
  };
}

function auditInput(input: { id: string; ownerUserId: string; caseId: string | null; projectId: string | null; generationJobId: string | null; eventType: string }) {
  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    actorType: 'human' as const,
    actorUserId: input.ownerUserId,
    systemActorKey: null,
    eventType: input.eventType,
    caseId: input.caseId,
    projectId: input.projectId,
    generationJobId: input.generationJobId,
    occurredAt: new Date(),
    correlationId: `foundation-${input.id}`,
    metadata: {},
  };
}

describe.skipIf(!canRun)('Foundation final PostgreSQL graph integrity', () => {
  const prisma = new PrismaService();
  const userId = randomUUID();
  const caseA = randomUUID();
  const caseB = randomUUID();
  const sourceA = randomUUID();
  const sourceB = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();
  const jobA = randomUUID();
  const jobB = randomUUID();

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.user.create({
      data: {
        id: userId,
        email: `foundation-${userId}@example.invalid`,
        normalizedEmail: `foundation-${userId}@example.invalid`,
        displayName: 'Foundation graph user',
        status: 'active',
      },
    });
    await prisma.patientCase.createMany({
      data: [
        { id: caseA, ownerUserId: userId, displayLabel: 'Foundation case A', status: 'active', createdById: userId },
        { id: caseB, ownerUserId: userId, displayLabel: 'Foundation case B', status: 'active', createdById: userId },
      ],
    });
    await prisma.mediaAsset.createMany({ data: [sourceAsset({ id: sourceA, ownerUserId: userId, caseId: caseA }), sourceAsset({ id: sourceB, ownerUserId: userId, caseId: caseB })] });
    await prisma.creationProject.createMany({
      data: [
        { id: projectA, ownerUserId: userId, caseId: caseA, type: 'smile_simulation', sourceMediaId: sourceA, createdById: userId },
        { id: projectB, ownerUserId: userId, caseId: caseB, type: 'smile_simulation', sourceMediaId: sourceB, createdById: userId },
      ],
    });
    await prisma.generationJob.createMany({
      data: [
        { id: jobA, ownerUserId: userId, caseId: caseA, projectId: projectA, sourceMediaId: sourceA, idempotencyKey: `foundation-${jobA}`, requestFingerprint: 'b'.repeat(64), generationContractVersion: contractVersion, correlationId: 'foundation-a', providerKey: 'mock-smile-simulation', status: 'queued' },
        { id: jobB, ownerUserId: userId, caseId: caseB, projectId: projectB, sourceMediaId: sourceB, idempotencyKey: `foundation-${jobB}`, requestFingerprint: 'c'.repeat(64), generationContractVersion: contractVersion, correlationId: 'foundation-b', providerKey: 'mock-smile-simulation', status: 'queued' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { ownerUserId: userId } });
    await prisma.generationVersion.deleteMany({ where: { ownerUserId: userId } });
    await prisma.generationJob.deleteMany({ where: { ownerUserId: userId } });
    await prisma.creationProject.deleteMany({ where: { ownerUserId: userId } });
    await prisma.mediaAsset.deleteMany({ where: { ownerUserId: userId } });
    await prisma.patientCase.deleteMany({ where: { ownerUserId: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.onModuleDestroy();
  });

  it('rejects Case A derived media that points to Case B source for the same user', async () => {
    await expect(prisma.mediaAsset.create({
      data: { ...sourceAsset({ id: randomUUID(), ownerUserId: userId, caseId: caseA }), kind: 'derived', sourceMediaId: sourceB },
    })).rejects.toThrow();
  });

  it('rejects Case A generated media that points to Case B source for the same user', async () => {
    await expect(prisma.mediaAsset.create({
      data: { ...sourceAsset({ id: randomUUID(), ownerUserId: userId, caseId: caseA }), kind: 'generated', purpose: 'mock_simulation_result', sourceMediaId: sourceB },
    })).rejects.toThrow();
  });

  it('accepts valid derived media lineage within the same user and case', async () => {
    const result = await prisma.mediaAsset.create({
      data: { ...sourceAsset({ id: randomUUID(), ownerUserId: userId, caseId: caseA }), kind: 'derived', sourceMediaId: sourceA },
    });
    expect(result.sourceMediaId).toBe(sourceA);
    expect(result.caseId).toBe(caseA);
  });

  it('rejects an audit with Case A and Project B', async () => {
    await expect(prisma.auditEvent.create({
      data: auditInput({ id: randomUUID(), ownerUserId: userId, caseId: caseA, projectId: projectB, generationJobId: null, eventType: 'AdversarialProject' }),
    })).rejects.toThrow();
  });

  it('rejects an audit with Case A and Project A but a job from Case B/Project B', async () => {
    await expect(prisma.auditEvent.create({
      data: auditInput({ id: randomUUID(), ownerUserId: userId, caseId: caseA, projectId: projectA, generationJobId: jobB, eventType: 'AdversarialJob' }),
    })).rejects.toThrow();
  });

  it('accepts valid case-only, case/project, and case/project/job lifecycle audits', async () => {
    const events = await prisma.$transaction([
      prisma.auditEvent.create({ data: auditInput({ id: randomUUID(), ownerUserId: userId, caseId: caseA, projectId: null, generationJobId: null, eventType: 'CaseCreated' }) }),
      prisma.auditEvent.create({ data: auditInput({ id: randomUUID(), ownerUserId: userId, caseId: caseA, projectId: projectA, generationJobId: null, eventType: 'CreationProjectCreated' }) }),
      prisma.auditEvent.create({ data: auditInput({ id: randomUUID(), ownerUserId: userId, caseId: caseA, projectId: projectA, generationJobId: jobA, eventType: 'GenerationRequested' }) }),
    ]);
    expect(events).toHaveLength(3);
  });
});
