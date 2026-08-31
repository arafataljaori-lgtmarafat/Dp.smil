import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { MediaUploadSessionService, type Actor } from '@dentpilot/application';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MediaUploadReconcilerService } from '../../src/infrastructure/media/media-upload-reconciler.service.js';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma-unit-of-work.js';
import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';
import { LocalObjectStorageAdapter } from '../../src/infrastructure/storage/local-object-storage.adapter.js';

const suite = describe.skipIf(process.env.DATABASE_URL === undefined);

suite('Media upload reconciler real PostgreSQL batch draining', () => {
  const prisma = new PrismaService();
  const unitOfWork = new PrismaUnitOfWork(prisma);
  const ownerUserId = randomUUID();
  const caseId = randomUUID();
  const actor: Actor = { actorType: 'human', userId: ownerUserId, requestId: randomUUID() };
  const rootPromise = mkdtemp(join(tmpdir(), 'dentpilot-reconciler-batch-'));
  const sessionService = new MediaUploadSessionService(unitOfWork, { next: () => randomUUID() }, { now: () => new Date() }, 3600);

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.user.create({ data: { id: ownerUserId, email: `batch-drain-${ownerUserId}@example.invalid`, normalizedEmail: `batch-drain-${ownerUserId}@example.invalid`, displayName: 'Batch drain user', status: 'active' } });
    await prisma.patientCase.create({ data: { id: caseId, ownerUserId, displayLabel: 'Batch drain case', status: 'active', createdById: ownerUserId } });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { ownerUserId } });
    await prisma.mediaUploadSession.deleteMany({ where: { ownerUserId } });
    await prisma.mediaAsset.deleteMany({ where: { ownerUserId } });
    await prisma.patientCase.delete({ where: { id: caseId } });
    await prisma.user.delete({ where: { id: ownerUserId } });
    await prisma.onModuleDestroy();
    await rm(await rootPromise, { recursive: true, force: true });
  });

  it('removes only one bounded batch per pass and drains the remaining durable work on the next pass', async () => {
    const storage = new LocalObjectStorageAdapter(await rootPromise);
    const keys: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const created = await sessionService.create(actor, { caseId, idempotencyKey: `batch-${index}-${randomUUID()}` });
      const claim = await sessionService.claimForContent(actor, created.session.id);
      if (!claim.claimed || claim.session.targetStorageKey === null) throw new Error('Expected claimed upload session.');
      keys.push(claim.session.targetStorageKey);
      await storage.putStream({ key: claim.session.targetStorageKey, body: Readable.from([Buffer.from([index])]), contentType: 'image/png', contentLength: 1 });
      await sessionService.failClaimedProcessing(actor, claim.session, 'PERSISTENCE_FAILED');
    }
    const reconciler = new MediaUploadReconcilerService({ MEDIA_TEMP_ROOT: await rootPromise, MEDIA_TEMP_CLEANUP_AGE_SECONDS: 60, MEDIA_UPLOAD_PROCESSING_TIMEOUT_SECONDS: 60 } as never, unitOfWork, storage);
    await reconciler.reconcile(new Date(), 2);
    expect(await prisma.mediaUploadSession.count({ where: { ownerUserId, status: 'failed', storageCleanupPending: true } })).toBe(1);
    await Promise.all(keys.slice(0, 2).map((key) => expect(storage.head(key)).rejects.toMatchObject({ failureCode: 'STORAGE_OBJECT_NOT_FOUND' })));
    await expect(storage.head(keys[2]!)).resolves.toMatchObject({ contentLength: 1 });
    await reconciler.reconcile(new Date(), 2);
    expect(await prisma.mediaUploadSession.count({ where: { ownerUserId, status: 'failed', storageCleanupPending: true } })).toBe(0);
    await Promise.all(keys.map((key) => expect(storage.head(key)).rejects.toMatchObject({ failureCode: 'STORAGE_OBJECT_NOT_FOUND' })));
  });
});
