import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import type { ObjectStoragePort, UnitOfWorkPort } from '@dentpilot/application';

import type { AppConfig } from '../../config/app-config.js';

@Injectable()
export class MediaUploadReconcilerService {
  public constructor(
    private readonly config: AppConfig,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly storage: ObjectStoragePort,
  ) {}

  public async reconcile(now = new Date(), limit = 100): Promise<void> {
    await this.cleanupTempFiles(now, limit);
    const expiredCreated = await this.unitOfWork.uploadSessions.listExpiredCreated(now, limit);
    await Promise.all(expiredCreated.map(async (session) => {
      await this.unitOfWork.transaction(({ uploadSessions }) => uploadSessions.markExpired({
        ownerUserId: session.ownerUserId,
        uploadSessionId: session.id,
        now,
        finishedAt: now,
      }));
    }));

    const processingStartedBefore = new Date(now.getTime() - this.config.MEDIA_UPLOAD_PROCESSING_TIMEOUT_SECONDS * 1000);
    const timedOut = await this.unitOfWork.uploadSessions.listTimedOutProcessing(processingStartedBefore, limit);
    await Promise.all(timedOut.map(async (session) => {
      const processingToken = session.processingToken;
      if (processingToken === null) return;
      const changed = await this.unitOfWork.transaction(({ uploadSessions }) => uploadSessions.markProcessingTimedOut({
        ownerUserId: session.ownerUserId,
        uploadSessionId: session.id,
        processingToken,
        processingStartedBefore,
        finishedAt: now,
      }));
      if (changed !== null) await this.cleanupFailedOrphan(changed);
    }));

    const cleanupPending = await this.unitOfWork.uploadSessions.listCleanupPending(limit);
    await Promise.all(cleanupPending.map((session) => this.cleanupFailedOrphan(session)));
  }

  public async cleanupTempFiles(now = new Date(), limit = 100): Promise<void> {
    const root = this.config.MEDIA_TEMP_ROOT;
    let entries: readonly string[];
    try {
      entries = await readdir(root);
    } catch {
      return;
    }
    const threshold = now.getTime() - this.config.MEDIA_TEMP_CLEANUP_AGE_SECONDS * 1000;
    for (const name of entries.filter((entry) => /^dentpilot-upload-[0-9a-f-]{36}\.spool$/i.test(entry)).slice(0, limit)) {
      const path = join(root, name);
      try {
        const details = await stat(path);
        if (details.isFile() && details.mtimeMs <= threshold) await rm(path, { force: true });
      } catch {
        // Concurrent cleanup or an interrupted upload may have removed the file already.
      }
    }
  }

  public async cleanupFailedOrphan(session: {
    readonly id: string;
    readonly ownerUserId: string;
    readonly caseId: string;
    readonly status: string;
    readonly targetStorageKey: string | null;
    readonly committedMediaId?: string | null;
  }): Promise<void> {
    if (session.status !== 'failed' || session.targetStorageKey === null || session.committedMediaId !== null) return;
    const committedMedia = await this.unitOfWork.media.findByStorageKey(session.ownerUserId, session.caseId, session.targetStorageKey);
    if (committedMedia !== null) return;
    try {
      await this.storage.delete(session.targetStorageKey);
      await this.unitOfWork.transaction(({ uploadSessions }) => uploadSessions.markStorageCleanupComplete({
        ownerUserId: session.ownerUserId,
        uploadSessionId: session.id,
      }));
    } catch {
      // Keep the durable cleanup marker unchanged for the next bounded reconciliation pass.
    }
  }

  public async deleteOrphanIfSafe(session: {
    readonly ownerUserId: string;
    readonly caseId: string;
    readonly status: string;
    readonly targetStorageKey: string | null;
  }): Promise<void> {
    if (session.status === 'committed' || session.targetStorageKey === null) return;
    const committedMedia = await this.unitOfWork.media.findByStorageKey(
      session.ownerUserId,
      session.caseId,
      session.targetStorageKey,
    );
    if (committedMedia !== null) return;
    await this.storage.delete(session.targetStorageKey).catch(() => undefined);
  }
}
