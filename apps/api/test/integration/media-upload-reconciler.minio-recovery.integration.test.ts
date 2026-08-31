import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { MediaUploadSessionService, type Actor } from '@dentpilot/application';
import { MediaIngestError } from '@dentpilot/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { StreamingMediaIngestService } from '../../src/infrastructure/media/streaming-media-ingest.service.js';
import { MediaUploadReconcilerService } from '../../src/infrastructure/media/media-upload-reconciler.service.js';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma-unit-of-work.js';
import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';
import { S3ObjectStorageAdapter } from '../../src/infrastructure/storage/s3-object-storage.adapter.js';

const endpoint = process.env.S3_TEST_ENDPOINT;
const required = process.env.S3_TEST_REQUIRED === 'true';
if (required && endpoint === undefined) throw new Error('S3_TEST_ENDPOINT is required when S3_TEST_REQUIRED=true.');
const suite = describe.skipIf(endpoint === undefined || process.env.DATABASE_URL === undefined);
const s3Endpoint = endpoint ?? 'http://127.0.0.1:9000';
const credentials = { accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? 'minioadmin', secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? 'minioadmin' };
const bucket = `dentpilot-recovery-${randomUUID().replaceAll('-', '')}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+FF0X6QAAAABJRU5ErkJggg==', 'base64');
const tempRoot = join(tmpdir(), `dentpilot-minio-recovery-${randomUUID()}`);
const config = {
  MEDIA_TEMP_ROOT: tempRoot,
  MEDIA_TEMP_CLEANUP_AGE_SECONDS: 60,
  MEDIA_UPLOAD_PROCESSING_TIMEOUT_SECONDS: 60,
  MAX_MEDIA_BYTES: 1024 * 1024,
  MAX_MEDIA_PIXELS: 1_000_000,
  MAX_MEDIA_DIMENSION: 2048,
  MAX_CONCURRENT_MEDIA_INSPECTIONS: 1,
};

suite('Media upload reconciler real PostgreSQL + MinIO recovery', () => {
  const prisma = new PrismaService();
  const unitOfWork = new PrismaUnitOfWork(prisma);
  const admin = new S3Client({ endpoint: s3Endpoint, forcePathStyle: true, region: 'us-east-1', credentials });
  const owners: string[] = [];
  const storage = () => new S3ObjectStorageAdapter({ bucket, region: 'us-east-1', endpoint: s3Endpoint, forcePathStyle: true, ...credentials });

  beforeAll(async () => {
    await prisma.onModuleInit();
    try { await admin.send(new HeadBucketCommand({ Bucket: bucket })); } catch { await admin.send(new CreateBucketCommand({ Bucket: bucket })); }
  });

  afterEach(async () => {
    if (owners.length === 0) return;
    await prisma.auditEvent.deleteMany({ where: { ownerUserId: { in: owners } } });
    await prisma.mediaUploadSession.deleteMany({ where: { ownerUserId: { in: owners } } });
    await prisma.mediaAsset.deleteMany({ where: { ownerUserId: { in: owners } } });
    await prisma.patientCase.deleteMany({ where: { ownerUserId: { in: owners } } });
    await prisma.user.deleteMany({ where: { id: { in: owners } } });
    owners.length = 0;
  });

  afterAll(async () => {
    await admin.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
    admin.destroy();
    await prisma.onModuleDestroy();
  });

  it('recovers a real orphan after put succeeds, finalization fails, immediate delete fails, and a new reconciler instance starts', async () => {
    const ownerUserId = randomUUID();
    const caseId = randomUUID();
    owners.push(ownerUserId);
    await prisma.user.create({ data: { id: ownerUserId, email: `recovery-${ownerUserId}@example.invalid`, normalizedEmail: `recovery-${ownerUserId}@example.invalid`, displayName: 'Recovery integration user', status: 'active' } });
    await prisma.patientCase.create({ data: { id: caseId, ownerUserId, displayLabel: 'Recovery case', status: 'active', createdById: ownerUserId } });
    const actor: Actor = { actorType: 'human', userId: ownerUserId, requestId: randomUUID() };
    const sessions = new MediaUploadSessionService(unitOfWork, { next: () => randomUUID() }, { now: () => new Date() }, 3600);
    const created = await sessions.create(actor, { caseId, idempotencyKey: `recover-${randomUUID()}` });
    let denyImmediateDelete = true;
    const faultingStorage = {
      putStream: (input: Parameters<S3ObjectStorageAdapter['putStream']>[0]) => storage().putStream(input),
      getStream: (key: string) => storage().getStream(key),
      head: (key: string) => storage().head(key),
      probeReadiness: () => storage().probeReadiness(),
      delete: async (key: string) => {
        if (denyImmediateDelete) throw new Error('injected immediate delete failure');
        await storage().delete(key);
      },
    };
    const faultingSessions = {
      claimForContent: sessions.claimForContent.bind(sessions),
      finalizeSource: async () => { throw new Error('injected finalization failure'); },
      failClaimedProcessing: sessions.failClaimedProcessing.bind(sessions),
      markStorageCleanupComplete: sessions.markStorageCleanupComplete.bind(sessions),
    };
    const ingest = new StreamingMediaIngestService(config as never, faultingStorage as never, faultingSessions as never);
    await expect(ingest.ingest(actor, created.session.id, Readable.from([png]), () => false)).rejects.toMatchObject({ code: 'PERSISTENCE_FAILED' } satisfies Partial<MediaIngestError>);
    const failed = await unitOfWork.uploadSessions.findById(ownerUserId, created.session.id);
    expect(failed).toMatchObject({ status: 'failed', storageCleanupPending: true });
    expect(failed?.targetStorageKey).not.toBeNull();
    await expect(storage().head(failed!.targetStorageKey!)).resolves.toMatchObject({ contentLength: png.byteLength });
    expect(await prisma.mediaAsset.count({ where: { ownerUserId } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { ownerUserId, eventType: 'MediaUploaded' } })).toBe(0);

    denyImmediateDelete = false;
    const restartedPrismaA = new PrismaService();
    const restartedPrismaB = new PrismaService();
    await Promise.all([restartedPrismaA.onModuleInit(), restartedPrismaB.onModuleInit()]);
    const restartedUnitOfWorkA = new PrismaUnitOfWork(restartedPrismaA);
    const restartedUnitOfWorkB = new PrismaUnitOfWork(restartedPrismaB);
    const restartedReconcilerA = new MediaUploadReconcilerService(config as never, restartedUnitOfWorkA, storage());
    const restartedReconcilerB = new MediaUploadReconcilerService(config as never, restartedUnitOfWorkB, storage());
    await Promise.all([restartedReconcilerA.reconcile(new Date(), 10), restartedReconcilerB.reconcile(new Date(), 10)]);
    const recovered = await restartedUnitOfWorkA.uploadSessions.findById(ownerUserId, created.session.id);
    expect(recovered).toMatchObject({ status: 'failed', storageCleanupPending: false });
    await expect(storage().head(failed!.targetStorageKey!)).rejects.toMatchObject({ failureCode: 'STORAGE_OBJECT_NOT_FOUND' });
    await Promise.all([restartedPrismaA.onModuleDestroy(), restartedPrismaB.onModuleDestroy()]);
  });
});
