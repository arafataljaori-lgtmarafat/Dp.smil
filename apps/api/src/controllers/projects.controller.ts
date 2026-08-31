import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import { caseIdParamsSchema, createProjectRequestSchema } from '@dentpilot/contracts';

import { authenticatedActor, type AuthenticatedFastifyRequest } from '../common/authentication.guard.js';
import { infrastructureTokens, type ApplicationServices } from '../modules/application-services.js';

@Controller('api/v1/cases/:caseId/projects')
export class ProjectsController {
  public constructor(
    @Inject(infrastructureTokens.applicationServices)
    private readonly services: ApplicationServices,
  ) {}

  @Post()
  public async createMockSmileSimulation(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
  ): Promise<{ readonly id: string }> {
    const input = createProjectRequestSchema.parse(body);
    const parsedCaseId = caseIdParamsSchema.parse({ caseId }).caseId;
    return this.services.projects.createMockSmileSimulation(authenticatedActor(request), {
      caseId: parsedCaseId,
      sourceMediaId: input.sourceMediaId,
    });
  }
}
