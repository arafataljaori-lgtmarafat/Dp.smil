import { randomUUID } from 'node:crypto';

import type { MediaUploadSessionRecord } from '@dentpilot/application';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma-unit-of-work.js';
import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';

const canRun = process.env.DATABASE_URL !== undefined;
const expiresInOneHour = () => new Date(Date.now() + 60 * 60 * 1000);
const owners = [randomUUID(), randomUUID()];
const [ownerA, ownerB] = owners;
const caseA = randomUUID();
const caseB = randomUUID();

function createdSession(ownerUserId: string, caseId: string, idempotencyKey = randomUUID()): Omit<MediaUploadSessionRecord, 'startedAt' | 'finishedAt' | 'processingToken' | 'targetMediaId' | 'targetStorageKey' | 'committedMediaId' | 'errorCode' | 'storageCleanupPending'> {
  return {
    id: randomUUID(),
    ownerUserId,
    caseId,
    idempotencyKey,
    status: 'created',
    createdAt: new Date(),
    expiresAt: expiresInOneHour(),
  };
}

function processingInput(
  session: MediaUploadSessionRecord,
  processingToken = randomUUID(),
  startedAt = new Date(),
) {
  const targetMediaId = randomUUID();
  return {
    ownerUserId: session.ownerUserId,
    uploadSessionId: session.id,
    processingToken,
    targetMediaId,
    targetStorageKey: `users/${session.ownerUserId}/cases/${session.caseId}/ingest/${session.id}/${targetMediaId}`,
    startedAt,
    now: startedAt,
  };
}

describe.skipIf(!canRun)('MediaUploadSession PostgreSQL persistence', () => {
  const prisma = new PrismaService();
  const unitOfWork = new PrismaUnitOfWork(prisma);

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.user.createMany({
      data: owners.map((id) => ({
        id,
        email: `upload-session-${id}@example.invalid`,
        normalizedEmail: `upload-session-${id}@example.invalid`,
        displayName: 'Upload session integration user',
        status: 'active' as const,
      })),
    });
    await prisma.patientCase.createMany({
      data: [
        { id: caseA, ownerUserId: ownerA, displayLabel: 'Owner A case', status: 'active', createdById: ownerA },
        { id: caseB, ownerUserId: ownerB, displayLabel: 'Owner B case', status: 'active', createdById: ownerB },
      ],
    });
  });

  it('records failed storage cleanup durably and converges with a conditional completion', async () => {
    const session = (await unitOfWork.uploadSessions.createOrFindByIdempotency(createdSession(ownerA, caseA))).session;
    const claim = await unitOfWork.uploadSessions.claimForProcessing(processingInput(session));
    if (claim === null || claim.processingToken === null) throw new Error('Expected processing claim.');
    const failed = await unitOfWork.uploadSessions.markFailed({
      ownerUserId: ownerA, uploadSessionId: claim.id, processingToken: claim.processingToken,
      errorCode: 'STORAGE_WRITE_FAILED', finishedAt: new Date(),
    });
    expect(failed?.storageCleanupPending).toBe(true);
    expect((await unitOfWork.uploadSessions.listCleanupPending(10)).map((item) => item.id)).toContain(session.id);
    const completed = await unitOfWork.uploadSessions.markStorageCleanupComplete({ ownerUserId: ownerA, uploadSessionId: session.id });
    expect(completed?.storageCleanupPending).toBe(false);
    expect(await unitOfWork.uploadSessions.markStorageCleanupComplete({ ownerUserId: ownerA, uploadSessionId: session.id })).toBeNull();
  });

  afterAll(async () => {
    await prisma.mediaUploadSession.deleteMany({ where: { ownerUserId: { in: owners } } });
    await prisma.mediaAsset.deleteMany({ where: { ownerUserId: { in: owners } } });
    await prisma.patientCase.deleteMany({ where: { ownerUserId: { in: owners } } });
    await prisma.user.deleteMany({ where: { id: { in: owners } } });
    await prisma.onModuleDestroy();
  });

  it('rejects a User A session targeting a User B case through the ownership graph', async () => {
    await expect(unitOfWork.uploadSessions.createOrFindByIdempotency(createdSession(ownerA, caseB))).rejects.toThrow();
  });

  it('returns one logical session for idempotent sequential creation', async () => {
    const idempotencyKey = `sequential-${randomUUID()}`;
    const first = await unitOfWork.uploadSessions.createOrFindByIdempotency(createdSession(ownerA, caseA, idempotencyKey));
    const second = await unitOfWork.uploadSessions.createOrFindByIdempotency(createdSession(ownerA, caseA, idempotencyKey));
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.session.id).toBe(first.session.id);
    expect(await prisma.mediaUploadSession.count({ where: { ownerUserId: ownerA, caseId: caseA, idempotencyKey } })).toBe(1);
  });

  it('resolves real concurrent identical creates to one durable session', async () => {
    const idempotencyKey = `concurrent-${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 8 }, () =>
      unitOfWork.uploadSessions.createOrFindByIdempotency(createdSession(ownerA, caseA, idempotencyKey)),
    ));
    expect(new Set(results.map((result) => result.session.id))).toHaveLength(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await prisma.mediaUploadSession.count({ where: { ownerUserId: ownerA, caseId: caseA, idempotencyKey } })).toBe(1);
  });

  it('lets PostgreSQL reject an invalid processing state shape', async () => {
    await expect(prisma.mediaUploadSession.create({
      data: {
        id: randomUUID(),
        ownerUserId: ownerA,
        caseId: caseA,
        idempotencyKey: `invalid-shape-${randomUUID()}`,
        status: 'processing',
        expiresAt: expiresInOneHour(),
      },
    })).rejects.toThrow();
  });

  it('does not finalize a processing session with a wrong fencing token', async () => {
    const created = await unitOfWork.uploadSessions.createOrFindByIdempotency(createdSession(ownerA, caseA));
    const claim = processingInput(created.session, 'correct-processing-token');
    await expect(unitOfWork.uploadSessions.claimForProcessing(claim)).resolves.toMatchObject({ status: 'processing' });
    await expect(unitOfWork.uploadSessions.markCommitted({
      ownerUserId: ownerA,
      uploadSessionId: created.session.id,
      processingToken: 'stale-processing-token',
      committedMediaId: randomUUID(),
      finishedAt: new Date(),
    })).resolves.toBeNull();
  });

  it('commits atomically only with the claimed fencing token and same owner/case media', async () => {
    const committedMediaId = randomUUID();
    await prisma.mediaAsset.create({
      data: {
        id: committedMediaId,
        ownerUserId: ownerA,
        caseId: caseA,
        kind: 'source',
        purpose: 'source_photo',
        mimeType: 'image/png',
        byteSize: 1,
        width: 1,
        height: 1,
        sha256: 'b'.repeat(64),
        storageKey: `users/${ownerA}/cases/${caseA}/source/${committedMediaId}`,
        createdById: ownerA,
      },
    });
    const created = await unitOfWork.uploadSessions.createOrFindByIdempotency(createdSession(ownerA, caseA));
    const claim = processingInput(created.session, 'commit-token');
    await unitOfWork.uploadSessions.claimForProcessing(claim);
    await expect(unitOfWork.uploadSessions.markCommitted({
      ownerUserId: ownerA,
      uploadSessionId: created.session.id,
      processingToken: claim.processingToken,
      committedMediaId,
      finishedAt: new Date(),
    })).resolves.toMatchObject({ status: 'committed', committedMediaId });
  });

  it('rejects a committed media reference that crosses the owner/case graph', async () => {
    const crossMediaId = randomUUID();
    await prisma.mediaAsset.create({
      data: {
        id: crossMediaId,
        ownerUserId: ownerB,
        caseId: caseB,
        kind: 'source',
        purpose: 'source_photo',
        mimeType: 'image/png',
        byteSize: 1,
        width: 1,
        height: 1,
        sha256: 'a'.repeat(64),
        storageKey: `users/${ownerB}/cases/${caseB}/source/${crossMediaId}`,
        createdById: ownerB,
      },
    });
    const created = await unitOfWork.uploadSessions.createOrFindByIdempotency(createdSession(ownerA, caseA));
    const claim = processingInput(created.session);
    await unitOfWork.uploadSessions.claimForProcessing(claim);
    await expect(unitOfWork.uploadSessions.markCommitted({
      ownerUserId: ownerA,
      uploadSessionId: created.session.id,
      processingToken: claim.processingToken,
      committedMediaId: crossMediaId,
      finishedAt: new Date(),
    })).rejects.toThrow();
  });

  it('expires only a created session whose session lifetime elapsed', async () => {
    const now = Date.now();
    const created = await unitOfWork.uploadSessions.createOrFindByIdempotency({
      ...createdSession(ownerA, caseA),
      createdAt: new Date(now - 2 * 60 * 60 * 1_000),
      expiresAt: new Date(now - 60 * 60 * 1_000),
    });
    await expect(unitOfWork.uploadSessions.markExpired({
      ownerUserId: ownerA,
      uploadSessionId: created.session.id,
      now: new Date(),
      finishedAt: new Date(),
    })).resolves.toMatchObject({ status: 'expired' });
  });

  it('does not expire processing merely because the original session lifetime elapsed', async () => {
    const created = await unitOfWork.uploadSessions.createOrFindByIdempotency({
      ...createdSession(ownerA, caseA),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const claim = processingInput(created.session, 'processing-not-expired-token');
    await unitOfWork.uploadSessions.claimForProcessing(claim);
    await expect(unitOfWork.uploadSessions.markExpired({
      ownerUserId: ownerA,
      uploadSessionId: created.session.id,
      now: new Date(Date.now() + 120_000),
      finishedAt: new Date(),
    })).resolves.toBeNull();
    await expect(unitOfWork.uploadSessions.findById(ownerA, created.session.id)).resolves.toMatchObject({ status: 'processing' });
  });

  it('fails a processing timeout only with the active fencing token and blocks a stale commit', async () => {
    const created = await unitOfWork.uploadSessions.createOrFindByIdempotency(createdSession(ownerA, caseA));
    const threshold = new Date(Date.now() - 60_000);
    const claim = processingInput(created.session, 'active-timeout-token', threshold);
    await unitOfWork.uploadSessions.claimForProcessing(claim);
    await expect(unitOfWork.uploadSessions.markProcessingTimedOut({
      ownerUserId: ownerA,
      uploadSessionId: created.session.id,
      processingToken: 'wrong-timeout-token',
      processingStartedBefore: new Date(),
      finishedAt: new Date(),
    })).resolves.toBeNull();
    await expect(unitOfWork.uploadSessions.markProcessingTimedOut({
      ownerUserId: ownerA,
      uploadSessionId: created.session.id,
      processingToken: claim.processingToken,
      processingStartedBefore: new Date(),
      finishedAt: new Date(),
    })).resolves.toMatchObject({ status: 'failed', errorCode: 'UPLOAD_PROCESSING_TIMEOUT' });
    await expect(unitOfWork.uploadSessions.markCommitted({
      ownerUserId: ownerA,
      uploadSessionId: created.session.id,
      processingToken: claim.processingToken,
      committedMediaId: randomUUID(),
      finishedAt: new Date(),
    })).resolves.toBeNull();
  });

  it('allows exactly one valid terminal winner when timeout and commit race', async () => {
    const committedMediaId = randomUUID();
    await prisma.mediaAsset.create({
      data: {
        id: committedMediaId,
        ownerUserId: ownerA,
        caseId: caseA,
        kind: 'source',
        purpose: 'source_photo',
        mimeType: 'image/png',
        byteSize: 1,
        width: 1,
        height: 1,
        sha256: 'c'.repeat(64),
        storageKey: `users/${ownerA}/cases/${caseA}/source/${committedMediaId}`,
        createdById: ownerA,
      },
    });
    const created = await unitOfWork.uploadSessions.createOrFindByIdempotency(createdSession(ownerA, caseA));
    const claim = processingInput(created.session, 'racing-terminal-token', new Date(Date.now() - 60_000));
    await unitOfWork.uploadSessions.claimForProcessing(claim);
    const [timeoutResult, commitResult] = await Promise.all([
      unitOfWork.uploadSessions.markProcessingTimedOut({
        ownerUserId: ownerA,
        uploadSessionId: created.session.id,
        processingToken: claim.processingToken,
        processingStartedBefore: new Date(),
        finishedAt: new Date(),
      }),
      unitOfWork.uploadSessions.markCommitted({
        ownerUserId: ownerA,
        uploadSessionId: created.session.id,
        processingToken: claim.processingToken,
        committedMediaId,
        finishedAt: new Date(),
      }),
    ]);
    expect([timeoutResult, commitResult].filter((result) => result !== null)).toHaveLength(1);
    const finalSession = await unitOfWork.uploadSessions.findById(ownerA, created.session.id);
    expect(finalSession?.status).toMatch(/^(failed|committed)$/);
    if (finalSession?.status === 'failed') expect(finalSession.errorCode).toBe('UPLOAD_PROCESSING_TIMEOUT');
    if (finalSession?.status === 'committed') expect(finalSession.committedMediaId).toBe(committedMediaId);
  });
});
