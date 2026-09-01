import { createCanvas, type Canvas } from '@napi-rs/canvas';
import type { HeadlessRendererPort } from './ports.js';
import type { RenderPlan } from './composition-engine.js';

export class HeadlessCanvasRenderer implements HeadlessRendererPort {
  private readonly colorMap: Record<string, string> = {
    canvas: '#ffffff',
    surface: '#f5f5f5',
    ink: '#111111',
    muted: '#666666',
    accent: '#0070f3',
    accentSoft: '#e6f0ff',
    white: '#ffffff',
  };

  private resolveColor(token: string): string {
    return this.colorMap[token] ?? '#000000';
  }

  public async renderFrame(plan: RenderPlan, width: number, height: number): Promise<Uint8Array> {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Default white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Sort items by zIndex ascending
    const commands = [...plan.commands].sort((a, b) => a.zIndex - b.zIndex);

    for (const cmd of commands) {
      ctx.save();
      const opacity = (cmd as { readonly opacity?: number }).opacity ?? 1;
      ctx.globalAlpha = opacity;

      switch (cmd.type) {
        case 'background': {
          ctx.fillStyle = this.resolveColor(cmd.colorToken);
          ctx.fillRect(0, 0, width, height);
          break;
        }

        case 'shape': {
          ctx.fillStyle = this.resolveColor(cmd.fillToken);
          if (cmd.cornerRadius > 0) {
            ctx.beginPath();
            ctx.roundRect(cmd.rect.x, cmd.rect.y, cmd.rect.width, cmd.rect.height, cmd.cornerRadius);
            ctx.fill();
          } else {
            ctx.fillRect(cmd.rect.x, cmd.rect.y, cmd.rect.width, cmd.rect.height);
          }
          break;
        }

        case 'divider': {
          ctx.strokeStyle = this.resolveColor(cmd.colorToken);
          ctx.lineWidth = cmd.width;
          ctx.beginPath();
          ctx.moveTo(cmd.start.x, cmd.start.y);
          ctx.lineTo(cmd.end.x, cmd.end.y);
          ctx.stroke();
          break;
        }

        case 'text': {
          ctx.fillStyle = this.resolveColor(cmd.colorToken);
          ctx.font = `${cmd.fontSize}px Arial, sans-serif`;
          ctx.textAlign = cmd.align;
          ctx.textBaseline = 'top';

          let startX = cmd.rect.x;
          if (cmd.align === 'center') startX += cmd.rect.width / 2;
          else if (cmd.align === 'right') startX += cmd.rect.width;

          ctx.fillText(cmd.text, startX, cmd.rect.y, cmd.rect.width);
          break;
        }

        case 'image': {
          ctx.fillStyle = '#e0e0e0';
          if (cmd.cornerRadius > 0) {
            ctx.beginPath();
            ctx.roundRect(cmd.destination.x, cmd.destination.y, cmd.destination.width, cmd.destination.height, cmd.cornerRadius);
            ctx.fill();
            ctx.clip();
          } else {
            ctx.fillRect(cmd.destination.x, cmd.destination.y, cmd.destination.width, cmd.destination.height);
          }

          // Apply transforms using RenderTransform (translateX, translateY, scale, rotationDegrees)
          if (cmd.transform) {
            const centerX = cmd.destination.x + cmd.destination.width / 2;
            const centerY = cmd.destination.y + cmd.destination.height / 2;
            
            ctx.translate(centerX, centerY);
            ctx.translate(cmd.transform.translateX, cmd.transform.translateY);
            ctx.scale(cmd.transform.scale, cmd.transform.scale);
            if (cmd.transform.rotationDegrees) {
              ctx.rotate((cmd.transform.rotationDegrees * Math.PI) / 180);
            }
            ctx.translate(-centerX, -centerY);
          }

          // Draw a wireframe placeholder cross
          ctx.strokeStyle = '#aaaaaa';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cmd.destination.x, cmd.destination.y);
          ctx.lineTo(cmd.destination.x + cmd.destination.width, cmd.destination.y + cmd.destination.height);
          ctx.moveTo(cmd.destination.x + cmd.destination.width, cmd.destination.y);
          ctx.lineTo(cmd.destination.x, cmd.destination.y + cmd.destination.height);
          ctx.stroke();

          // Write bindingKey
          ctx.fillStyle = '#333333';
          ctx.font = '40px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cmd.bindingKey, cmd.destination.x + cmd.destination.width / 2, cmd.destination.y + cmd.destination.height / 2);
          
          break;
        }
      }

      ctx.restore();
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    return new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength);
  }
}
