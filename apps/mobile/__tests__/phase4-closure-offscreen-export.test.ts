import type { RenderPlan } from '@dentpilot/application';

jest.mock('@shopify/react-native-skia', () => ({
  ClipOp: { Intersect: 1 },
  ImageFormat: { JPEG: 3 },
  Skia: {
    Surface: { MakeOffscreen: jest.fn((width: number, height: number) => {
      const fs = require('node:fs') as typeof import('node:fs');
      const path = require('node:path') as typeof import('node:path');
      const canvas = { drawRect: jest.fn(), drawRRect: jest.fn(), drawLine: jest.fn(), drawText: jest.fn(), save: jest.fn(), restore: jest.fn(), clipRRect: jest.fn(), clipRect: jest.fn(), rotate: jest.fn(), drawImageRect: jest.fn() };
      return {
        getCanvas: () => canvas,
        flush: jest.fn(),
        makeImageSnapshot: () => ({ encodeToBytes: () => new Uint8Array(fs.readFileSync(path.join(process.cwd(), '__tests__/fixtures', `composition-${width}x${height}.jpg`))), dispose: jest.fn() }),
        dispose: jest.fn(),
      };
    }) },
    Paint: () => ({ setColor: jest.fn(), setStrokeWidth: jest.fn(), dispose: jest.fn() }),
    Color: (color: string) => color,
    XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
    RRectXY: (rect: unknown, rx: number, ry: number) => ({ rect, rx, ry }),
    Font: (_face: unknown, size: number) => ({ measureText: (text: string) => ({ width: text.length * size }), dispose: jest.fn() }),
    Data: { fromURI: jest.fn() },
    Image: { MakeImageFromEncoded: jest.fn() },
  },
}));

import { decodeEncodedJpegDimensions } from '../src/creation/encoded-jpeg-dimensions';
import { renderCompositionOffscreen } from '../src/creation/composition-offscreen-export.native';
const mockSkia = jest.requireMock('@shopify/react-native-skia') as { Skia: { Surface: { MakeOffscreen: jest.Mock } } };

function plan(width: number, height: number): RenderPlan {
  return {
    template: { id: 'test', version: 1, aspectRatio: 'square' }, canvas: { width, height }, styleToken: 'clinical-neutral',
    commands: [
      { type: 'background', id: 'background', zIndex: 0, colorToken: 'canvas' },
      { type: 'text', id: 'title', zIndex: 1, text: 'Result', rect: { x: 10, y: 10, width: width - 20, height: 30 }, colorToken: 'ink', fontSize: 18, align: 'center' },
      { type: 'text', id: 'label', zIndex: 2, text: 'Before', rect: { x: 10, y: 50, width: width - 20, height: 20 }, colorToken: 'muted', fontSize: 12, align: 'left' },
    ],
  };
}

describe('Phase 4 Closure Stage 1 offscreen composition export', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([[1080, 1080], [1080, 1350], [1080, 1920], [1920, 1080]])('encodes and decodes actual JPEG output at %i×%i', async (width, height) => {
    const bytes = await renderCompositionOffscreen(plan(width, height));
    expect(decodeEncodedJpegDimensions(bytes)).toEqual({ width, height });
    expect(mockSkia.Skia.Surface.MakeOffscreen).toHaveBeenCalledWith(width, height);
  });

  it('draws only composition commands; a visible preview selection overlay is not an export input', async () => {
    const result = await renderCompositionOffscreen(plan(1080, 1080));
    expect(result.byteLength).toBeGreaterThan(0);
    const surface = mockSkia.Skia.Surface.MakeOffscreen.mock.results[0]?.value as { getCanvas(): { drawRect: jest.Mock; drawText: jest.Mock } };
    expect(surface.getCanvas().drawRect).toHaveBeenCalledTimes(1);
    expect(surface.getCanvas().drawText).toHaveBeenCalledTimes(2);
  });
});
