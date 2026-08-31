import * as Crypto from 'expo-crypto';

import type { MediaUploadSessionDto } from '@dentpilot/contracts';

import { MobileApiError } from '../api/api-transport';
import { toUploadFailure } from './media-errors';
import { mediaApi } from './media-api';
import {
  initialMediaUploadState,
  isCommittedUpload,
  type MediaUploadState,
  type NormalizedMediaAsset,
} from './media-upload-state';

/**
 * Foreground-only recovery policy. Three automatic content sends are enough to
 * recover transient response loss while guaranteeing a finite resend budget.
 */
export const mediaRecoveryPolicy = {
  initialDelayMs: 250,
  maximumDelayMs: 2_000,
  maximumForegroundWindowMs: 12_000,
  maxCreateAttempts: 2,
  maxContentUploadAttempts: 3,
} as const;

type MediaApi = Pick<typeof mediaApi, 'createUploadSession' | 'uploadContent' | 'getUploadStatus'>;
type UploadOrchestratorOptions = {
  readonly api?: MediaApi;
  readonly onState: (state: MediaUploadState) => void;
  readonly onCommitted: (mediaId: string) => Promise<void> | void;
  readonly now?: () => number;
  readonly wait?: (milliseconds: number) => Promise<void>;
  readonly newIdempotencyKey?: () => string;
};
type ActiveUpload = {
  readonly uploadId: string;
  readonly asset: NormalizedMediaAsset;
  readonly idempotencyKey: string;
  contentAttempts: number;
};

function waitFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function terminalFailure(session: MediaUploadSessionDto, asset: NormalizedMediaAsset): MediaUploadState {
  return {
    phase: 'failed',
    asset,
    uploadId: session.uploadId,
    failure: {
      code: session.status === 'expired' ? 'UPLOAD_SESSION_EXPIRED' : 'PERSISTENCE_FAILED',
      message: session.status === 'expired' ? 'The upload session expired. Start a new upload.' : 'The upload did not complete. Start a new upload.',
      retry: 'new-session',
    },
  };
}

export function createIdempotencyKey(): string {
  return Crypto.randomUUID();
}

/**
 * In-memory only workflow coordinator. It never persists a URI, upload id, FormData, or patient bytes.
 * A foreground recovery result remains server-authoritative through the Phase 3B status endpoint.
 */
export function createMediaUploadOrchestrator(options: UploadOrchestratorOptions) {
  const api = options.api ?? mediaApi;
  const now = options.now ?? Date.now;
  const wait = options.wait ?? waitFor;
  const newIdempotencyKey = options.newIdempotencyKey ?? createIdempotencyKey;
  let state: MediaUploadState = initialMediaUploadState;
  let active = false;
  let logicalUpload: ActiveUpload | undefined;

  const publish = (next: MediaUploadState): void => {
    state = next;
    options.onState(next);
  };
  const commit = async (mediaId: string): Promise<void> => {
    publish({ phase: 'committed', mediaId });
    await options.onCommitted(mediaId);
  };
  const budgetExhausted = (upload: ActiveUpload): void => {
    publish({
      phase: 'failed',
      asset: upload.asset,
      uploadId: upload.uploadId,
      failure: {
        code: 'CONTENT_RETRY_BUDGET_EXHAUSTED',
        message: 'The upload could not be completed. Start a new upload to retry.',
        retry: 'new-session',
      },
    });
  };
  const ensureLogicalUpload = (uploadId: string, asset: NormalizedMediaAsset, idempotencyKey: string): ActiveUpload => {
    if (logicalUpload?.uploadId === uploadId) return logicalUpload;
    logicalUpload = { uploadId, asset, idempotencyKey, contentAttempts: 0 };
    return logicalUpload;
  };

  const settle = async (session: MediaUploadSessionDto, upload: ActiveUpload, allowCreatedRetry: boolean): Promise<void> => {
    if (isCommittedUpload(session)) return commit(session.mediaId);
    if (session.status === 'failed' || session.status === 'expired') return publish(terminalFailure(session, upload.asset));
    if (session.status === 'created' && allowCreatedRetry) return sendContent(session.uploadId, upload);
    return pollUntilSettled(session.uploadId, upload);
  };

  const pollUntilSettled = async (uploadId: string, upload: ActiveUpload): Promise<void> => {
    publish({ phase: 'server-processing', asset: upload.asset, uploadId, idempotencyKey: upload.idempotencyKey });
    const deadline = now() + mediaRecoveryPolicy.maximumForegroundWindowMs;
    let delay: number = mediaRecoveryPolicy.initialDelayMs;
    while (now() < deadline) {
      await wait(delay);
      try {
        const session = await api.getUploadStatus(uploadId);
        if (isCommittedUpload(session)) return commit(session.mediaId);
        if (session.status === 'failed' || session.status === 'expired') return publish(terminalFailure(session, upload.asset));
        if (session.status === 'created') return settle(session, upload, true);
      } catch (error) {
        if (error instanceof MobileApiError && error.code === 'UNAUTHENTICATED') throw error;
      }
      delay = Math.min(mediaRecoveryPolicy.maximumDelayMs, delay * 2);
    }
    publish({ phase: 'failed', asset: upload.asset, uploadId, failure: { code: 'RECOVERY_WINDOW_EXHAUSTED', message: 'The upload is still processing. Recheck its status shortly.', retry: 'recheck' } });
  };

  const recover = async (uploadId: string, asset: NormalizedMediaAsset, idempotencyKey: string): Promise<void> => {
    const upload = ensureLogicalUpload(uploadId, asset, idempotencyKey);
    publish({ phase: 'recovering-status', asset, uploadId, idempotencyKey });
    try {
      await settle(await api.getUploadStatus(uploadId), upload, true);
    } catch (error) {
      if (error instanceof MobileApiError && error.code === 'UNAUTHENTICATED') throw error;
      publish({ phase: 'failed', asset, uploadId, failure: toUploadFailure(error) });
    }
  };

  const sendContent = async (uploadId: string, upload: ActiveUpload): Promise<void> => {
    if (upload.contentAttempts >= mediaRecoveryPolicy.maxContentUploadAttempts) return budgetExhausted(upload);
    upload.contentAttempts += 1;
    publish({ phase: 'uploading', asset: upload.asset, uploadId, idempotencyKey: upload.idempotencyKey });
    try {
      await settle(await api.uploadContent(uploadId, upload.asset), upload, false);
    } catch (error) {
      if (error instanceof MobileApiError && error.code === 'UNAUTHENTICATED') throw error;
      if (error instanceof MobileApiError && error.code === 'UPLOAD_IN_PROGRESS') return pollUntilSettled(uploadId, upload);
      await recover(uploadId, upload.asset, upload.idempotencyKey);
    }
  };

  const start = async (caseId: string, asset: NormalizedMediaAsset): Promise<void> => {
    if (active) return;
    active = true;
    const idempotencyKey = newIdempotencyKey();
    try {
      publish({ phase: 'creating-session', asset, idempotencyKey });
      let session: MediaUploadSessionDto | undefined;
      let createError: unknown;
      for (let attempt = 0; attempt < mediaRecoveryPolicy.maxCreateAttempts; attempt += 1) {
        try { session = await api.createUploadSession(caseId, idempotencyKey); break; } catch (error) { createError = error; }
      }
      if (session === undefined) {
        if (createError instanceof MobileApiError && createError.code === 'UNAUTHENTICATED') throw createError;
        publish({ phase: 'failed', asset, failure: toUploadFailure(createError) });
        return;
      }
      const upload = ensureLogicalUpload(session.uploadId, asset, idempotencyKey);
      await settle(session, upload, true);
    } catch (error) {
      if (error instanceof MobileApiError && error.code === 'UNAUTHENTICATED') throw error;
      publish({ phase: 'failed', asset, failure: toUploadFailure(error) });
    } finally {
      active = false;
    }
  };

  return {
    start,
    recover,
    reset: () => publish(initialMediaUploadState),
    getState: () => state,
    isActive: () => active,
  };
}
