import { describe, expect, it } from 'vitest';

import { MediaUploadReconcilerService } from '../src/infrastructure/media/media-upload-reconciler.service.js';

const owner = '00000000-0000-4000-8000-000000000001';
const caseId = '00000000-0000-4000-8000-000000000002';
const makeSession = (id: string) => ({ id, ownerUserId: owner, caseId, status: 'failed' as const, targetStorageKey: `users/${owner}/cases/${caseId}/source/${id}`, committedMediaId: null });

describe('MediaUploadReconcilerService batch draining', () => {
  it('converges pending cleanup across bounded consecutive cycles', async () => {
    const pending = [makeSession('00000000-0000-4000-8000-000000000011'), makeSession('00000000-0000-4000-8000-000000000012'), makeSession('00000000-0000-4000-8000-000000000013')];
    const deleted: string[] = [];
    const reconciler = new MediaUploadReconcilerService(
      { MEDIA_TEMP_ROOT: '/not-used', MEDIA_TEMP_CLEANUP_AGE_SECONDS: 60, MEDIA_UPLOAD_PROCESSING_TIMEOUT_SECONDS: 60 } as never,
      {
        uploadSessions: {
          listExpiredCreated: async () => [], listTimedOutProcessing: async () => [],
          listCleanupPending: async (limit: number) => pending.slice(0, limit),
          markStorageCleanupComplete: async ({ uploadSessionId }: { uploadSessionId: string }) => {
            const index = pending.findIndex((item) => item.id === uploadSessionId);
            if (index >= 0) pending.splice(index, 1);
            return null;
          },
        },
        media: { findByStorageKey: async () => null },
        transaction: async <T>(work: (ports: never) => Promise<T>) => work({ uploadSessions: { markStorageCleanupComplete: async ({ uploadSessionId }: { uploadSessionId: string }) => { const index = pending.findIndex((item) => item.id === uploadSessionId); if (index >= 0) pending.splice(index, 1); return null; } } } as never),
      } as never,
      { delete: async (key: string) => { deleted.push(key); } } as never,
    );
    for (let cycle = 0; cycle < 3; cycle += 1) await reconciler.reconcile(new Date(), 1);
    expect(pending).toEqual([]);
    expect(deleted).toHaveLength(3);
  });
});
