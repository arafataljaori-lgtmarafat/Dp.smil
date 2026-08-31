import * as Crypto from 'expo-crypto';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

import { authenticatedMediaSource } from '../api/api-transport';

const CACHE_NAMESPACE = 'dentpilot-private-preview-v1';
let previewGeneration = 0;
const MAX_PREVIEW_EDGE = 1440;
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024; // Bound only the generated derivative; raw committed media is streamed to native file storage.
const MAX_PREVIEWS_PER_ACCOUNT = 12;

type FileInfo = { readonly exists: boolean; readonly size?: number; readonly modificationTime?: number };
type LegacyFileSystemAdapter = {
  readonly cacheDirectory: string | null;
  makeDirectoryAsync(uri: string, options: { readonly intermediates: boolean }): Promise<void>;
  deleteAsync(uri: string, options: { readonly idempotent: boolean }): Promise<void>;
  getInfoAsync(uri: string): Promise<FileInfo>;
  readDirectoryAsync(uri: string): Promise<readonly string[]>;
  downloadAsync(uri: string, destinationUri: string, options: { readonly headers: Readonly<Record<string, string>> }): Promise<{ readonly uri: string }>;
  moveAsync(input: { readonly from: string; readonly to: string }): Promise<void>;
};

/**
 * Expo SDK 54 publishes its FileSystem implementation TypeScript sources with strict-option
 * violations. Keep that vendor defect at a single typed module boundary; runtime uses Expo's
 * documented legacy filesystem API and application code retains strict interfaces.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo SDK 54 legacy sources fail strict type-checking when statically imported.
const fileSystem = require('expo-file-system/legacy') as LegacyFileSystemAdapter;

function assertIdentifier(name: string, value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) throw new Error(`${name} must be a UUID.`);
}

async function scopeHash(accountId: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, accountId);
}

async function accountDirectory(accountId: string): Promise<string> {
  assertIdentifier('Account ID', accountId);
  const base = fileSystem.cacheDirectory;
  if (base === null) throw new Error('The private preview cache directory is unavailable.');
  const directory = `${base}${CACHE_NAMESPACE}/${await scopeHash(accountId)}/`;
  await fileSystem.makeDirectoryAsync(directory, { intermediates: true });
  return directory;
}

async function removeIfExists(uri: string): Promise<void> {
  await fileSystem.deleteAsync(uri, { idempotent: true });
}

export function isPrivatePreviewCurrent(generation: number): boolean {
  return generation === previewGeneration;
}

export class PreviewResourceLimitError extends Error {
  constructor() {
    super('The device could not prepare this valid source within the bounded preview cache. Try exporting or use a device with more available resources.');
    this.name = 'PreviewResourceLimitError';
  }
}

/** Computes the exact non-upscaling preview dimensions after native orientation normalization. */
export function previewDimensionsForSource(width: number, height: number): { readonly width: number; readonly height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Private media dimensions are invalid.');
  const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function readNativeImageDimensions(uri: string): Promise<{ readonly width: number; readonly height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), () => reject(new Error('The native image decoder could not read private media dimensions.')));
  });
}

export async function constrainPreviewCount(directory: string, retainedUri: string): Promise<void> {
  const entries = await fileSystem.readDirectoryAsync(directory).catch(() => [] as readonly string[]);
  const candidates = await Promise.all(entries.filter((entry) => entry.endsWith('.jpg')).map(async (entry) => {
    const uri = `${directory}${entry}`;
    const info = await fileSystem.getInfoAsync(uri);
    return { uri, modificationTime: info.exists ? info.modificationTime ?? 0 : 0 };
  }));
  const excessCount = Math.max(0, candidates.length - MAX_PREVIEWS_PER_ACCOUNT);
  const obsolete = candidates
    .filter((candidate) => candidate.uri !== retainedUri)
    .sort((left, right) => left.modificationTime - right.modificationTime || left.uri.localeCompare(right.uri))
    .slice(0, excessCount);
  await Promise.all(obsolete.map((candidate) => removeIfExists(candidate.uri)));
}

/**
 * Downloads authenticated private media into the app cache and creates a bounded, non-authoritative
 * JPEG derivative for interactive native preview. The returned URI is identity-scoped and must be
 * treated as disposable: it is neither a source-media replacement nor a value for React Query.
 */
export async function loadPrivatePreview(input: { readonly accountId: string; readonly mediaId: string }): Promise<string> {
  assertIdentifier('Media ID', input.mediaId);
  const generation = previewGeneration;
  const directory = await accountDirectory(input.accountId);
  if (!isPrivatePreviewCurrent(generation)) throw new Error('The protected preview was cancelled because the authenticated identity changed.');
  const previewUri = `${directory}${input.mediaId}.jpg`;
  const existing = await fileSystem.getInfoAsync(previewUri);
  if (existing.exists && existing.size !== undefined && existing.size > 0 && existing.size <= MAX_PREVIEW_BYTES) return previewUri;
  await removeIfExists(previewUri);

  const downloadedUri = `${directory}${input.mediaId}.download`;
  await removeIfExists(downloadedUri);
  const source = authenticatedMediaSource(`/media/${input.mediaId}/content`);
  try {
    const downloaded = await fileSystem.downloadAsync(source.uri, downloadedUri, { headers: source.headers });
    const downloadedInfo = await fileSystem.getInfoAsync(downloaded.uri);
    if (!downloadedInfo.exists || downloadedInfo.size === undefined || downloadedInfo.size <= 0) {
      throw new Error('Private media is unavailable.');
    }
    const dimensions = await readNativeImageDimensions(downloaded.uri);
    const previewDimensions = previewDimensionsForSource(dimensions.width, dimensions.height);
    const processed = await manipulateAsync(
      downloaded.uri,
      [{ resize: previewDimensions }],
      { compress: 0.82, format: SaveFormat.JPEG },
    );
    await fileSystem.moveAsync({ from: processed.uri, to: previewUri });
    if (!isPrivatePreviewCurrent(generation)) {
      await removeIfExists(previewUri);
      throw new Error('The protected preview was cancelled because the authenticated identity changed.');
    }
    const previewInfo = await fileSystem.getInfoAsync(previewUri);
    if (!previewInfo.exists || previewInfo.size === undefined || previewInfo.size <= 0) {
      throw new Error('The generated preview is unavailable.');
    }
    if (previewInfo.size > MAX_PREVIEW_BYTES) throw new PreviewResourceLimitError();
    await constrainPreviewCount(directory, previewUri);
    return previewUri;
  } catch (error) {
    await removeIfExists(previewUri);
    throw error;
  } finally {
    await removeIfExists(downloadedUri);
  }
}

/** Clears the full temporary preview namespace on logout, session invalidation, or account switch. */
export async function clearPrivatePreviewCache(): Promise<void> {
  previewGeneration += 1;
  const base = fileSystem.cacheDirectory;
  if (base !== null) await removeIfExists(`${base}${CACHE_NAMESPACE}`);
}

export const privatePreviewPolicy = {
  maxPreviewEdge: MAX_PREVIEW_EDGE,
  maxPreviewBytes: MAX_PREVIEW_BYTES,
  maxPreviewsPerAccount: MAX_PREVIEWS_PER_ACCOUNT,
} as const;
