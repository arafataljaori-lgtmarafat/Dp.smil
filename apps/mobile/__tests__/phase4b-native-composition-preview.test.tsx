import type { RenderPlan } from '@dentpilot/application';
import { act, create } from 'react-test-renderer';

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

import { NativeCompositionPreview } from '../src/creation/native-composition-preview';
const mockSkia = jest.requireMock('@shopify/react-native-skia') as { useFont: jest.Mock };

const plan: RenderPlan = {
  template: { id: 'clean-side-by-side', version: 1, aspectRatio: 'square' },
  canvas: { width: 300, height: 300 },
  styleToken: 'clinical-neutral',
  commands: [
    { type: 'background', id: 'background', zIndex: 0, colorToken: 'canvas' },
    {
      type: 'image', id: 'before', zIndex: 10, bindingKey: 'before', mediaId: 'before-id', source: 'file:///private/before.jpg',
      destination: { x: 10, y: 10, width: 130, height: 200 }, clip: { x: 10, y: 10, width: 130, height: 200 }, cornerRadius: 8,
      transform: { scale: 1, rotationDegrees: 0, translateX: 0, translateY: 0 }, fit: 'cover',
    },
    { type: 'divider', id: 'divider', zIndex: 20, start: { x: 150, y: 10 }, end: { x: 150, y: 290 }, colorToken: 'accent', width: 2 },
    { type: 'text', id: 'label', zIndex: 30, text: 'Before', rect: { x: 10, y: 10, width: 130, height: 24 }, colorToken: 'ink', fontSize: 14, align: 'left' },
    { type: 'text', id: 'title', zIndex: 31, text: 'Result', rect: { x: 10, y: 40, width: 280, height: 32 }, colorToken: 'ink', fontSize: 22, align: 'center' },
  ],
};

describe('Phase 4B NativeCompositionPreview', () => {
  it('adapts a resolved render plan to a native Skia canvas without interpreting template data', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<NativeCompositionPreview plan={plan} width={300} height={300} />);
    });
    expect(tree!.root.findAllByProps({ accessibilityLabel: 'Dental before and after composition preview' }).length).toBeGreaterThan(0);
    expect(tree!.root.findAllByProps({ x: 10, y: 10, width: 130, height: 200 }).length).toBeGreaterThan(0);
    expect(tree!.root.findAllByProps({ text: 'Before' }).length).toBeGreaterThan(0);
    expect(tree!.root.findAllByProps({ text: 'Result' }).length).toBeGreaterThan(0);
    expect(tree!.root.findAllByProps({ strokeWidth: 2 }).length).toBeGreaterThan(0);
    expect(mockSkia.useFont).toHaveBeenCalledWith(null, 14);
    expect(mockSkia.useFont).toHaveBeenCalledWith(null, 22);
  });
});
