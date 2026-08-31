const files: Array<{ uri: string; exists: boolean; size: number; modificationTime: number | null; write(content: Uint8Array): void; delete(): void }> = [];
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: jest.fn(async (_algorithm: string, value: string) => `hash-${value}`) }));
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    exists = true;
    constructor(...parts: unknown[]) { this.uri = parts.map((part) => typeof part === 'string' ? part : (part as { uri: string }).uri).join('/').replace(/([^:])\/{2,}/g, '$1/'); }
    create = jest.fn();
    list = () => files.filter((file) => file.uri.startsWith(`${this.uri}/`));
    delete = () => files.filter((file) => file.uri.startsWith(`${this.uri}/`)).forEach((file) => file.delete());
  }
  class File {
    uri: string;
    exists = false;
    size = 0;
    modificationTime: number | null = Date.now();
    constructor(...parts: unknown[]) { this.uri = parts.map((part) => typeof part === 'string' ? part : (part as { uri: string }).uri).join('/').replace(/([^:])\/{2,}/g, '$1/'); files.push(this); }
    write(content: Uint8Array) { this.exists = true; this.size = content.byteLength; }
    delete() { this.exists = false; }
  }
  return { Paths: { cache: 'file:///cache' }, Directory, File };
});
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), saveToLibraryAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

import { cleanupCompositionExports, clearCompositionExportCache, compositionExportPolicy, presetForAspectRatio, saveCompositionToLibrary, shareComposition, writeCompositionExport } from '../src/creation/composition-export';
const mockMediaLibrary = jest.requireMock('expo-media-library') as { requestPermissionsAsync: jest.Mock; saveToLibraryAsync: jest.Mock };
const mockSharing = jest.requireMock('expo-sharing') as { isAvailableAsync: jest.Mock; shareAsync: jest.Mock };
const accountA = '00000000-0000-4000-8000-000000000001';
const accountB = '00000000-0000-4000-8000-000000000002';

describe('Phase 4 Closure Stage 1 composition export cache', () => {
  beforeEach(() => { files.splice(0); jest.clearAllMocks(); mockMediaLibrary.requestPermissionsAsync.mockResolvedValue({ granted: true }); mockMediaLibrary.saveToLibraryAsync.mockResolvedValue(undefined); mockSharing.isAvailableAsync.mockResolvedValue(true); mockSharing.shareAsync.mockResolvedValue(undefined); });

  it('maps document aspect ratios to exact composition export presets', () => {
    expect(presetForAspectRatio('square')).toEqual({ width: 1080, height: 1080 });
    expect(presetForAspectRatio('portrait_4_5')).toEqual({ width: 1080, height: 1350 });
    expect(presetForAspectRatio('story_9_16')).toEqual({ width: 1080, height: 1920 });
    expect(presetForAspectRatio('landscape_16_9')).toEqual({ width: 1920, height: 1080 });
  });

  it('writes bounded JPEG bytes under a non-identifying account scope and rejects empty output', async () => {
    const result = await writeCompositionExport(accountA, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    expect(result.uri).toContain('hash-00000000-0000-4000-8000-000000000001');
    expect(result.uri).toMatch(/composition-[a-z0-9-]+\.jpg$/);
    expect(result.bytes).toBe(4);
    expect(compositionExportPolicy).toMatchObject({ identityScoped: true, extension: '.jpg', mimeType: 'image/jpeg', jpegQuality: 95 });
    await expect(writeCompositionExport(accountA, new Uint8Array())).rejects.toThrow(/empty/i);
  });

  it('prevents User B from discovering User A exports after logout/account switch cleanup', async () => {
    const userA = await writeCompositionExport(accountA, new Uint8Array([1, 2, 3]));
    expect(files.find((file) => file.uri === userA.uri)?.exists).toBe(true);
    clearCompositionExportCache();
    await writeCompositionExport(accountB, new Uint8Array([4, 5, 6]));
    expect(files.find((file) => file.uri === userA.uri)?.exists).toBe(false);
    expect(files.filter((file) => file.exists && file.uri.includes('hash-00000000-0000-4000-8000-000000000001'))).toHaveLength(0);
  });

  it('bounds exports within one identity without deleting other scopes', async () => {
    for (let index = 0; index < compositionExportPolicy.maxExports + 2; index += 1) await writeCompositionExport(accountA, new Uint8Array([index + 1]));
    const userB = await writeCompositionExport(accountB, new Uint8Array([9]));
    await cleanupCompositionExports(accountA);
    expect(files.filter((file) => file.exists && file.uri.includes(`hash-${accountA}`))).toHaveLength(compositionExportPolicy.maxExports);
    expect(files.find((file) => file.uri === userB.uri)?.exists).toBe(true);
  });

  it('uses minimal photo-library save permission and checks share availability', async () => {
    await saveCompositionToLibrary('file:///cache/composition.jpg');
    expect(mockMediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true, ['photo']);
    expect(mockMediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///cache/composition.jpg');
    await shareComposition('file:///cache/composition.jpg');
    expect(mockSharing.shareAsync).toHaveBeenCalledWith('file:///cache/composition.jpg', expect.objectContaining({ mimeType: 'image/jpeg' }));
    mockSharing.isAvailableAsync.mockResolvedValueOnce(false);
    await expect(shareComposition('file:///cache/composition.jpg')).rejects.toThrow(/unavailable/i);
  });
});
