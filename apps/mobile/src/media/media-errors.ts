import { MobileApiError } from '../api/api-transport';

import type { UploadFailure } from './media-upload-state';

const mediaMessages: Readonly<Record<string, string>> = {
  MEDIA_EMPTY: 'The selected image is empty. Choose a different image.',
  MEDIA_TOO_LARGE: 'The selected image is too large. Choose a smaller image.',
  UNSUPPORTED_MEDIA_FORMAT: 'This image format is not supported. Choose a JPEG, PNG, or WebP image.',
  MEDIA_DECODE_FAILED: 'The selected image could not be read safely. Choose a different image.',
  MEDIA_DIMENSIONS_INVALID: 'The selected image dimensions are not supported.',
  MEDIA_PIXEL_LIMIT_EXCEEDED: 'The selected image is too large to process safely.',
  TEMP_STORAGE_FAILED: 'The image could not be prepared safely. Please try again.',
  STORAGE_WRITE_FAILED: 'The image could not be uploaded safely. Please try again.',
  PERSISTENCE_FAILED: 'The upload could not be completed safely. Start a new upload.',
  UPLOAD_SESSION_EXPIRED: 'The upload session expired. Start a new upload.',
  UPLOAD_PROCESSING_TIMEOUT: 'The upload did not complete in time. Start a new upload.',
  UPLOAD_IN_PROGRESS: 'The server is still processing this upload. Checking its status now.',
  NETWORK_ERROR: 'The network result is uncertain. Checking the upload status now.',
  UNAUTHENTICATED: 'Your session has ended. Please sign in again.',
};

export function toUploadFailure(error: unknown): UploadFailure {
  const code = error instanceof MobileApiError ? error.code : 'NETWORK_ERROR';
  if (code === 'NETWORK_ERROR' || code === 'UPLOAD_IN_PROGRESS') {
    return { code, message: mediaMessages[code]!, retry: 'recheck' };
  }
  if (code === 'UNAUTHENTICATED') return { code, message: mediaMessages[code]!, retry: 'none' };
  return { code, message: mediaMessages[code] ?? 'The upload could not be completed. Start a new upload.', retry: 'new-session' };
}
