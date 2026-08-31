import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import { resolveGenerationWorkerActor } from '../common/system-actor.js';
import { InMemoryGenerationQueueAdapter } from '../infrastructure/queue/in-memory-generation-queue.adapter.js';
import { infrastructureTokens, type ApplicationServices } from './application-services.js';

@Injectable()
export class GenerationQueueBootstrap implements OnModuleInit {
  public constructor(
    @Inject(infrastructureTokens.queue) private readonly queue: InMemoryGenerationQueueAdapter,
    @Inject(infrastructureTokens.applicationServices)
    private readonly services: ApplicationServices,
  ) {}

  public onModuleInit(): void {
    this.queue.setExecutor(async (message) => {
      const systemActor = resolveGenerationWorkerActor(message.ownerUserId, message.correlationId);
      await this.services.generations.process(message, systemActor);
    });
  }
}
