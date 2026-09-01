import { canonicalVideoExportRequestPayload, type VideoExportRequestIdentity } from './video-export-identity.js';
import type { ClockPort, DigestPort, IdGeneratorPort, UnitOfWorkPort, VideoExportJobData, VideoExportQueuePort, VideoExportVersionData } from './ports.js';

export class VideoExportService {
  public constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly digest: DigestPort,
    private readonly queue: VideoExportQueuePort,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort,
  ) {}

  public async requestExport(identity: VideoExportRequestIdentity): Promise<{ readonly jobId: string; readonly versionId: string; readonly reused: boolean }> {
    const payload = canonicalVideoExportRequestPayload(identity);
    const payloadBytes = new TextEncoder().encode(payload);
    const fingerprint = await this.digest.sha256(payloadBytes);

    return this.unitOfWork.transaction(async (tx) => {
      const repo = tx.videoExports;
      
      const existing = await repo.findJobByFingerprint(fingerprint);
      if (existing !== null) {
        return { jobId: existing.id, versionId: existing.id, reused: true };
      }

      const jobId = this.ids.next();
      const versionId = this.ids.next();
      const now = this.clock.now();

      const job: VideoExportJobData = {
        id: jobId,
        ownerUserId: identity.ownerUserId,
        projectId: identity.projectId,
        revisionId: identity.revisionId,
        templateId: identity.templateId,
        templateVersion: identity.templateVersion,
        requestFingerprint: fingerprint,
        rendererContractVersion: identity.rendererContractVersion,
        status: 'queued',
        createdAt: now,
      };

      const version: VideoExportVersionData = {
        id: versionId,
        ownerUserId: identity.ownerUserId,
        exportJobId: jobId,
        versionNumber: 1,
        mediaAssetId: null,
        createdAt: now,
      };

      await repo.insertJobAndVersion(job, version);
      await this.queue.dispatchExport(jobId);

      return { jobId, versionId, reused: false };
    });
  }
}
