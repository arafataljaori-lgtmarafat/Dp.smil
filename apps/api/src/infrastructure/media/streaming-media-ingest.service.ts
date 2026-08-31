import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { once } from 'node:events';

import { Injectable } from '@nestjs/common';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';

import { MediaIngestError, StorageError } from '@dentpilot/domain';
import type {
  Actor,
  ObjectStoragePort,
  MediaUploadSessionService,
} from '@dentpilot/application';

import type { AppConfig } from '../../config/app-config.js';

const acceptedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
type AcceptedMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

interface SpooledUpload {
  readonly path: string;
  readonly byteSize: number;
  readonly sha256: string;
}

class InspectionSemaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  public constructor(private readonly limit: number, private readonly maxWaiting = limit * 2) {}

  public async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1;
      return () => this.release();
    }
    if (this.waiting.length >= this.maxWaiting) {
      throw new MediaIngestError('PERSISTENCE_FAILED', 'Media inspection capacity is temporarily exhausted.');
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    return () => this.release();
  }

  private release(): void {
    this.active -= 1;
    this.waiting.shift()?.();
  }
}

@Injectable()
export class StreamingMediaIngestService {
  private readonly inspections: InspectionSemaphore;

  public constructor(
    private readonly config: AppConfig,
    private readonly storage: ObjectStoragePort,
    private readonly uploadSessions: MediaUploadSessionService,
  ) {
    this.inspections = new InspectionSemaphore(config.MAX_CONCURRENT_MEDIA_INSPECTIONS);
  }

  public async ingest(
    actor: Actor,
    uploadId: string,
    file: AsyncIterable<Uint8Array>,
    wasTruncated: () => boolean,
    verifyNoAdditionalFiles: () => Promise<void> = () => Promise.resolve(),
  ): Promise<{ readonly mediaId: string; readonly status: 'committed' }> {
    const claim = await this.uploadSessions.claimForContent(actor, uploadId);
    if (!claim.claimed) {
      if (claim.session.committedMediaId === null) {
        throw new MediaIngestError('PERSISTENCE_FAILED', 'Committed upload session did not contain its media reference.');
      }
      return { mediaId: claim.session.committedMediaId, status: 'committed' };
    }

    const session = claim.session;
    let spool: SpooledUpload | undefined;
    let objectWritten = false;
    try {
      spool = await this.spool(file, wasTruncated);
      await verifyNoAdditionalFiles();
      const inspected = await this.inspect(spool.path);
      await this.storage.putStream({
        key: session.targetStorageKey!,
        body: createReadStream(spool.path),
        contentType: inspected.mimeType,
        contentLength: spool.byteSize,
      });
      objectWritten = true;
      const finalized = await this.uploadSessions.finalizeSource(actor, {
        uploadSession: session,
        mimeType: inspected.mimeType,
        byteSize: spool.byteSize,
        width: inspected.width,
        height: inspected.height,
        sha256: spool.sha256,
      });
      return { mediaId: finalized.mediaId, status: 'committed' };
    } catch (cause) {
      const failure = this.classify(cause);
      // Persist the fenced failed state before compensation: if deletion is unavailable,
      // reconciliation has a durable, owner-scoped key to retry after this process exits.
      await this.uploadSessions.failClaimedProcessing(actor, session, failure.code).catch(() => undefined);
      if (objectWritten && session.targetStorageKey !== null) {
        try {
          await this.storage.delete(session.targetStorageKey);
          await this.uploadSessions.markStorageCleanupComplete(actor, session).catch(() => undefined);
        } catch {
          // The failed session and its cleanup marker are the durable retry ledger.
        }
      }
      throw failure;
    } finally {
      if (spool !== undefined) await this.removeSpool(spool.path);
    }
  }

  private async spool(input: AsyncIterable<Uint8Array>, wasTruncated: () => boolean): Promise<SpooledUpload> {
    const root = this.config.MEDIA_TEMP_ROOT;
    const path = join(root, `dentpilot-upload-${randomUUID()}.spool`);
    try {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const output = createWriteStream(path, { flags: 'wx', mode: 0o600 });
      const digest = createHash('sha256');
      let byteSize = 0;
      try {
        for await (const chunk of input) {
          byteSize += chunk.byteLength;
          if (byteSize > this.config.MAX_MEDIA_BYTES) {
            output.destroy();
            throw new MediaIngestError('MEDIA_TOO_LARGE', 'Upload stream exceeded its actual byte limit.');
          }
          digest.update(chunk);
          if (!output.write(chunk)) await once(output, 'drain');
        }
        output.end();
        await once(output, 'finish');
        if (wasTruncated()) {
          throw new MediaIngestError('MEDIA_TOO_LARGE', 'Fastify truncated the upload at its byte limit.');
        }
      } catch (cause) {
        output.destroy();
        await this.removeSpool(path);
        throw cause;
      }
      if (byteSize === 0) throw new MediaIngestError('MEDIA_EMPTY', 'Upload stream contained no bytes.');
      return { path, byteSize, sha256: digest.digest('hex') };
    } catch (cause) {
      await this.removeSpool(path);
      if (cause instanceof MediaIngestError) throw cause;
      throw new MediaIngestError('TEMP_STORAGE_FAILED', 'Could not write the private upload spool.', {
        reason: cause instanceof Error ? cause.name : 'unknown',
      });
    }
  }

  private async inspect(path: string): Promise<{ readonly mimeType: AcceptedMimeType; readonly width: number; readonly height: number }> {
    const release = await this.inspections.acquire();
    try {
      const detected = await fileTypeFromFile(path);
      if (detected === undefined || !acceptedMimeTypes.has(detected.mime)) {
        throw new MediaIngestError('UNSUPPORTED_MEDIA_FORMAT', 'Uploaded bytes are not an accepted image format.');
      }
      const mimeType = detected.mime as AcceptedMimeType;
      let metadata: sharp.Metadata;
      try {
        const image = sharp(path, { failOn: 'error', limitInputPixels: this.config.MAX_MEDIA_PIXELS, pages: 1 });
        metadata = await image.metadata();
        if (metadata.pages !== undefined && metadata.pages > 1) {
          throw new MediaIngestError('MEDIA_DECODE_FAILED', 'Animated and multi-page image input is not supported.');
        }
        await image.toBuffer();
      } catch (cause) {
        if (cause instanceof MediaIngestError) throw cause;
        throw new MediaIngestError('MEDIA_DECODE_FAILED', 'Uploaded image failed full decode validation.');
      }
      if (metadata.width === undefined || metadata.height === undefined || metadata.width <= 0 || metadata.height <= 0) {
        throw new MediaIngestError('MEDIA_DIMENSIONS_INVALID', 'Uploaded image does not declare valid dimensions.');
      }
      if (metadata.width > this.config.MAX_MEDIA_DIMENSION || metadata.height > this.config.MAX_MEDIA_DIMENSION) {
        throw new MediaIngestError('MEDIA_DIMENSIONS_INVALID', 'Uploaded image dimensions exceed the configured limit.');
      }
      if (metadata.width * metadata.height > this.config.MAX_MEDIA_PIXELS) {
        throw new MediaIngestError('MEDIA_PIXEL_LIMIT_EXCEEDED', 'Uploaded image pixel count exceeds the configured limit.');
      }
      return { mimeType, width: metadata.width, height: metadata.height };
    } finally {
      release();
    }
  }

  private classify(cause: unknown): MediaIngestError {
    if (cause instanceof MediaIngestError) return cause;
    if (cause instanceof StorageError) {
      return new MediaIngestError('STORAGE_WRITE_FAILED', 'Private object storage write did not complete.', { failureCode: cause.failureCode });
    }
    return new MediaIngestError('PERSISTENCE_FAILED', 'Media ingest did not complete safely.', {
      reason: cause instanceof Error ? cause.name : 'unknown',
    });
  }

  private async removeSpool(path: string): Promise<void> {
    await rm(path, { force: true }).catch(() => undefined);
  }
}
