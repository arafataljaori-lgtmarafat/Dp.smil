import type { VideoCompositionDocument, VideoTemplateDefinition } from '@dentpilot/contracts';
import { evaluateVideoCompositionAtTime, resolveVideoTemplateDurationMs, resolveVideoTemplateForDocument } from './video-composition-engine.js';
import { requireBuiltInVideoTemplate } from './video-template-catalog.js';
import type { CreationRenderAsset } from './composition-engine.js';
import type { VideoEncoderPort } from './video-encoder.js';
import type { 
  HeadlessRendererPort, 
  UnitOfWorkPort, 
  VideoExportRepositoryPort, 
  ObjectStoragePort, 
  IdGeneratorPort, 
  ClockPort, 
  MediaRepositoryPort,
  CreationDocumentRepositoryPort 
} from './ports.js';
import * as fs from 'node:fs';

export class VideoExportWorker {
  public constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly storage: ObjectStoragePort,
    private readonly renderer: HeadlessRendererPort,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort,
    private readonly createEncoder: (options: { width: number; height: number; fps: number }) => VideoEncoderPort,
  ) {}

  public async processJob(jobId: string): Promise<void> {
    await this.unitOfWork.transaction(async (tx) => {
      const exportRepo = tx.videoExports;
      await exportRepo.updateJobStatus(jobId, 'processing');
      const latestVersion = await exportRepo.findLatestVersion(jobId);
      if (!latestVersion) throw new Error('No version found for job');
      await exportRepo.updateVersionStatus(latestVersion.id, 'processing');
    });

    try {
      const { job, document, template, assets } = await this.unitOfWork.transaction(async (tx) => {
        const exportRepo = tx.videoExports;
        const creationRepo = tx.creations;
        
        const job = await exportRepo.findById(jobId);
        if (!job) throw new Error('Job not found');
        
        const revision = await creationRepo.findRevision(job.ownerUserId, job.projectId, job.revisionId);
        if (!revision) throw new Error('Creation revision not found');
        
        const document = revision.document as VideoCompositionDocument;
        const baseTemplate = requireBuiltInVideoTemplate(job.templateId, job.templateVersion);
        const template = resolveVideoTemplateForDocument({ document, template: baseTemplate });

        // In a real scenario we'd resolve actual dimensions from MediaRepository and download files to local disk
        const assets: CreationRenderAsset[] = [];
        
        return { job, document, template, assets };
      });

      const fps = 60;
      const durationMs = resolveVideoTemplateDurationMs(template);
      const totalFrames = Math.ceil((durationMs / 1000) * fps);
      const target = { width: 1080, height: 1920 };

      const encoder = this.createEncoder({ width: target.width, height: target.height, fps });

      for (let frame = 0; frame < totalFrames; frame++) {
        const timeMs = (frame / fps) * 1000;
        const plan = evaluateVideoCompositionAtTime({ document, template, assets, timeMs, target });
        
        const rawRgba = await this.renderer.renderFrame(plan, target.width, target.height);
        encoder.pushFrame(rawRgba);
      }

      const outputFilePath = await encoder.finish();

      // Upload to object storage and create MediaAsset
      const mediaId = this.ids.next();
      const objectKey = `video-exports/${job.ownerUserId}/${mediaId}.mp4`;
      const fileBuffer = fs.readFileSync(outputFilePath); // For a real implementation, use streaming
      
      await this.storage.putStream({ key: objectKey, body: fs.createReadStream(outputFilePath), contentType: 'video/mp4' });

      await this.unitOfWork.transaction(async (tx) => {
        const exportRepo = tx.videoExports;
        const mediaRepo = tx.media;
        
        await mediaRepo.create({
          id: mediaId,
          ownerUserId: job.ownerUserId,
          kind: 'derived',
          storageKey: objectKey,
          mimeType: 'video/mp4',
          byteSize: fileBuffer.length,
          width: target.width,
          height: target.height,
          caseId: job.projectId,
          purpose: 'mock_simulation_result',
          sha256: 'export-sha',
          sourceMediaId: null,
          createdById: job.ownerUserId,
        });

        const latestVersion = await exportRepo.findLatestVersion(jobId);
        if (latestVersion) {
          await exportRepo.attachMediaToVersion(latestVersion.id, mediaId);
          await exportRepo.updateVersionStatus(latestVersion.id, 'completed');
        }
        await exportRepo.updateJobStatus(jobId, 'completed');
      });

      // Cleanup
      fs.unlinkSync(outputFilePath);

    } catch (error) {
      await this.unitOfWork.transaction(async (tx) => {
        const exportRepo = tx.videoExports;
        await exportRepo.updateJobStatus(jobId, 'failed');
        const latestVersion = await exportRepo.findLatestVersion(jobId);
        if (latestVersion) await exportRepo.updateVersionStatus(latestVersion.id, 'failed');
      });
      throw error;
    }
  }
}
