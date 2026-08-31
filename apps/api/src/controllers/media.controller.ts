import { Readable } from 'node:stream';

import { Controller, Get, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { MediaIngestError } from '@dentpilot/domain';
import { mediaIdParamsSchema, mediaUploadIdParamsSchema, type MediaUploadSessionDto } from '@dentpilot/contracts';

import { authenticatedActor, type AuthenticatedFastifyRequest } from '../common/authentication.guard.js';
import { StreamingMediaIngestService } from '../infrastructure/media/streaming-media-ingest.service.js';
import { infrastructureTokens, type ApplicationServices } from '../modules/application-services.js';
import { presentMediaUploadSession } from './api-presenters.js';

@Controller('api/v1')
export class MediaController {
  public constructor(
    @Inject(infrastructureTokens.applicationServices)
    private readonly services: ApplicationServices,
    @Inject(StreamingMediaIngestService)
    private readonly streamingIngest: StreamingMediaIngestService,
  ) {}

  @Post('media-uploads/:uploadId/content')
  public async uploadContent(
    @Req() request: AuthenticatedFastifyRequest,
    @Param('uploadId') uploadId: string,
  ): Promise<MediaUploadSessionDto> {
    const parsedUploadId = mediaUploadIdParamsSchema.parse({ uploadId }).uploadId;
    const uploads = request.files();
    const first = await uploads.next();
    if (first.done) {
      throw new MediaIngestError('MEDIA_EMPTY', 'Exactly one file part is required for media ingest.');
    }
    const upload = first.value;
    await this.streamingIngest.ingest(
      authenticatedActor(request),
      parsedUploadId,
      upload.file,
      () => (upload.file as { readonly truncated?: boolean }).truncated === true,
      async () => {
        const additional = await uploads.next();
        if (additional.done) return;
        additional.value.file.resume();
        for await (const remaining of uploads) remaining.file.resume();
        throw new MediaIngestError('PERSISTENCE_FAILED', 'Exactly one file part is required for media ingest.');
      },
    );
    return presentMediaUploadSession(await this.services.uploadSessions.get(authenticatedActor(request), parsedUploadId));
  }

  @Get('media/:mediaId/content')
  public async content(
    @Req() request: AuthenticatedFastifyRequest,
    @Res() response: FastifyReply,
    @Param('mediaId') mediaId: string,
  ): Promise<void> {
    const parsedMediaId = mediaIdParamsSchema.parse({ mediaId }).mediaId;
    const media = await this.services.media.readStreamForAuthorizedActor(
      authenticatedActor(request),
      parsedMediaId,
    );
    response
      .header('Cache-Control', 'private, no-store')
      .header('Content-Type', media.mimeType)
      .header('Content-Length', String(media.contentLength))
      .header('X-Content-Type-Options', 'nosniff')
      .send(Readable.from(media.body));
  }
}
