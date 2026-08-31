import { Controller, Get, Headers, Inject, Param, Post, Req } from '@nestjs/common';

import {
  caseIdParamsSchema,
  idempotencyKeySchema,
  mediaUploadIdParamsSchema,
  type MediaUploadSessionDto,
} from '@dentpilot/contracts';

import { authenticatedActor, type AuthenticatedFastifyRequest } from '../common/authentication.guard.js';
import { infrastructureTokens, type ApplicationServices } from '../modules/application-services.js';
import { presentMediaUploadSession } from './api-presenters.js';

@Controller('api/v1')
export class MediaUploadsController {
  public constructor(
    @Inject(infrastructureTokens.applicationServices)
    private readonly services: ApplicationServices,
  ) {}

  @Post('cases/:caseId/media-uploads')
  public async create(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('caseId') caseId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<MediaUploadSessionDto> {
    const parsedCaseId = caseIdParamsSchema.parse({ caseId }).caseId;
    const parsedIdempotencyKey = idempotencyKeySchema.parse(idempotencyKey);
    const result = await this.services.uploadSessions.create(authenticatedActor(request), {
      caseId: parsedCaseId,
      idempotencyKey: parsedIdempotencyKey,
    });
    return presentMediaUploadSession(result.session);
  }

  @Get('media-uploads/:uploadId')
  public async status(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('uploadId') uploadId: string,
  ): Promise<MediaUploadSessionDto> {
    const parsedUploadId = mediaUploadIdParamsSchema.parse({ uploadId }).uploadId;
    return presentMediaUploadSession(await this.services.uploadSessions.get(authenticatedActor(request), parsedUploadId));
  }
}
