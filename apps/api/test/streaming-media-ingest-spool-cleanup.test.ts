import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import { StorageError } from '@dentpilot/domain';
import { StreamingMediaIngestService } from '../src/infrastructure/media/streaming-media-ingest.service.js';

const actor = { actorType: 'human' as const, userId: '00000000-0000-4000-8000-000000000001', requestId: 'spool-cleanup-test' };
const claimed = {
  id: '00000000-0000-4000-8000-000000000010', ownerUserId: actor.userId, caseId: '00000000-0000-4000-8000-000000000011',
  idempotencyKey: 'spool-cleanup-test-key', status: 'processing' as const, createdAt: new Date(), startedAt: new Date(), finishedAt: null,
  expiresAt: new Date(Date.now() + 60_000), processingToken: 'token', targetMediaId: '00000000-0000-4000-8000-000000000012',
  targetStorageKey: 'users/00000000-0000-4000-8000-000000000001/cases/00000000-0000-4000-8000-000000000011/source/00000000-0000-4000-8000-000000000012', committedMediaId: null, errorCode: null, storageCleanupPending: false,
};

async function* empty(): AsyncIterable<Uint8Array> {}
async function* broken(): AsyncIterable<Uint8Array> { yield new Uint8Array([1]); throw new Error('stream interrupted'); }
async function* tooLarge(): AsyncIterable<Uint8Array> { yield new Uint8Array([1, 2, 3]); }

async function* validPng(): AsyncIterable<Uint8Array> {
  yield await sharp(Buffer.from([32, 128, 224, 255]), { raw: { width: 1, height: 1, channels: 4 } }).png().toBuffer();
}

async function assertNoSpool(root: string): Promise<void> {
  expect((await readdir(root)).filter((name) => name.startsWith('dentpilot-upload-'))).toEqual([]);
}

describe('Phase 3B closure spool ownership', () => {
  it.each([
    ['empty upload', empty],
    ['stream read failure', broken],
    ['actual byte-limit rejection', tooLarge],
  ])('removes its filesystem spool after %s', async (_name, source) => {
    const root = await mkdtemp(join(tmpdir(), 'dentpilot-spool-'));
    const service = new StreamingMediaIngestService(
      { MEDIA_TEMP_ROOT: root, MAX_MEDIA_BYTES: 2, MAX_CONCURRENT_MEDIA_INSPECTIONS: 1 } as never,
      { putStream: async () => undefined, delete: async () => undefined } as never,
      { claimForContent: async () => ({ session: claimed, claimed: true }), failClaimedProcessing: async () => undefined, markStorageCleanupComplete: async () => undefined } as never,
    );
    try {
      await expect(service.ingest(actor, claimed.id, source(), () => false)).rejects.toMatchObject({ code: expect.any(String) });
      await assertNoSpool(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});


describe('Phase 3B closure temporary storage fault', () => {
  it('fails deterministically when the spool root cannot be created', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dentpilot-spool-'));
    await writeFile(join(root, 'file.txt'), 'test');
    const invalidPath = join(root, 'file.txt', 'invalid');
    const service = new StreamingMediaIngestService(
      { MEDIA_TEMP_ROOT: invalidPath, MAX_MEDIA_BYTES: 1024, MAX_CONCURRENT_MEDIA_INSPECTIONS: 1 } as never,
      { putStream: async () => undefined, delete: async () => undefined } as never,
      { claimForContent: async () => ({ session: claimed, claimed: true }), failClaimedProcessing: async () => undefined, markStorageCleanupComplete: async () => undefined } as never,
    );
    try {
      await expect(service.ingest(actor, claimed.id, validPng(), () => false)).rejects.toMatchObject({ code: 'TEMP_STORAGE_FAILED' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('Phase 3B closure post-spool failures', () => {
  it('removes the real spool and records a recoverable failure after inspection rejection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dentpilot-spool-'));
    let failed = false;
    const service = new StreamingMediaIngestService(
      { MEDIA_TEMP_ROOT: root, MAX_MEDIA_BYTES: 1024, MAX_CONCURRENT_MEDIA_INSPECTIONS: 1 } as never,
      { putStream: async () => undefined, delete: async () => undefined } as never,
      { claimForContent: async () => ({ session: claimed, claimed: true }), failClaimedProcessing: async () => { failed = true; }, markStorageCleanupComplete: async () => undefined } as never,
    );
    try {
      await expect(service.ingest(actor, claimed.id, tooLarge(), () => false)).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_FORMAT' });
      expect(failed).toBe(true);
      await assertNoSpool(root);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});


describe('Phase 3B closure persistence and storage fault seams', () => {
  it('removes spool and fails the session when private storage write fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dentpilot-spool-'));
    let failureCode: string | undefined;
    const service = new StreamingMediaIngestService(
      { MEDIA_TEMP_ROOT: root, MAX_MEDIA_BYTES: 1024, MAX_CONCURRENT_MEDIA_INSPECTIONS: 1, MAX_MEDIA_PIXELS: 100, MAX_MEDIA_DIMENSION: 10 } as never,
      { putStream: async () => { throw new StorageError('put failure', 'STORAGE_WRITE_FAILED'); }, delete: async () => undefined } as never,
      { claimForContent: async () => ({ session: claimed, claimed: true }), failClaimedProcessing: async (_actor: unknown, _session: unknown, code: string) => { failureCode = code; }, markStorageCleanupComplete: async () => undefined } as never,
    );
    try {
      await expect(service.ingest(actor, claimed.id, validPng(), () => false)).rejects.toMatchObject({ code: 'STORAGE_WRITE_FAILED' });
      expect(failureCode).toBe('STORAGE_WRITE_FAILED');
      await assertNoSpool(root);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('retains recovery work when finalization and immediate object cleanup both fail', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dentpilot-spool-'));
    let markedFailed = false;
    let markedClean = false;
    const service = new StreamingMediaIngestService(
      { MEDIA_TEMP_ROOT: root, MAX_MEDIA_BYTES: 1024, MAX_CONCURRENT_MEDIA_INSPECTIONS: 1, MAX_MEDIA_PIXELS: 100, MAX_MEDIA_DIMENSION: 10 } as never,
      { putStream: async () => undefined, delete: async () => { throw new Error('delete failure'); } } as never,
      { claimForContent: async () => ({ session: claimed, claimed: true }), finalizeSource: async () => { throw new Error('finalize failure'); }, failClaimedProcessing: async () => { markedFailed = true; }, markStorageCleanupComplete: async () => { markedClean = true; } } as never,
    );
    try {
      await expect(service.ingest(actor, claimed.id, validPng(), () => false)).rejects.toMatchObject({ code: 'PERSISTENCE_FAILED' });
      expect(markedFailed).toBe(true);
      expect(markedClean).toBe(false);
      await assertNoSpool(root);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
