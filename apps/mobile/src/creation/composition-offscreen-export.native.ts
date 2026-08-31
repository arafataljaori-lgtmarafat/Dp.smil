import { ClipOp, ImageFormat, Skia } from '@shopify/react-native-skia';

import type { RenderCommand, RenderPlan } from '@dentpilot/application';
import type { TemplateStyleToken } from '@dentpilot/contracts';

import { assertEncodedJpegDimensions } from './encoded-jpeg-dimensions';

type OffscreenSurface = Exclude<ReturnType<typeof Skia.Surface.MakeOffscreen>, null>;

type Palette = {
  readonly canvas: string;
  readonly surface: string;
  readonly ink: string;
  readonly muted: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly white: string;
};

const palettes: Record<TemplateStyleToken, Palette> = {
  'clinical-neutral': { canvas: '#F7F8F8', surface: '#EEF1F2', ink: '#172229', muted: '#61717A', accent: '#2F7681', accentSoft: '#B5D2D6', white: '#FFFFFF' },
  'clinical-blue': { canvas: '#F5F9FC', surface: '#E7F0F7', ink: '#132737', muted: '#5E7482', accent: '#1E7196', accentSoft: '#A9D2E5', white: '#FFFFFF' },
  'clinical-warm': { canvas: '#FBF8F3', surface: '#F2EDE3', ink: '#302821', muted: '#7A6B5E', accent: '#A46A42', accentSoft: '#E5C9B3', white: '#FFFFFF' },
};

function color(style: TemplateStyleToken, token: string): string {
  return palettes[style][token as keyof Palette] ?? palettes['clinical-neutral'].ink;
}

function dispose(value: { dispose(): void } | null | undefined): void {
  value?.dispose();
}

/**
 * Native-only authoritative export path. Ownership is deliberately narrow: source data and decoded
 * images are released after each command; the surface snapshot, paint and cached per-size fonts are
 * released after JPEG encoding. No React Canvas, editor state, gesture transform or selection overlay
 * enters this renderer.
 */
export async function renderCompositionOffscreen(plan: RenderPlan): Promise<Uint8Array> {
  const surface = Skia.Surface.MakeOffscreen(plan.canvas.width, plan.canvas.height);
  if (surface === null) throw new Error('The native export surface could not be allocated.');
  const paint = Skia.Paint();
  const fonts = new Map<number, ReturnType<typeof Skia.Font>>();
  let snapshot: ReturnType<typeof surface.makeImageSnapshot> | null = null;

  const fontFor = (fontSize: number): ReturnType<typeof Skia.Font> => {
    const existing = fonts.get(fontSize);
    if (existing !== undefined) return existing;
    const next = Skia.Font(undefined, fontSize);
    fonts.set(fontSize, next);
    return next;
  };

  try {
    const canvas = surface.getCanvas();
    for (const command of plan.commands) {
      switch (command.type) {
        case 'background':
          paint.setColor(Skia.Color(color(plan.styleToken, command.colorToken)));
          canvas.drawRect(Skia.XYWHRect(0, 0, plan.canvas.width, plan.canvas.height), paint);
          break;
        case 'shape':
          paint.setColor(Skia.Color(color(plan.styleToken, command.fillToken)));
          if (command.cornerRadius > 0) canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height), command.cornerRadius, command.cornerRadius), paint);
          else canvas.drawRect(Skia.XYWHRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height), paint);
          break;
        case 'divider':
          paint.setColor(Skia.Color(color(plan.styleToken, command.colorToken)));
          paint.setStrokeWidth(command.width);
          canvas.drawLine(command.start.x, command.start.y, command.end.x, command.end.y, paint);
          break;
        case 'text': {
          const font = fontFor(command.fontSize);
          paint.setColor(Skia.Color(color(plan.styleToken, command.colorToken)));
          const measured = font.measureText(command.text).width;
          const x = command.align === 'center'
            ? command.rect.x + (command.rect.width - measured) / 2
            : command.align === 'right'
              ? command.rect.x + command.rect.width - measured
              : command.rect.x;
          canvas.drawText(command.text, x, command.rect.y + command.fontSize, paint, font);
          break;
        }
        case 'image':
          await drawImageCommand(canvas, paint, command);
          break;
      }
    }
    surface.flush();
    snapshot = surface.makeImageSnapshot();
    const encoded = snapshot.encodeToBytes(ImageFormat.JPEG, 95);
    if (encoded.byteLength === 0) throw new Error('The native export encoder produced an empty JPEG.');
    assertEncodedJpegDimensions(encoded, plan.canvas);
    return encoded;
  } finally {
    dispose(snapshot);
    for (const font of fonts.values()) dispose(font);
    dispose(paint);
    dispose(surface);
  }
}

async function drawImageCommand(canvas: ReturnType<OffscreenSurface['getCanvas']>, paint: ReturnType<typeof Skia.Paint>, command: Extract<RenderCommand, { type: 'image' }>): Promise<void> {
  const data = await Skia.Data.fromURI(command.source);
  let image: ReturnType<typeof Skia.Image.MakeImageFromEncoded> | null = null;
  try {
    image = Skia.Image.MakeImageFromEncoded(data);
    if (image === null) throw new Error('The protected export source could not be decoded.');
    const clip = Skia.XYWHRect(command.clip.x, command.clip.y, command.clip.width, command.clip.height);
    const centerX = command.clip.x + command.clip.width / 2;
    const centerY = command.clip.y + command.clip.height / 2;
    canvas.save();
    if (command.cornerRadius > 0) canvas.clipRRect(Skia.RRectXY(clip, command.cornerRadius, command.cornerRadius), ClipOp.Intersect, true);
    else canvas.clipRect(clip, ClipOp.Intersect, true);
    canvas.rotate(command.transform.rotationDegrees, centerX, centerY);
    canvas.drawImageRect(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(command.destination.x, command.destination.y, command.destination.width, command.destination.height), paint);
    canvas.restore();
  } finally {
    dispose(image);
    dispose(data);
  }
}
