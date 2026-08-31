import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import {
  caseIdParamsSchema,
  createCaseRequestSchema,
  type CaseDto,
  type WorkspaceDto,
} from '@dentpilot/contracts';

import { authenticatedActor, type AuthenticatedFastifyRequest } from '../common/authentication.guard.js';
import { infrastructureTokens, type ApplicationServices } from '../modules/application-services.js';
import {
  presentAuditEvent,
  presentCase,
  presentGenerationJob,
  presentMedia,
  presentProject,
} from './api-presenters.js';

@Controller('api/v1/cases')
export class CasesController {
  public constructor(
    @Inject(infrastructureTokens.applicationServices)
    private readonly services: ApplicationServices,
  ) {}

  @Get()
  public async list(@Req() request: AuthenticatedFastifyRequest): Promise<{ readonly cases: readonly CaseDto[] }> {
    const cases = await this.services.cases.list(authenticatedActor(request));
    return { cases: cases.map(presentCase) };
  }

  @Post()
  public async create(
    @Req() request: AuthenticatedFastifyRequest,
    @Body() body: unknown,
  ): Promise<{ readonly id: string }> {
    return this.services.cases.create(authenticatedActor(request), createCaseRequestSchema.parse(body));
  }

  @Get(':caseId')
  public async workspace(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('caseId') caseId: string,
  ): Promise<WorkspaceDto> {
    const parsedCaseId = caseIdParamsSchema.parse({ caseId }).caseId;
    const workspace = await this.services.cases.getWorkspace(
      authenticatedActor(request),
      parsedCaseId,
    );
    return {
      patientCase: presentCase(workspace.patientCase),
      media: workspace.media.map(presentMedia),
      projects: workspace.projects.map(presentProject),
      generations: workspace.generations.map(presentGenerationJob),
      audits: workspace.audits.map(presentAuditEvent),
    };
  }
}
