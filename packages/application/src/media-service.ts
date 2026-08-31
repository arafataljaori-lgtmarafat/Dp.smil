import { NotFoundError, StorageError } from '@dentpilot/domain';

import type {
  Actor,
  ObjectStoragePort,
  UnitOfWorkPort,
} from './ports.js';

function storageFailure(message: string, cause: unknown): StorageError {
  if (cause instanceof StorageError) return cause;
  return new StorageError(message, 'STORAGE_READ_FAILED', { reason: cause instanceof Error ? cause.name : 'unknown' });
}

export class MediaService {
  public constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly storage: ObjectStoragePort,
  ) {}

  public async readStreamForAuthorizedActor(
    actor: Actor,
    mediaId: string,
  ): Promise<{ readonly body: AsyncIterable<Uint8Array>; readonly mimeType: string; readonly contentLength: number }> {
    const media = await this.unitOfWork.media.findById(actor.actorType === 'human' ? actor.userId : actor.ownerUserId, mediaId);
    if (media === null) {
      throw new NotFoundError(`Media ${mediaId} was not found for the current user.`);
    }
    try {
      const object = await this.storage.getStream(media.storageKey);
      if (object.contentLength !== media.byteSize) {
        throw new StorageError('Object storage length did not match committed media metadata.', 'STORAGE_READ_FAILED');
      }
      return { body: object.body, mimeType: media.mimeType, contentLength: media.byteSize };
    } catch (cause) {
      throw storageFailure('Source media retrieval failed.', cause);
    }
  }
}
