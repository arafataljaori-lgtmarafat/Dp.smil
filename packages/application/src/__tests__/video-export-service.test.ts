import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoExportService } from '../video-export-service.js';
import type { UnitOfWorkPort, DigestPort, VideoExportQueuePort, IdGeneratorPort, ClockPort, VideoExportRepositoryPort } from '../ports.js';
import type { VideoExportRequestIdentity } from '../video-export-identity.js';

describe('VideoExportService (Phase 5 Stage 4)', () => {
  let mockUow: UnitOfWorkPort;
  let mockDigest: DigestPort;
  let mockQueue: VideoExportQueuePort;
  let mockIds: IdGeneratorPort;
  let mockClock: ClockPort;
  let mockRepo: VideoExportRepositoryPort;

  beforeEach(() => {
    mockRepo = {
      insertJobAndVersion: vi.fn().mockResolvedValue(undefined),
      findJobByFingerprint: vi.fn().mockResolvedValue(null),
      updateVersionStatus: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
      findLatestVersion: vi.fn(),
      updateJobStatus: vi.fn(),
      attachMediaToVersion: vi.fn(),
    };
    mockUow = {
      transaction: vi.fn(async (cb) => cb({ videoExports: mockRepo })),
    } as unknown as UnitOfWorkPort;
    mockDigest = {
      sha256: vi.fn(async () => `hash-payload`),
    } as unknown as DigestPort;
    mockQueue = {
      dispatchExport: vi.fn().mockResolvedValue(undefined),
      consumeExports: vi.fn(),
    };
    let i = 0;
    mockIds = {
      next: vi.fn(() => `id-${++i}`),
    };
    mockClock = {
      now: vi.fn(() => new Date('2026-09-01T00:00:00.000Z')),
    };
  });

  const baseIdentity: VideoExportRequestIdentity = {
    ownerUserId: 'user-1',
    projectId: 'proj-1',
    revisionId: 'rev-1',
    documentSha256: 'sha-doc',
    templateId: 'temp-1',
    templateVersion: 1,
    boundAssets: [
      { bindingKey: 'before', mediaId: 'media-b', sha256: 'hash-b' },
      { bindingKey: 'after', mediaId: 'media-a', sha256: 'hash-a' },
    ],
    renderProfileKey: 'export',
    rendererContractVersion: 1,
  };

  it('F1 Idempotency: reuses existing job if fingerprint matches', async () => {
    const service = new VideoExportService(mockUow, mockDigest, mockQueue, mockIds, mockClock);
    
    (mockRepo.findJobByFingerprint as any).mockResolvedValue({ id: 'existing-job' });

    const result = await service.requestExport(baseIdentity);

    expect(result.reused).toBe(true);
    expect(result.jobId).toBe('existing-job');
    expect(mockRepo.insertJobAndVersion).not.toHaveBeenCalled();
    expect(mockQueue.dispatchExport).not.toHaveBeenCalled();
  });

  it('F2 New Request: persists Job + Version and dispatches queue if fingerprint is novel', async () => {
    const service = new VideoExportService(mockUow, mockDigest, mockQueue, mockIds, mockClock);
    
    const result = await service.requestExport(baseIdentity);

    expect(result.reused).toBe(false);
    expect(result.jobId).toBe('id-1');
    expect(result.versionId).toBe('id-2');
    expect(mockRepo.insertJobAndVersion).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'id-1', status: 'queued', ownerUserId: 'user-1' }),
      expect.objectContaining({ id: 'id-2', exportJobId: 'id-1' })
    );
    expect(mockQueue.dispatchExport).toHaveBeenCalledWith('id-1');
  });
});
