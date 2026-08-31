import * as Crypto from 'expo-crypto';

import { authenticatedMediaSource } from '../api/api-transport';

const EXPORT_SOURCE_NAMESPACE = 'dentpilot-private-export-source-v1';
let exportSourceGeneration = 0;

type FileInfo = { readonly exists: boolean; readonly size?: number };
type LegacyFileSystemAdapter = {
  readonly cacheDirectory: string | null;
  makeDirectoryAsync(uri: string, options: { readonly intermediates: boolean }): Promise<void>;
  deleteAsync(uri: string, options: { readonly idempotent: boolean }): Promise<void>;
  getInfoAsync(uri: string): Promise<FileInfo>;
  downloadAsync(uri: string, destinationUri: string, options: { readonly headers: Readonly<Record<string, string>> }): Promise<{ readonly uri: string }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- constrained Expo SDK 54 legacy-file boundary; never expanded to UI state.
const fileSystem = require('expo-file-system/legacy') as LegacyFileSystemAdapter;

function assertUuid(name: string, value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) throw new Error(`${name} must be a UUID.`);
}

async function removeIfExists(uri: string): Promise<void> {
  await fileSystem.deleteAsync(uri, { idempotent: true });
}

async function exportDirectory(accountId: string): Promise<string> {
  assertUuid('Account ID', accountId);
  const cacheDirectory = fileSystem.cacheDirectory;
  if (cacheDirectory === null) throw new Error('The protected export cache directory is unavailable.');
  const accountScope = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, accountId);
  const directory = `${cacheDirectory}${EXPORT_SOURCE_NAMESPACE}/${accountScope}/`;
  await fileSystem.makeDirectoryAsync(directory, { intermediates: true });
  return directory;
}

export type PrivateExportSource = {
  readonly uri: string;
  readonly generation: number;
  readonly release: () => Promise<void>;
};

export function isPrivateExportSourceCurrent(generation: number): boolean {
  return generation === exportSourceGeneration;
}

/**
 * Acquires the authenticated committed media representation for one export only. The source is never
 * resized, transformed, retained in React state, or shared with preview-cache. `release` is owned by
 * the caller and must execute in a finally block after native composition encoding.
 */
export async function acquirePrivateExportSource(input: { readonly accountId: string; readonly mediaId: string }): Promise<PrivateExportSource> {
  assertUuid('Media ID', input.mediaId);
  const generation = exportSourceGeneration;
  const directory = await exportDirectory(input.accountId);
  const uri = `${directory}source-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.bin`;
  const remote = authenticatedMediaSource(`/media/${input.mediaId}/content`);
  try {
    const download = await fileSystem.downloadAsync(remote.uri, uri, { headers: remote.headers });
    const info = await fileSystem.getInfoAsync(download.uri);
    if (!info.exists || info.size === undefined || info.size <= 0) throw new Error('The authoritative protected export source is unavailable.');
    if (!isPrivateExportSourceCurrent(generation)) {
      await removeIfExists(download.uri);
      throw new Error('The protected export was cancelled because the authenticated identity changed.');
    }
    return { uri: download.uri, generation, release: async () => removeIfExists(download.uri) };
  } catch (error) {
    await removeIfExists(uri);
    throw error;
  }
}

/** Clears all authoritative-source temp files on logout, session invalidation, or account transition. */
export async function clearPrivateExportSourceCache(): Promise<void> {
  exportSourceGeneration += 1;
  const cacheDirectory = fileSystem.cacheDirectory;
  if (cacheDirectory !== null) await removeIfExists(`${cacheDirectory}${EXPORT_SOURCE_NAMESPACE}`);
}

export const privateExportSourcePolicy = { namespace: EXPORT_SOURCE_NAMESPACE } as const;
