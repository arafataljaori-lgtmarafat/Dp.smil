import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Put, Req } from '@nestjs/common';
import {
  caseIdParamsSchema,
  createCreationRequestSchema,
  createCreationRevisionRequestSchema,
  creationIdParamsSchema,
  creationRevisionIdParamsSchema,
  idempotencyKeySchema,
  replaceCreationBindingsRequestSchema,
  updateCreationDraftRequestSchema,
} from '@dentpilot/contracts';

import { authenticatedActor, type AuthenticatedFastifyRequest } from '../common/authentication.guard.js';
import {
  presentCreationBinding,
  presentCreationDraft,
  presentCreationRevision,
  presentProject,
  presentVideoCreationDraft,
  presentVideoCreationRevision,
} from './api-presenters.js';
import { infrastructureTokens, type ApplicationServices } from '../modules/application-services.js';

@Controller('api/v1')
export class CreationsController {
  public constructor(
    @Inject(infrastructureTokens.applicationServices)
    private readonly services: ApplicationServices,
  ) {}

  /**
   * Document routing invariant, API boundary (mission section 1 & 9): the request body's
   * own `type` discriminant picks image vs video creation — the contract schema is a
   * z.discriminatedUnion, so an unrecognized/mixed shape never reaches either branch.
   * Video creation additionally requires the Idempotency-Key header (mission section 7);
   * legacy image creation is untouched and stays non-idempotent, exactly as specified.
   */
  @Post('cases/:caseId/creations')
  public async create(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('caseId') caseId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const input = createCreationRequestSchema.parse(body);
    const parsedCaseId = caseIdParamsSchema.parse({ caseId }).caseId;
    const actor = authenticatedActor(request);

    if (input.type === 'before_after_video') {
      const created = await this.services.creations.createBeforeAfterVideo(actor, {
        caseId: parsedCaseId,
        beforeMediaId: input.beforeMediaId,
        afterMediaId: input.afterMediaId,
        idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
      });
      return {
        project: presentProject(created.project),
        bindings: created.bindings.map(presentCreationBinding),
        draft: presentVideoCreationDraft(created.draft),
        created: created.created,
      };
    }

    const created = await this.services.creations.createBeforeAfterImage(actor, {
      caseId: parsedCaseId,
      sourceMediaId: input.sourceMediaId,
    });
    return {
      project: presentProject(created.project),
      bindings: created.bindings.map(presentCreationBinding),
      draft: presentCreationDraft(created.draft),
    };
  }

  @Get('cases/:caseId/creations')
  public async listByCase(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('caseId') caseId: string,
  ) {
    const projects = await this.services.creations.listCreations(
      authenticatedActor(request),
      caseIdParamsSchema.parse({ caseId }).caseId,
    );
    return { data: projects.map(presentProject) };
  }

  @Get('creations/:creationId')
  public async get(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('creationId') creationId: string,
  ) {
    const creation = await this.services.creations.getCreation(
      authenticatedActor(request),
      creationIdParamsSchema.parse({ creationId }).creationId,
    );
    return {
      project: presentProject(creation.project),
      bindings: creation.bindings.map(presentCreationBinding),
      draft: creation.project.type === 'before_after_video'
        ? presentVideoCreationDraft(creation.draft)
        : presentCreationDraft(creation.draft),
    };
  }

  @Put('creations/:creationId/bindings')
  public async replaceBindings(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('creationId') creationId: string,
    @Body() body: unknown,
  ) {
    const input = replaceCreationBindingsRequestSchema.parse(body);
    const actor = authenticatedActor(request);
    const parsedCreationId = creationIdParamsSchema.parse({ creationId }).creationId;
    // Project type is looked up from the persisted record (never inferred from the
    // mutated document's shape) purely to select the response presenter — the mutation
    // itself independently re-resolves and revalidates project type inside the service.
    const project = await this.services.creations.getCreationProject(actor, parsedCreationId);
    const updated = await this.services.creations.replaceBindings(actor, parsedCreationId, input);
    return {
      data: {
        bindings: updated.bindings.map(presentCreationBinding),
        draft: project.type === 'before_after_video'
          ? presentVideoCreationDraft(updated.draft)
          : presentCreationDraft(updated.draft),
      },
    };
  }

  @Patch('creations/:creationId/bindings')
  public async patchBindings(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('creationId') creationId: string,
    @Body() body: unknown,
  ) {
    return this.replaceBindings(request, creationId, body);
  }

  @Put('creations/:creationId/draft')
  public async updateDraft(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('creationId') creationId: string,
    @Body() body: unknown,
  ) {
    const input = updateCreationDraftRequestSchema.parse(body);
    const actor = authenticatedActor(request);
    const parsedCreationId = creationIdParamsSchema.parse({ creationId }).creationId;
    const project = await this.services.creations.getCreationProject(actor, parsedCreationId);
    const draft = await this.services.creations.updateDraft(actor, parsedCreationId, input);
    return {
      data: project.type === 'before_after_video'
        ? presentVideoCreationDraft(draft)
        : presentCreationDraft(draft),
    };
  }

  @Patch('creations/:creationId/draft')
  public async patchDraft(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('creationId') creationId: string,
    @Body() body: unknown,
  ) {
    return this.updateDraft(request, creationId, body);
  }

  @Post('creations/:creationId/revisions')
  public async createRevision(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('creationId') creationId: string,
    @Body() body: unknown,
  ) {
    const input = createCreationRevisionRequestSchema.parse(body);
    const actor = authenticatedActor(request);
    const parsedCreationId = creationIdParamsSchema.parse({ creationId }).creationId;
    const project = await this.services.creations.getCreationProject(actor, parsedCreationId);
    const revision = await this.services.creations.createRevision(actor, parsedCreationId, input.expectedDraftRevision);
    return {
      data: project.type === 'before_after_video'
        ? presentVideoCreationRevision(revision.revision, revision.bindings)
        : presentCreationRevision(revision.revision, revision.bindings),
    };
  }

  @Get('creations/:creationId/revisions')
  public async listRevisions(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('creationId') creationId: string,
  ) {
    const parsed = creationIdParamsSchema.parse({ creationId }).creationId;
    const revisions = await this.services.creations.listRevisions(authenticatedActor(request), parsed);
    return { data: revisions.map((revision) => ({
      id: revision.id,
      projectId: revision.projectId,
      caseId: revision.caseId,
      revisionNumber: revision.revisionNumber,
      documentSchemaVersion: revision.documentSchemaVersion,
      document: revision.document,
      documentSha256: revision.documentSha256,
      createdAt: revision.createdAt.toISOString(),
    })) };
  }

  @Get('creations/:creationId/revisions/:revisionId')
  public async getRevision(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('creationId') creationId: string,
    @Param('revisionId') revisionId: string,
  ) {
    const parsed = creationRevisionIdParamsSchema.parse({ creationId, revisionId });
    const actor = authenticatedActor(request);
    const project = await this.services.creations.getCreationProject(actor, parsed.creationId);
    const revision = await this.services.creations.getRevision(actor, parsed.creationId, parsed.revisionId);
    return {
      data: project.type === 'before_after_video'
        ? presentVideoCreationRevision(revision.revision, revision.bindings)
        : presentCreationRevision(revision.revision, revision.bindings),
    };
  }
}
