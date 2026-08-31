import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';

import type { AppConfig } from '../../config/app-config.js';
import { MediaUploadReconcilerService } from './media-upload-reconciler.service.js';

/**
 * Runs bounded reconciliation while the API remains alive. PostgreSQL predicates remain the
 * cross-process authority; this class only avoids overlapping work inside this API instance.
 */
@Injectable()
export class MediaUploadRecoveryBootstrap implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MediaUploadRecoveryBootstrap.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private activeRun: Promise<void> | undefined;
  private stopping = false;

  public constructor(
    private readonly config: AppConfig,
    private readonly reconciler: MediaUploadReconcilerService,
  ) {}

  public onApplicationBootstrap(): void {
    void this.scheduleRun();
    this.timer = setInterval(() => { void this.scheduleRun(); }, this.config.MEDIA_RECONCILIATION_INTERVAL_SECONDS * 1000);
    this.timer.unref?.();
  }

  public async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    await this.activeRun;
  }

  private scheduleRun(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (this.activeRun !== undefined) return this.activeRun;
    const run = this.reconciler
      .reconcile(new Date(), this.config.MEDIA_RECONCILIATION_BATCH_SIZE)
      .catch((error: unknown) => {
        this.logger.warn(`Media upload reconciliation cycle failed safely: ${error instanceof Error ? error.name : 'unknown'}`);
      })
      .finally(() => {
        if (this.activeRun === run) this.activeRun = undefined;
      });
    this.activeRun = run;
    return run;
  }
}
