import { createHash, randomUUID } from 'node:crypto';

import { GenerationService, type DigestPort, type GenerationQueueMessage, type GenerationQueuePort, type IdGeneratorPort, type ObjectStoragePort, type SmileSimulationProviderPort, type ClockPort } from '@dentpilot/application';
import { IdempotencyConflictError, type ActorContext } from '@dentpilot/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma-unit-of-work.js';
import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';

const canRun = process.env.DATABASE_URL !== undefined;
const checksum = 'd'.repeat(64);

class RecordingQueue implements GenerationQueuePort {
  public readonly messages: GenerationQueueMessage[] = [];

  public async enqueue(message: GenerationQueueMessage): Promise<void> {
    this.messages.push(message);
  }
}

const digest: DigestPort = {
  async sha256(bytes: Uint8Array): Promise<string> {
    return createHash('sha256').update(bytes).digest('hex');
  },
};

const storage: ObjectStoragePort = {
  async putStream(): Promise<void> { throw new Error('Storage is not used while requesting a job.'); },
  async getStream(): Promise<never> { throw new Error('Storage is not used while requesting a job.'); },
  async head(): Promise<never> { throw new Error('Storage is not used while requesting a job.'); },
  async delete(): Promise<void> { throw new Error('Storage is not used while requesting a job.'); },
  async probeReadiness(): Promise<void> { return undefined; },
};

const ids: IdGeneratorPort = { next: () => randomUUID() };
const clock: ClockPort = { now: () => new Date() };

function provider(key: string): SmileSimulationProviderPort {
  return {
    key,
    async generate() {
      throw new Error('Provider is not used while requesting a job.');
    },
  };
}

function actor(userId: string): ActorContext {
  return { actorType: 'human', userId, requestId: randomUUID() };
}

function requestService(unitOfWork: PrismaUnitOfWork, queue: RecordingQueue, providerKey = 'transaction-test-provider'): GenerationService {
  return new GenerationService(unitOfWork, storage, digest, queue, provider(providerKey), ids, clock, 10 * 1024 * 1024);
}

describe.skipIf(!canRun)('GenerationService transactional idempotency', () => {
  const prisma = new PrismaService();
  const unitOfWork = new PrismaUnitOfWork(prisma);
  const queue = new RecordingQueue();
  const ownerUserId = randomUUID();
  const caseId = randomUUID();
  const sourceMediaId = randomUUID();
  const projectId = randomUUID();

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.user.create({
      data: {
        id: ownerUserId,
        email: `transaction-${ownerUserId}@example.invalid`,
        normalizedEmail: `transaction-${ownerUserId}@example.invalid`,
        displayName: 'Transaction idempotency user',
        status: 'active',
      },
    });
    await prisma.patientCase.create({ data: { id: caseId, ownerUserId, displayLabel: 'Transaction case', status: 'active', createdById: ownerUserId } });
    await prisma.mediaAsset.create({
      data: {
        id: sourceMediaId,
        ownerUserId,
        caseId,
        kind: 'source',
        purpose: 'source_photo',
        mimeType: 'image/png',
        byteSize: 1,
        width: 1,
        height: 1,
        sha256: checksum,
        storageKey: `users/${ownerUserId}/idempotency/${sourceMediaId}`,
        sourceMediaId: null,
        createdById: ownerUserId,
      },
    });
    await prisma.creationProject.create({
      data: { id: projectId, ownerUserId, caseId, type: 'smile_simulation', sourceMediaId, createdById: ownerUserId },
    });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { ownerUserId } });
    await prisma.generationVersion.deleteMany({ where: { ownerUserId } });
    await prisma.generationJob.deleteMany({ where: { ownerUserId } });
    await prisma.creationProject.deleteMany({ where: { ownerUserId } });
    await prisma.mediaAsset.deleteMany({ where: { ownerUserId } });
    await prisma.patientCase.deleteMany({ where: { ownerUserId } });
    await prisma.user.deleteMany({ where: { id: ownerUserId } });
    await prisma.onModuleDestroy();
  });

  it('returns the original job for a sequential retry, with one audit event and one queue submission', async () => {
    const service = requestService(unitOfWork, queue);
    const idempotencyKey = `sequential-${randomUUID()}`;

    const first = await service.request(actor(ownerUserId), { projectId, idempotencyKey });
    const second = await service.request(actor(ownerUserId), { projectId, idempotencyKey });

    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
    expect(await prisma.generationJob.count({ where: { ownerUserId, projectId, idempotencyKey } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { ownerUserId, generationJobId: first.id, eventType: 'GenerationRequested' } })).toBe(1);
    expect(queue.messages.filter((message) => message.jobId === first.id)).toHaveLength(1);
  });

  it('resolves concurrent identical requests through the real service transaction to one job, audit, and queue message', async () => {
    const service = requestService(unitOfWork, queue);
    const idempotencyKey = `concurrent-${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 8 }, () => service.request(actor(ownerUserId), { projectId, idempotencyKey })));
    const jobId = results[0]?.id;

    expect(jobId).toBeDefined();
    expect(new Set(results.map((result) => result.id))).toEqual(new Set([jobId]));
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await prisma.generationJob.count({ where: { ownerUserId, projectId, idempotencyKey } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { ownerUserId, generationJobId: jobId, eventType: 'GenerationRequested' } })).toBe(1);
    expect(queue.messages.filter((message) => message.jobId === jobId)).toHaveLength(1);
  });

  it('rejects a conflicting fingerprint without creating a job, audit, or queue duplicate', async () => {
    const idempotencyKey = `conflict-${randomUUID()}`;
    const firstService = requestService(unitOfWork, queue, 'provider-a');
    const conflictingService = requestService(unitOfWork, queue, 'provider-b');

    const first = await firstService.request(actor(ownerUserId), { projectId, idempotencyKey });
    await expect(conflictingService.request(actor(ownerUserId), { projectId, idempotencyKey })).rejects.toBeInstanceOf(IdempotencyConflictError);

    expect(await prisma.generationJob.count({ where: { ownerUserId, projectId, idempotencyKey } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { ownerUserId, generationJobId: first.id, eventType: 'GenerationRequested' } })).toBe(1);
    expect(queue.messages.filter((message) => message.jobId === first.id)).toHaveLength(1);
  });
});
