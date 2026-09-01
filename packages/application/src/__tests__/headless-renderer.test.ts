import { describe, it, expect } from 'vitest';
import { HeadlessCanvasRenderer } from '../headless-renderer.js';
import type { RenderPlan } from '../composition-engine.js';

describe('HeadlessCanvasRenderer', () => {
  it('renders a full plan without crashing and returns correct buffer size', async () => {
    const renderer = new HeadlessCanvasRenderer();
    const plan: RenderPlan = {
      template: { id: 'test', version: 1, aspectRatio: 'portrait_4_5' },
      canvas: { width: 1080, height: 1920 },
      styleToken: 'clinical-neutral',
      commands: [
        { type: 'background', id: 'bg', zIndex: 0, colorToken: 'surface' },
        { type: 'shape', id: 's', zIndex: 1, rect: { x: 100, y: 100, width: 200, height: 200 }, fillToken: 'accent', cornerRadius: 10 },
        { type: 'text', id: 't', zIndex: 2, rect: { x: 100, y: 350, width: 200, height: 50 }, text: 'Hello', colorToken: 'ink', align: 'left', fontSize: 24 },
        { type: 'divider', id: 'd', zIndex: 3, start: { x: 100, y: 400 }, end: { x: 300, y: 400 }, colorToken: 'muted', width: 2 },
        { 
          type: 'image', id: 'img', zIndex: 4, bindingKey: 'before', mediaId: 'm1', source: 'uri',
          destination: { x: 100, y: 450, width: 200, height: 200 }, clip: { x: 100, y: 450, width: 200, height: 200 }, 
          cornerRadius: 0, transform: { translateX: 0, translateY: 0, scale: 1, rotationDegrees: 0 }, fit: 'cover' 
        }
      ]
    };

    const width = 100;
    const height = 100;
    const buffer = await renderer.renderFrame(plan, width, height);

    // width * height * 4 channels (RGBA)
    expect(buffer.length).toBe(width * height * 4);
    
    // Background surface is #f5f5f5 = 245
    expect(buffer[0]).toBe(245);
    expect(buffer[1]).toBe(245);
    expect(buffer[2]).toBe(245);
    expect(buffer[3]).toBe(255); // Alpha 100%
  });
});
