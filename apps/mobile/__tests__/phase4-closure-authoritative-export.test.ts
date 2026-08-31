import type { CreationBindingDto, CreationDocument, MediaAssetDto } from '@dentpilot/contracts';

jest.mock('../src/creation/protected-export-source', () => ({
  acquirePrivateExportSource: jest.fn(async ({ mediaId }: { mediaId: string }) => ({ uri: `file:///private/original-4000x3000-${mediaId}.jpg`, generation: 7, release: jest.fn(async () => undefined) })),
  isPrivateExportSourceCurrent: jest.fn(() => true),
}));
jest.mock('../src/creation/composition-offscreen-export', () => ({ renderCompositionOffscreen: jest.fn(async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9])) }));
jest.mock('../src/creation/protected-preview-cache', () => ({ loadPrivatePreview: jest.fn() }));

import { renderAuthoritativeCompositionExport } from '../src/creation/authoritative-composition-export.native';
const mockExportSources = jest.requireMock('../src/creation/protected-export-source') as { acquirePrivateExportSource: jest.Mock };
const mockOffscreen = jest.requireMock('../src/creation/composition-offscreen-export') as { renderCompositionOffscreen: jest.Mock };
const mockPreviewCache = jest.requireMock('../src/creation/protected-preview-cache') as { loadPrivatePreview: jest.Mock };

const accountId = '00000000-0000-4000-8000-000000000001';
const mediaA = '11111111-1111-4111-8111-111111111111';
const mediaB = '22222222-2222-4222-8222-222222222222';
const document: CreationDocument = {
  schemaVersion: 1, templateRef: { templateId: 'story-before-after', templateVersion: 1 }, canvas: { aspectRatioKey: 'story_9_16' },
  slotState: { before: { panX: 0, panY: 0, scale: 1, rotation: 0 }, after: { panX: 0, panY: 0, scale: 1, rotation: 0 } },
  editableTextState: { beforeLabel: 'Before', afterLabel: 'After', title: 'Result' }, styleState: { theme: 'clinical-neutral' },
};

function bindings(before: string, after: string): readonly CreationBindingDto[] {
  return [{ bindingKey: 'before', mediaId: before }, { bindingKey: 'after', mediaId: after }];
}
function assets(...mediaIds: readonly string[]): readonly MediaAssetDto[] {
  return mediaIds.map((id) => ({
    id, caseId: '33333333-3333-4333-8333-333333333333', kind: 'source', purpose: 'source_photo', mimeType: 'image/jpeg', byteSize: 25 * 1024 * 1024, width: 4000, height: 3000,
    sha256: 'a'.repeat(64), sourceMediaId: null, createdAt: '2026-08-28T00:00:00.000Z', contentUrl: `/api/v1/media/${id}/content`,
  }));
}
function source(mediaId: string, release: jest.Mock) {
  return { uri: `file:///private/original-4000x3000-${mediaId}.jpg`, generation: 7, release };
}
async function render(before: string, after: string): Promise<Uint8Array> {
  return renderAuthoritativeCompositionExport({ accountId, document, bindings: bindings(before, after), media: assets(...[...new Set([before, after])]), target: { width: 1080, height: 1920 } });
}

describe('Phase 4 Stage 1 final micro-closure authoritative export ownership', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('A1 acquires a media source once, reuses its URI for both logical bindings, and releases it exactly once', async () => {
    const releaseA = jest.fn(async () => undefined);
    mockExportSources.acquirePrivateExportSource.mockImplementation(async ({ mediaId }: { mediaId: string }) => source(mediaId, releaseA));
    await expect(render(mediaA, mediaA)).resolves.toBeInstanceOf(Uint8Array);
    expect(mockExportSources.acquirePrivateExportSource).toHaveBeenCalledTimes(1);
    expect(mockExportSources.acquirePrivateExportSource).toHaveBeenCalledWith({ accountId, mediaId: mediaA });
    const plan = mockOffscreen.renderCompositionOffscreen.mock.calls[0]?.[0] as { commands: readonly { type: string; source?: string }[] };
    expect(plan.commands.filter((command) => command.type === 'image').map((command) => command.source)).toEqual([
      `file:///private/original-4000x3000-${mediaA}.jpg`, `file:///private/original-4000x3000-${mediaA}.jpg`,
    ]);
    expect(releaseA).toHaveBeenCalledTimes(1);
  });

  it('A2 acquires and releases every distinct source exactly once while preserving high-quality authoritative input', async () => {
    const releases = new Map<string, jest.Mock>([[mediaA, jest.fn(async () => undefined)], [mediaB, jest.fn(async () => undefined)]]);
    mockExportSources.acquirePrivateExportSource.mockImplementation(async ({ mediaId }: { mediaId: string }) => source(mediaId, releases.get(mediaId)!));
    await expect(render(mediaA, mediaB)).resolves.toBeInstanceOf(Uint8Array);
    expect(mockPreviewCache.loadPrivatePreview).not.toHaveBeenCalled();
    expect(mockExportSources.acquirePrivateExportSource).toHaveBeenCalledTimes(2);
    expect(releases.get(mediaA)).toHaveBeenCalledTimes(1);
    expect(releases.get(mediaB)).toHaveBeenCalledTimes(1);
    const plan = mockOffscreen.renderCompositionOffscreen.mock.calls[0]?.[0] as { canvas: { width: number; height: number }; commands: readonly { type: string; source?: string }[] };
    expect(plan.canvas).toEqual({ width: 1080, height: 1920 });
    expect(plan.commands.filter((command) => command.type === 'image').map((command) => command.source)).toEqual([
      `file:///private/original-4000x3000-${mediaA}.jpg`, `file:///private/original-4000x3000-${mediaB}.jpg`,
    ]);
  });

  it('A3 releases an already acquired source once when a later unique acquisition fails and never starts render', async () => {
    const releaseA = jest.fn(async () => undefined);
    mockExportSources.acquirePrivateExportSource.mockImplementation(async ({ mediaId }: { mediaId: string }) => {
      if (mediaId === mediaA) return source(mediaA, releaseA);
      throw new Error('synthetic acquisition failure');
    });
    await expect(render(mediaA, mediaB)).rejects.toThrow('synthetic acquisition failure');
    expect(releaseA).toHaveBeenCalledTimes(1);
    expect(mockOffscreen.renderCompositionOffscreen).not.toHaveBeenCalled();
  });

  it('A4 releases all acquired sources exactly once when render/encode fails', async () => {
    const releaseA = jest.fn(async () => undefined);
    const releaseB = jest.fn(async () => undefined);
    mockExportSources.acquirePrivateExportSource.mockImplementation(async ({ mediaId }: { mediaId: string }) => source(mediaId, mediaId === mediaA ? releaseA : releaseB));
    mockOffscreen.renderCompositionOffscreen.mockRejectedValueOnce(new Error('synthetic render/encode failure'));
    await expect(render(mediaA, mediaB)).rejects.toThrow('synthetic render/encode failure');
    expect(releaseA).toHaveBeenCalledTimes(1);
    expect(releaseB).toHaveBeenCalledTimes(1);
  });
});
