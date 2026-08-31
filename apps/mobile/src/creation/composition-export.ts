import * as Crypto from 'expo-crypto';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

const EXPORT_NAMESPACE = 'dentpilot-composition-export-v1';
const MAX_EXPORTS = 6;
const MAX_EXPORT_BYTES = 16 * 1024 * 1024;

type ExportFile = { readonly uri: string; readonly exists: boolean; readonly size: number; readonly modificationTime: number | null; write(content: Uint8Array): void; delete(): void };
type ExportDirectory = { readonly exists: boolean; create(options?: { readonly idempotent?: boolean; readonly intermediates?: boolean }): void; list(): readonly ExportFile[]; delete(): void };
type ModernFileSystem = {
  readonly Paths?: { readonly cache: unknown };
  readonly File: new (...parts: readonly unknown[]) => ExportFile;
  readonly Directory: new (...parts: readonly unknown[]) => ExportDirectory;
};

/** Expo SDK 54's filesystem declaration source is not strict-clean. Its use is constrained to this byte-only native export boundary. */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- strict vendor declaration defect; the adapter remains fully typed.
const fileSystem = require('expo-file-system') as ModernFileSystem;

export const exportPresets = {
  square_1_1: { width: 1080, height: 1080 },
  portrait_4_5: { width: 1080, height: 1350 },
  story_9_16: { width: 1080, height: 1920 },
  presentation_16_9: { width: 1920, height: 1080 },
} as const;
export type ExportPresetKey = keyof typeof exportPresets;

function assertAccountId(accountId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(accountId)) throw new Error('Account ID must be a UUID.');
}

function cacheRoot(): unknown {
  return fileSystem.Paths?.cache ?? null;
}

async function directory(accountId: string): Promise<ExportDirectory> {
  assertAccountId(accountId);
  const cache = cacheRoot();
  if (cache === null) throw new Error('The temporary export filesystem is unavailable.');
  const scope = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, accountId);
  const value = new fileSystem.Directory(cache, EXPORT_NAMESPACE, scope);
  if (!value.exists) value.create({ idempotent: true, intermediates: true });
  return value;
}

function filename(): string {
  return `composition-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
}

const documentAspectToPreset = {
  square: 'square_1_1',
  portrait_4_5: 'portrait_4_5',
  story_9_16: 'story_9_16',
  landscape_16_9: 'presentation_16_9',
} as const;

export function presetForAspectRatio(aspectRatio: keyof typeof documentAspectToPreset): { readonly width: number; readonly height: number } {
  return exportPresets[documentAspectToPreset[aspectRatio]];
}

/** Persists JPEG bytes produced by the offscreen composition renderer. Files are scoped by account hash and contain no source identifiers. */
export async function writeCompositionExport(accountId: string, jpegBytes: Uint8Array): Promise<{ readonly uri: string; readonly bytes: number }> {
  if (jpegBytes.byteLength === 0 || jpegBytes.byteLength > MAX_EXPORT_BYTES) throw new Error('The encoded composition is empty or exceeds the temporary export limit.');
  const target = new fileSystem.File(await directory(accountId), filename());
  target.write(jpegBytes);
  if (!target.exists || target.size <= 0 || target.size > MAX_EXPORT_BYTES) throw new Error('The temporary composition export could not be written safely.');
  await cleanupCompositionExports(accountId, target.uri);
  return { uri: target.uri, bytes: target.size };
}

export async function cleanupCompositionExports(accountId: string, retainedUri?: string): Promise<void> {
  const files = (await directory(accountId)).list().filter((file) => file.uri.endsWith('.jpg')).sort((left, right) => (right.modificationTime ?? 0) - (left.modificationTime ?? 0));
  files.slice(MAX_EXPORTS).filter((file) => file.uri !== retainedUri).forEach((file) => file.delete());
}

/** Clears every identity-scoped rendered-composition file during logout, session invalidation, or account switch. */
export function clearCompositionExportCache(): void {
  const cache = cacheRoot();
  if (cache === null) return;
  const root = new fileSystem.Directory(cache, EXPORT_NAMESPACE);
  if (root.exists) root.delete();
}

export async function saveCompositionToLibrary(uri: string): Promise<void> {
  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) throw new Error('Photo Library add permission was not granted.');
  await MediaLibrary.saveToLibraryAsync(uri);
}

export async function shareComposition(uri: string): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('System sharing is unavailable on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Share dental composition' });
}

export const compositionExportPolicy = { namespace: EXPORT_NAMESPACE, identityScoped: true, maxExports: MAX_EXPORTS, maxBytes: MAX_EXPORT_BYTES, mimeType: 'image/jpeg', extension: '.jpg', jpegQuality: 95 } as const;
