type FileRecord = { size: number; modificationTime: number; exists: boolean };
const mockFiles = new Map<string, FileRecord>();
const mockDirectory = 'file:///cache/dentpilot-private-preview-v1/hash/';
const mediaId = '11111111-1111-4111-8111-111111111111';
const accountId = '00000000-0000-4000-8000-000000000001';

jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: jest.fn(async () => 'hash') }));
jest.mock('react-native', () => ({ Image: { getSize: jest.fn((_uri: string, success: (width: number, height: number) => void) => { success(4000, 3000); }) } }));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: jest.fn(async () => ({ uri: `${mockDirectory}processed.jpg` })) }));
jest.mock('../src/api/api-transport', () => ({ authenticatedMediaSource: jest.fn(() => ({ uri: 'https://private.example/media', headers: { Authorization: 'Bearer test' } })) }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async (uri: string) => { for (const [path, current] of mockFiles) if (path === uri || path.startsWith(`${uri}/`)) current.exists = false; }),
  getInfoAsync: jest.fn(async (uri: string) => { const file = mockFiles.get(uri); return file === undefined ? { exists: false } : { exists: file.exists, size: file.size, modificationTime: file.modificationTime }; }),
  readDirectoryAsync: jest.fn(async (uri: string) => [...mockFiles.keys()].filter((key) => key.startsWith(uri) && mockFiles.get(key)?.exists).map((key) => key.slice(uri.length))),
  downloadAsync: jest.fn(async (_remote: string, uri: string) => { mockFiles.set(uri, { exists: true, size: 9 * 1024 * 1024, modificationTime: 1 }); return { uri }; }),
  moveAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => { const source = mockFiles.get(from) ?? { exists: true, size: 1024, modificationTime: 999 }; source.exists = false; mockFiles.set(to, { exists: true, size: 1024, modificationTime: 999 }); }),
}));

import { manipulateAsync } from 'expo-image-manipulator';
import { clearPrivatePreviewCache, constrainPreviewCount, loadPrivatePreview, previewDimensionsForSource, privatePreviewPolicy } from '../src/creation/protected-preview-cache';
const mockManipulator = manipulateAsync as jest.Mock;

function addPreviews(count: number): void {
  for (let index = 0; index < count; index += 1) mockFiles.set(`${mockDirectory}preview-${index}.jpg`, { exists: true, size: 100, modificationTime: index });
}

describe('Phase 4 Closure Stage 1 preview cache', () => {
  beforeEach(() => { mockFiles.clear(); jest.clearAllMocks(); });

  it.each([
    [4000, 3000, 1440, 1080],
    [3000, 4000, 1080, 1440],
    [900, 1200, 900, 1200],
    [1200, 900, 1200, 900],
    [500, 500, 500, 500],
  ])('limits max edge without upscale or distortion for %ix%i', (width, height, expectedWidth, expectedHeight) => {
    const result = previewDimensionsForSource(width, height);
    expect(result).toEqual({ width: expectedWidth, height: expectedHeight });
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(privatePreviewPolicy.maxPreviewEdge);
    expect(result.width / result.height).toBeCloseTo(width / height, 3);
  });

  it.each([0, 1, 11, 12, 13, 20])('retains exactly the required preview count for %i entries and only evicts deterministic excess', async (count) => {
    addPreviews(count);
    const retained = `${mockDirectory}preview-${Math.max(0, count - 1)}.jpg`;
    await constrainPreviewCount(mockDirectory, retained);
    const existing = [...mockFiles.entries()].filter(([uri, file]) => uri.startsWith(mockDirectory) && file.exists);
    expect(existing).toHaveLength(Math.min(count, privatePreviewPolicy.maxPreviewsPerAccount));
    if (count > privatePreviewPolicy.maxPreviewsPerAccount) {
      expect(mockFiles.get(`${mockDirectory}preview-0.jpg`)?.exists).toBe(false);
      expect(mockFiles.get(retained)?.exists).toBe(true);
    }
  });

  it('accepts a valid large committed source through native resize rather than rejecting it at the former 8 MiB raw threshold', async () => {
    mockFiles.set(`${mockDirectory}processed.jpg`, { exists: true, size: 1024, modificationTime: 999 });
    await expect(loadPrivatePreview({ accountId, mediaId })).resolves.toMatch(new RegExp(`${mediaId}\\.jpg$`));
    expect(mockManipulator).toHaveBeenCalledWith(expect.any(String), [{ resize: { width: 1440, height: 1080 } }], expect.objectContaining({ compress: 0.82 }));
  });

  it('invalidates late preview work on identity cleanup', async () => {
    const before = await loadPrivatePreview({ accountId, mediaId });
    expect(before).toContain(mediaId);
    await clearPrivatePreviewCache();
    expect(mockFiles.get(before)?.exists).toBe(false);
  });
});
