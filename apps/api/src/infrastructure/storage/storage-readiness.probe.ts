import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';

import type { ObjectStoragePort } from '@dentpilot/application';

import type { AppConfig } from '../../config/app-config.js';
import { infrastructureTokens } from '../../modules/application-services.js';

@Injectable()
export class StorageReadinessProbe implements OnApplicationBootstrap {
  public constructor(
    @Inject(infrastructureTokens.config) private readonly config: AppConfig,
    @Inject(infrastructureTokens.storage) private readonly storage: ObjectStoragePort,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    if (this.config.OBJECT_STORAGE_DRIVER === 's3') {
      await this.storage.probeReadiness();
    }
  }
}
