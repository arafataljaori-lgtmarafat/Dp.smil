import { File as ExpoFile } from 'expo-file-system';

import {
  createMediaUploadResponseSchema,
  mediaUploadStatusResponseSchema,
  type MediaUploadSessionDto,
} from '@dentpilot/contracts';

import { apiRequest } from '../api/api-transport';
import type { NormalizedMediaAsset } from './media-upload-state';

function uploadFile(asset: NormalizedMediaAsset): Blob {
  if (asset.webFile !== undefined) return asset.webFile;
  return new ExpoFile(asset.uri);
}

export const mediaApi = {
  createUploadSession(caseId: string, idempotencyKey: string): Promise<MediaUploadSessionDto> {
    return apiRequest(
      `/cases/${caseId}/media-uploads`,
      { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } },
      createMediaUploadResponseSchema,
      { protected: true },
    );
  },

  uploadContent(uploadId: string, asset: NormalizedMediaAsset): Promise<MediaUploadSessionDto> {
    const formData = new FormData();
    formData.append('file', uploadFile(asset), asset.fileName);
    return apiRequest(
      `/media-uploads/${uploadId}/content`,
      { method: 'POST', body: formData },
      mediaUploadStatusResponseSchema,
      { protected: true },
    );
  },

  getUploadStatus(uploadId: string): Promise<MediaUploadSessionDto> {
    return apiRequest(`/media-uploads/${uploadId}`, { method: 'GET' }, mediaUploadStatusResponseSchema, { protected: true });
  },
};
