import { Controller, Get, Headers, Inject, Param, Post, Req } from '@nestjs/common';
import type { GenerationStatusResponse } from '@dentpilot/contracts';
import {
  generationJobIdParamsSchema,
  idempotencyKeySchema,
  projectIdParamsSchema,
} from '@dentpilot/contracts';

import { authenticatedActor, type AuthenticatedFastifyRequest } from '../common/authentication.guard.js';
import { infrastructureTokens, type ApplicationServices } from '../modules/application-services.js';
import { presentGenerationJob, presentGenerationVersion } from './api-presenters.js';

@Controller('api/v1')
export class GenerationsController {
  public constructor(
    @Inject(infrastructureTokens.applicationServices)
    private readonly services: ApplicationServices,
  ) {}

  @Post('projects/:projectId/generations')
  public async requestGeneration(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('projectId') projectId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<{ readonly id: string; readonly created: boolean }> {
    const parsedProjectId = projectIdParamsSchema.parse({ projectId }).projectId;
    const parsedIdempotencyKey = idempotencyKeySchema.parse(idempotencyKey);
    return this.services.generations.request(authenticatedActor(request), {
      projectId: parsedProjectId,
      idempotencyKey: parsedIdempotencyKey,
    });
  }

  @Get('generations/:generationJobId')
  public async getGeneration(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('generationJobId') generationJobId: string,
  ): Promise<GenerationStatusResponse> {
    const parsedGenerationJobId = generationJobIdParamsSchema.parse({ generationJobId }).generationJobId;
    const result = await this.services.generations.get(
      authenticatedActor(request),
      parsedGenerationJobId,
    );
    return {
      job: presentGenerationJob(result.job),
      version: result.version === null ? null : presentGenerationVersion(result.version),
    };
  }
}
