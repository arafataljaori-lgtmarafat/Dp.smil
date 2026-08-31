import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma-unit-of-work.js';
import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';

const canRun = process.env.DATABASE_URL !== undefined;
const checksum = 'e'.repeat(64);

function generationData(input: { id: string; ownerUserId: string; caseId: string; projectId: string; sourceMediaId: string; idempotencyKey: string }) {
  return {
    ...input,
    requestFingerprint: 'f'.repeat(64),
    generationContractVersion: 'smile-simulation-v1',
    correlationId: 'concurrency-test',
    providerKey: 'mock-smile-simulation',
    status: 'queued' as const,
    createdAt: new Date(),
    startedAt: null,
    finishedAt: null,
    errorCode: null,
  };
}

describe.skipIf(!canRun)('PostgreSQL generation concurrency', () => {
  const prisma = new PrismaService();
  const unitOfWork = new PrismaUnitOfWork(prisma);
  const ownerUserId = randomUUID();
  const caseId = randomUUID();
  const sourceMediaId = randomUUID();
  const projectId = randomUUID();

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.user.create({
      data: {
        id: ownerUserId,
        email: `concurrency-${ownerUserId}@example.invalid`,
        normalizedEmail: `concurrency-${ownerUserId}@example.invalid`,
        displayName: 'Concurrency test user',
        status: 'active',
      },
    });
    await prisma.patientCase.create({ data: { id: caseId, ownerUserId, displayLabel: 'Fictional concurrent case', status: 'active', createdById: ownerUserId } });
    await prisma.mediaAsset.create({
      data: { id: sourceMediaId, ownerUserId, caseId, kind: 'source', purpose: 'source_photo', mimeType: 'image/png', byteSize: 1, width: 1, height: 1, sha256: checksum, storageKey: `users/${ownerUserId}/source/${sourceMediaId}`, sourceMediaId: null, createdById: ownerUserId },
    });
    await prisma.creationProject.create({ data: { id: projectId, ownerUserId, caseId, type: 'smile_simulation', sourceMediaId, createdById: ownerUserId } });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { ownerUserId } });
    await prisma.generationVersion.deleteMany({ where: { ownerUserId } });
    await prisma.generationJob.deleteMany({ where: { ownerUserId } });
    await prisma.creationProject.deleteMany({ where: { id: projectId } });
    await prisma.mediaAsset.deleteMany({ where: { id: sourceMediaId } });
    await prisma.patientCase.deleteMany({ where: { id: caseId } });
    await prisma.user.deleteMany({ where: { id: ownerUserId } });
    await prisma.onModuleDestroy();
  });

  it('upserts one job for concurrent identical logical submissions', async () => {
    const key = `same-key-${randomUUID()}`;
    const ids = Array.from({ length: 8 }, () => randomUUID());
    const results = await Promise.all(ids.map((id) => unitOfWork.generations.createOrFindByIdempotency(
      generationData({ id, ownerUserId, caseId, projectId, sourceMediaId, idempotencyKey: key }),
    )));
    expect(new Set(results.map((result) => result.job.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await prisma.generationJob.count({ where: { ownerUserId, projectId, idempotencyKey: key } })).toBe(1);
  });

  it('allows exactly one concurrent queued-to-processing claim', async () => {
    const jobId = randomUUID();
    await prisma.generationJob.create({ data: generationData({ id: jobId, ownerUserId, caseId, projectId, sourceMediaId, idempotencyKey: `claim-${randomUUID()}` }) });
    const claims = await Promise.all(Array.from({ length: 2 }, () => prisma.generationJob.updateMany({
      where: { id: jobId, ownerUserId, status: 'queued' },
      data: { status: 'processing', startedAt: new Date() },
    })));
    expect(claims.map((claim) => claim.count).sort()).toEqual([0, 1]);
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('processing');
  });
});
