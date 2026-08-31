import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generationWorkerActorKey } from '../../src/common/system-actor.js';
import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';

const canRun = process.env.DATABASE_URL !== undefined;
const checksum = 'a'.repeat(64);
const contractVersion = 'smile-simulation-v1';

function sourceMedia(input: { id: string; ownerUserId: string; caseId: string }) {
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
    storageKey: `users/${input.ownerUserId}/phase13/source/${input.id}`,
    sourceMediaId: null,
    createdById: input.ownerUserId,
  };
}

function jobInput(input: { id: string; ownerUserId: string; caseId: string; projectId: string; sourceMediaId: string; status?: 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled'; requestFingerprint?: string; startedAt?: Date | null; finishedAt?: Date | null; errorCode?: string | null }) {
  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    caseId: input.caseId,
    projectId: input.projectId,
    sourceMediaId: input.sourceMediaId,
    idempotencyKey: `phase13-${input.id}`,
    requestFingerprint: input.requestFingerprint ?? 'b'.repeat(64),
    generationContractVersion: contractVersion,
    correlationId: 'phase13',
    providerKey: 'mock-smile-simulation',
    status: input.status ?? 'queued',
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    errorCode: input.errorCode ?? null,
  };
}

describe.skipIf(!canRun)('Phase 1.3 PostgreSQL personal graph and durable invariants', () => {
  const prisma = new PrismaService();
  const userId = randomUUID();
  const caseA = randomUUID();
  const caseB = randomUUID();
  const sourceA = randomUUID();
  const sourceB = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();
  const jobA = randomUUID();
  const generatedA = randomUUID();
  const generatedWrongSource = randomUUID();

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.user.create({
      data: {
        id: userId,
        email: `phase13-${userId}@example.invalid`,
        normalizedEmail: `phase13-${userId}@example.invalid`,
        displayName: 'Phase 1.3 graph test user',
        status: 'active',
      },
    });
    await prisma.patientCase.createMany({
      data: [
        { id: caseA, ownerUserId: userId, displayLabel: 'Case A', status: 'active', createdById: userId },
        { id: caseB, ownerUserId: userId, displayLabel: 'Case B', status: 'active', createdById: userId },
      ],
    });
    await prisma.mediaAsset.createMany({ data: [sourceMedia({ id: sourceA, ownerUserId: userId, caseId: caseA }), sourceMedia({ id: sourceB, ownerUserId: userId, caseId: caseB })] });
    await prisma.creationProject.createMany({
      data: [
        { id: projectA, ownerUserId: userId, caseId: caseA, type: 'smile_simulation', sourceMediaId: sourceA, createdById: userId },
        { id: projectB, ownerUserId: userId, caseId: caseB, type: 'smile_simulation', sourceMediaId: sourceB, createdById: userId },
      ],
    });
    await prisma.generationJob.create({ data: jobInput({ id: jobA, ownerUserId: userId, caseId: caseA, projectId: projectA, sourceMediaId: sourceA }) });
    await prisma.mediaAsset.createMany({
      data: [
        { ...sourceMedia({ id: generatedA, ownerUserId: userId, caseId: caseA }), kind: 'generated', purpose: 'mock_simulation_result', sourceMediaId: sourceA, storageKey: `users/${userId}/phase13/generated/${generatedA}` },
        { ...sourceMedia({ id: generatedWrongSource, ownerUserId: userId, caseId: caseA }), kind: 'generated', purpose: 'mock_simulation_result', sourceMediaId: sourceA, storageKey: `users/${userId}/phase13/generated/${generatedWrongSource}` },
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

  it('uses an explicitly named system actor key for generation work', () => {
    expect(generationWorkerActorKey).toBe('generation-worker');
  });

  it('rejects a same-user project whose source belongs to another case', async () => {
    await expect(prisma.creationProject.create({
      data: { id: randomUUID(), ownerUserId: userId, caseId: caseA, type: 'smile_simulation', sourceMediaId: sourceB, createdById: userId },
    })).rejects.toThrow();
  });

  it('rejects same-user jobs with mismatched project, source, or case graph coordinates', async () => {
    await expect(prisma.generationJob.create({
      data: jobInput({ id: randomUUID(), ownerUserId: userId, caseId: caseA, projectId: projectB, sourceMediaId: sourceB }),
    })).rejects.toThrow();
    await expect(prisma.generationJob.create({
      data: jobInput({ id: randomUUID(), ownerUserId: userId, caseId: caseA, projectId: projectA, sourceMediaId: sourceB }),
    })).rejects.toThrow();
  });

  it('rejects same-user versions with mismatched job/project/case coordinates and invalid version numbering', async () => {
    const valid = {
      id: randomUUID(),
      ownerUserId: userId,
      generationJobId: jobA,
      mediaAssetId: generatedA,
      caseId: caseA,
      projectId: projectA,
      versionNumber: 1,
      sourceMediaId: sourceA,
      sourceSha256: checksum,
      providerKey: 'mock-smile-simulation',
      providerVersion: 'phase13',
      generationContractVersion: contractVersion,
      parameters: {},
    };
    await expect(prisma.generationVersion.create({ data: { ...valid, id: randomUUID(), caseId: caseB, projectId: projectB } })).rejects.toThrow();
    await expect(prisma.generationVersion.create({ data: { ...valid, id: randomUUID(), mediaAssetId: generatedWrongSource, versionNumber: 0 } })).rejects.toThrow();
    await expect(prisma.generationVersion.create({ data: { ...valid, id: randomUUID(), versionNumber: 0 } })).rejects.toThrow();
  });

  it('rejects invalid media scalar, checksum, and lineage states', async () => {
    await expect(prisma.mediaAsset.create({ data: { ...sourceMedia({ id: randomUUID(), ownerUserId: userId, caseId: caseA }), byteSize: 0 } })).rejects.toThrow();
    await expect(prisma.mediaAsset.create({ data: { ...sourceMedia({ id: randomUUID(), ownerUserId: userId, caseId: caseA }), width: 0 } })).rejects.toThrow();
    await expect(prisma.mediaAsset.create({ data: { ...sourceMedia({ id: randomUUID(), ownerUserId: userId, caseId: caseA }), height: 0 } })).rejects.toThrow();
    await expect(prisma.mediaAsset.create({ data: { ...sourceMedia({ id: randomUUID(), ownerUserId: userId, caseId: caseA }), sha256: 'not-a-checksum' } })).rejects.toThrow();
    await expect(prisma.mediaAsset.create({ data: { ...sourceMedia({ id: randomUUID(), ownerUserId: userId, caseId: caseA }), sourceMediaId: sourceA } })).rejects.toThrow();
    await expect(prisma.mediaAsset.create({ data: { ...sourceMedia({ id: randomUUID(), ownerUserId: userId, caseId: caseA }), kind: 'derived', sourceMediaId: null } })).rejects.toThrow();
  });

  it('rejects invalid job fingerprints and state/timestamp/error combinations', async () => {
    await expect(prisma.generationJob.create({
      data: jobInput({ id: randomUUID(), ownerUserId: userId, caseId: caseA, projectId: projectA, sourceMediaId: sourceA, requestFingerprint: 'invalid' }),
    })).rejects.toThrow();
    await expect(prisma.generationJob.create({
      data: jobInput({ id: randomUUID(), ownerUserId: userId, caseId: caseA, projectId: projectA, sourceMediaId: sourceA, status: 'queued', startedAt: new Date() }),
    })).rejects.toThrow();
    await expect(prisma.generationJob.create({
      data: jobInput({ id: randomUUID(), ownerUserId: userId, caseId: caseA, projectId: projectA, sourceMediaId: sourceA, status: 'failed', startedAt: new Date(), finishedAt: new Date(), errorCode: null }),
    })).rejects.toThrow();
  });

  it('preserves the same timestamp instant under a non-UTC PostgreSQL session timezone', async () => {
    const timezoneUserId = randomUUID();
    const instant = new Date('2026-08-26T12:34:56.789Z');
    await prisma.$executeRawUnsafe("SET TIME ZONE 'America/New_York'");
    try {
      await prisma.user.create({
        data: {
          id: timezoneUserId,
          email: `timezone-${timezoneUserId}@example.invalid`,
          normalizedEmail: `timezone-${timezoneUserId}@example.invalid`,
          displayName: 'Timezone test',
          status: 'active',
          createdAt: instant,
          updatedAt: instant,
        },
      });
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: timezoneUserId } });
      expect(stored.createdAt.toISOString()).toBe(instant.toISOString());
    } finally {
      await prisma.$executeRawUnsafe("SET TIME ZONE 'UTC'");
      await prisma.user.deleteMany({ where: { id: timezoneUserId } });
    }
  });
});
