import React from 'react';
import { render, act, waitFor, fireEvent } from '@testing-library/react-native';
import { NativeVideoPreview } from '../src/creation/video-preview.native';
import { useVideoPreviewSession, PreviewSessionIdentity, WorkspaceMediaMetadata } from '../src/creation/use-video-preview-session';
import { AppState, View, Text, AppStateStatus } from 'react-native';
import * as previewCache from '../src/creation/protected-preview-cache';
import type { VideoCompositionDocument, VideoTemplateDefinition } from '@dentpilot/contracts';

jest.mock('@dentpilot/application', () => ({
  ...jest.requireActual('@dentpilot/application'),
  resolveVideoTemplateDurationMs: () => 4000,
  evaluateVideoCompositionAtTime: () => ({
    canvas: { width: 1080, height: 1920 },
    styleToken: 'clinical-neutral',
    commands: []
  }),
}));

jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const component = (name: string) => ({ children, ...props }: { readonly children?: React.ReactNode }) => React.createElement(name, props, children);
  return {
    Canvas: component('Canvas'),
    Group: component('Group'),
    Image: component('Image'),
    Line: component('Line'),
    Rect: component('Rect'),
    RoundedRect: component('RoundedRect'),
    Text: component('Text'),
    useImage: () => ({ width: () => 10, height: () => 10 }),
    useFont: jest.fn((_source: unknown, size: number) => ({ measureText: (text: string) => ({ width: text.length * size }) })),
    useCanvasRef: () => ({ current: { makeImageSnapshotAsync: async () => ({ encodeToBytes: () => new Uint8Array([0xff, 0xd8, 0xff]) }) } }),
    ImageFormat: { JPEG: 3 },
    Skia: {
      XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
      RRectXY: (rect: unknown, rx: number, ry: number) => ({ rect, rx, ry }),
    },
  };
});

jest.mock('../src/creation/protected-preview-cache', () => ({
  loadPrivatePreview: jest.fn(),
}));

describe('Gate C & E - Video Preview Session & Lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useVideoPreviewSession (Gate C, F3, F4, F9)', () => {
    type TestProps = {
        readonly document: VideoCompositionDocument;
        readonly template: VideoTemplateDefinition;
        readonly identity: PreviewSessionIdentity;
        readonly graph: Record<string, WorkspaceMediaMetadata>;
    };
    function TestHook({ document, template, identity, graph }: TestProps) {
      const state = useVideoPreviewSession('account-1', identity, document, template, graph);
      return <View testID="state"><Text>{JSON.stringify(state)}</Text></View>;
    }

    const baseIdentity: PreviewSessionIdentity = { projectId: 'p1', revisionId: 'r1', templateId: 't1', templateVersion: 1 };
    const baseDoc: VideoCompositionDocument = {
      schemaVersion: 1, durationMs: 4000, templateRef: { templateId: 't', templateVersion: 1 },
      canvas: { aspectRatioKey: 'portrait_4_5' }, styleState: { theme: 'clinical-neutral' },
      editableTextState: {}, assetBindings: { before: { mediaId: 'media-1', keyFrameIndex: 0 }, after: { mediaId: 'media-1', keyFrameIndex: 0 } } as any, 
      renderProfile: { profileKey: 'preview' }, audioRef: null,
    };
    const baseTemp: VideoTemplateDefinition = {
      id: 't', version: 1, aspectRatio: 'portrait_4_5', allowedStyleTokens: ['clinical-neutral'],
      audio: { acceptsAudioReference: false }, background: { colorToken: 'canvas' }, 
      segments: [{ bindingKey: 'before' } as any, { bindingKey: 'after' } as any], 
      transitions: [], overlays: [], 
    };

    it('F4: deduplicates mediaId requests across multiple bindings', async () => {
      let resolveLoad: ((val: string) => void) | undefined;
      (previewCache.loadPrivatePreview as jest.Mock).mockImplementation(() => {
        return new Promise<string>(r => { resolveLoad = r; });
      });

      const graph = { 'media-1': { mediaId: 'media-1', originalWidth: 2000, originalHeight: 3000 } };

      const { getByText } = render(<TestHook document={baseDoc} template={baseTemp} identity={baseIdentity} graph={graph} />);
      
      expect(getByText(/"state":"LOADING"/)).toBeTruthy();
      expect(previewCache.loadPrivatePreview).toHaveBeenCalledTimes(1);
      
      await act(async () => {
        resolveLoad?.('file://mock-uri');
      });

      expect(getByText(/"bindingKey":"before"/)).toBeTruthy();
      expect(getByText(/"bindingKey":"after"/)).toBeTruthy();
      expect(getByText(/"source":"file:\/\/mock-uri"/)).toBeTruthy();
    });

    it('F3: injects actual dimensions and rejects missing metadata', async () => {
      const graph = { 'media-1': { mediaId: 'media-1', originalWidth: 0, originalHeight: 0 } };
      const { getByText } = render(<TestHook document={baseDoc} template={baseTemp} identity={baseIdentity} graph={graph} />);
      
      await waitFor(() => {
        expect(getByText(/"state":"ERROR"/)).toBeTruthy();
      });
      expect(getByText(/"classification":"invalid_dimensions"/)).toBeTruthy();
    });

    it('F9: reports missing_media error if binding is absent', async () => {
      const docMissing = { ...baseDoc, assetBindings: {} as any };
      const graph = { 'media-1': { mediaId: 'media-1', originalWidth: 100, originalHeight: 100 } };
      const { getByText } = render(<TestHook document={docMissing} template={baseTemp} identity={baseIdentity} graph={graph} />);
      
      await waitFor(() => {
        expect(getByText(/"state":"ERROR"/)).toBeTruthy();
      });
      expect(getByText(/"classification":"missing_media"/)).toBeTruthy();
    });
  });

  describe('NativeVideoPreview (Gate D, E, F7, F8, F10)', () => {
    it('pauses on background and stays paused', async () => {
      let appStateListener: ((state: AppStateStatus) => void) | undefined;
      jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
        if (event === 'change') appStateListener = handler as (state: AppStateStatus) => void;
        return { remove: jest.fn() } as unknown as any;
      });

      const mockDocument: VideoCompositionDocument = {
        schemaVersion: 1, durationMs: 4000, templateRef: { templateId: 't', templateVersion: 1 },
        canvas: { aspectRatioKey: 'portrait_4_5' }, styleState: { theme: 'clinical-neutral' },
        editableTextState: {}, 
        assetBindings: { before: { mediaId: 'm1', keyFrameIndex: 0 } } as any, 
        renderProfile: { profileKey: 'preview' }, audioRef: null,
      };
      const mockTemplate: VideoTemplateDefinition = {
        id: 't', version: 1, aspectRatio: 'portrait_4_5', allowedStyleTokens: ['clinical-neutral'],
        audio: { acceptsAudioReference: false }, background: { colorToken: 'canvas' }, 
        segments: [{ bindingKey: 'before' } as any], 
        transitions: [], overlays: [], 
      };
      const mockAssets = [{ bindingKey: 'before' as any, mediaId: 'm1', source: 'uri', width: 100, height: 100 }];

      const { getByText } = render(<NativeVideoPreview document={mockDocument} template={mockTemplate} assets={mockAssets} width={100} height={100} />);
      
      await waitFor(() => expect(getByText('Play')).toBeTruthy());
      
      act(() => {
        fireEvent.press(getByText('Play'));
      });
      
      await waitFor(() => expect(getByText('Pause')).toBeTruthy());
      
      act(() => {
        appStateListener?.('background');
      });
      
      await waitFor(() => expect(getByText('Play')).toBeTruthy());

      act(() => {
        appStateListener?.('active');
      });

      await waitFor(() => expect(getByText('Play')).toBeTruthy());
    });
  });
});
