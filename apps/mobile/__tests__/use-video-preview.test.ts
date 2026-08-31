import { renderHook, act } from '@testing-library/react-native';
import { useVideoPreview } from '../src/creation/use-video-preview';
import type { VideoCompositionDocument, VideoTemplateDefinition } from '@dentpilot/contracts';
import type { RenderTarget } from '@dentpilot/application';

// Mock dependencies
jest.mock('@dentpilot/application', () => ({
  evaluateVideoCompositionAtTime: jest.fn(() => ({ schemaVersion: 1, timeMs: 0, commands: [] })),
  resolveVideoTemplateDurationMs: jest.fn(() => 1000),
  resolveVideoTemplateForDocument: jest.fn((input) => input.template),
}));

import { evaluateVideoCompositionAtTime } from '@dentpilot/application';

describe('useVideoPreview (G2)', () => {
  it('initializes runtime and plan', () => {
    const document: any = { durationMs: 1000 };
    const template: any = { segments: [] };
    const assets: any = [];
    const target: RenderTarget = { width: 800, height: 600 };

    const { result } = renderHook(() => useVideoPreview({ document, template, assets, target }));

    expect(result.current.runtime).not.toBeNull();
    expect(result.current.plan).not.toBeNull();
    expect(evaluateVideoCompositionAtTime).toHaveBeenCalled();
  });
});
