import type { MediaUploadSessionDto } from '@dentpilot/contracts';

export type NormalizedMediaAsset = {
  readonly uri: string;
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly fileSize?: number;
  readonly width?: number;
  readonly height?: number;
  readonly webFile?: File;
};

export type UploadFailure = {
  readonly code: string;
  readonly message: string;
  readonly retry: 'new-session' | 'recheck' | 'none';
};

export type MediaUploadState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'selecting' }
  | { readonly phase: 'creating-session'; readonly asset: NormalizedMediaAsset; readonly idempotencyKey: string }
  | { readonly phase: 'uploading'; readonly asset: NormalizedMediaAsset; readonly uploadId: string; readonly idempotencyKey: string }
  | { readonly phase: 'recovering-status'; readonly asset: NormalizedMediaAsset; readonly uploadId: string; readonly idempotencyKey: string }
  | { readonly phase: 'server-processing'; readonly asset: NormalizedMediaAsset; readonly uploadId: string; readonly idempotencyKey: string }
  | { readonly phase: 'committed'; readonly mediaId: string }
  | { readonly phase: 'failed'; readonly failure: UploadFailure; readonly asset?: NormalizedMediaAsset; readonly uploadId?: string };

export const initialMediaUploadState: MediaUploadState = { phase: 'idle' };

export function isActiveMediaUpload(state: MediaUploadState): boolean {
  return state.phase === 'selecting' || state.phase === 'creating-session' || state.phase === 'uploading' || state.phase === 'recovering-status' || state.phase === 'server-processing';
}

export function isCommittedUpload(session: MediaUploadSessionDto): session is MediaUploadSessionDto & { readonly status: 'committed'; readonly mediaId: string } {
  return session.status === 'committed' && session.mediaId !== null;
}
